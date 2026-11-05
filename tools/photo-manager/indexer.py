"""Scans the photo folder and keeps a local index (SQLite) of every photo and video.

Nothing is uploaded anywhere. Originals are never changed; only small thumbnails
and the index are written, inside the app's own `data` folder.
"""
import hashlib
import json
import os
import re
import sqlite3
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import numpy as np
from PIL import Image, ImageOps

try:  # iPhone HEIC photos (optional)
    import pillow_heif
    pillow_heif.register_heif_opener()
    HEIC_OK = True
except Exception:  # pragma: no cover
    HEIC_OK = False

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None

Image.MAX_IMAGE_PIXELS = None

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, "data")
THUMB_DIR = os.path.join(DATA_DIR, "thumbs")
FACE_DIR = os.path.join(DATA_DIR, "faces")
MODEL_DIR = os.path.join(DATA_DIR, "models")
DB_PATH = os.path.join(DATA_DIR, "library.db")
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tif", ".tiff",
             ".heic", ".heif", ".jfif"}
VIDEO_EXT = {".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".m4v",
             ".3gp", ".mts", ".m2ts", ".mpg", ".mpeg"}

THUMB_SIZE = 360
FACE_MATCH = 0.42          # cosine similarity needed to call two faces the same person
MIN_FACE_PX = 40

MODELS = {
    "face_detection_yunet_2023mar.onnx": [
        "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    ],
    "face_recognition_sface_2021dec.onnx": [
        "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    ],
}

for d in (DATA_DIR, THUMB_DIR, FACE_DIR, MODEL_DIR):
    os.makedirs(d, exist_ok=True)


# ---------------------------------------------------------------- config / db
def load_config():
    cfg = {"folder": r"D:\00" if os.name == "nt" else os.path.expanduser("~/Pictures"),
           "faces": True}
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except Exception:
        pass
    return cfg


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def db():
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db():
    con = db()
    con.executescript("""
    CREATE TABLE IF NOT EXISTS media (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        folder TEXT, name TEXT, ext TEXT, kind TEXT,
        size INTEGER, mtime REAL,
        taken TEXT, taken_src TEXT,
        width INTEGER, height INTEGER, duration REAL,
        sha1 TEXT, dhash INTEGER,
        key TEXT, has_thumb INTEGER DEFAULT 0,
        faces_done INTEGER DEFAULT 0,
        seen INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ix_media_taken ON media(taken);
    CREATE INDEX IF NOT EXISTS ix_media_size ON media(size);
    CREATE INDEX IF NOT EXISTS ix_media_sha1 ON media(sha1);
    CREATE TABLE IF NOT EXISTS persons (
        id INTEGER PRIMARY KEY,
        name TEXT,
        hidden INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS faces (
        id INTEGER PRIMARY KEY,
        media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
        person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        x INTEGER, y INTEGER, w INTEGER, h INTEGER, score REAL,
        emb BLOB, thumb TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_faces_media ON faces(media_id);
    CREATE INDEX IF NOT EXISTS ix_faces_person ON faces(person_id);
    """)
    con.commit()
    con.close()


# ---------------------------------------------------------------- helpers
DATE_RE = re.compile(
    r"(?<!\d)((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])"
    r"(?:[-_ T.]?([01]\d|2[0-3])[-_.:]?([0-5]\d)[-_.:]?([0-5]\d))?(?!\d)")


def date_from_name(name):
    m = DATE_RE.search(name)
    if not m:
        return None
    y, mo, d, h, mi, s = m.groups()
    try:
        dt = datetime(int(y), int(mo), int(d), int(h or 0), int(mi or 0), int(s or 0))
    except ValueError:
        return None
    if dt.year < 1990 or dt > datetime.now():
        return None
    return dt


def exif_date(img):
    try:
        ex = img.getexif()
        val = None
        try:
            sub = ex.get_ifd(0x8769)
            val = sub.get(36867) or sub.get(36868)
        except Exception:
            pass
        val = val or ex.get(306)
        if val:
            val = str(val).strip().replace("\x00", "")
            return datetime.strptime(val[:19], "%Y:%m:%d %H:%M:%S")
    except Exception:
        pass
    return None


def dhash(img):
    g = img.convert("L").resize((9, 8), Image.LANCZOS)
    a = np.asarray(g, dtype=np.int16)
    bits = (a[:, 1:] > a[:, :-1]).flatten()
    v = 0
    for b in bits:
        v = (v << 1) | int(b)
    if v >= 1 << 63:  # store as signed 64-bit for SQLite
        v -= 1 << 64
    return v


def file_sha1(path, chunk=4 << 20):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def path_key(path):
    return hashlib.md5(path.lower().encode("utf-8", "surrogatepass")).hexdigest()


def download_models(progress=None):
    ok = True
    for name, urls in MODELS.items():
        dest = os.path.join(MODEL_DIR, name)
        if os.path.exists(dest) and os.path.getsize(dest) > 100_000:
            continue
        if progress:
            progress(f"Face model download हो रहा है: {name}")
        got = False
        for url in urls:
            try:
                tmp = dest + ".part"
                urllib.request.urlretrieve(url, tmp)
                if os.path.getsize(tmp) > 100_000:
                    os.replace(tmp, dest)
                    got = True
                    break
            except Exception:
                continue
        ok = ok and got
    return ok


# ---------------------------------------------------------------- face engine
_local = threading.local()


def face_engine():
    if cv2 is None:
        return None
    eng = getattr(_local, "eng", None)
    if eng is None:
        det_p = os.path.join(MODEL_DIR, "face_detection_yunet_2023mar.onnx")
        rec_p = os.path.join(MODEL_DIR, "face_recognition_sface_2021dec.onnx")
        if not (os.path.exists(det_p) and os.path.exists(rec_p)):
            return None
        det = cv2.FaceDetectorYN.create(det_p, "", (320, 320), 0.85, 0.3, 5000)
        rec = cv2.FaceRecognizerSF.create(rec_p, "")
        eng = _local.eng = (det, rec)
    return eng


def find_faces(rgb, key):
    """rgb: numpy HxWx3 RGB. Returns list of dicts with embeddings and saved face crops."""
    eng = face_engine()
    if eng is None:
        return []
    det, rec = eng
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    scale = min(1.0, 1280 / max(h, w))
    if scale < 1:
        bgr = cv2.resize(bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    h, w = bgr.shape[:2]
    det.setInputSize((w, h))
    _, found = det.detect(bgr)
    out = []
    if found is None:
        return out
    for i, f in enumerate(found):
        x, y, fw, fh = [int(v) for v in f[:4]]
        if fw < MIN_FACE_PX or fh < MIN_FACE_PX:
            continue
        try:
            aligned = rec.alignCrop(bgr, f)
            emb = rec.feature(aligned).flatten().astype(np.float32)
        except Exception:
            continue
        n = np.linalg.norm(emb)
        if n == 0:
            continue
        emb /= n
        # square crop with some margin for the people page
        cx, cy, side = x + fw / 2, y + fh / 2, max(fw, fh) * 1.5
        x0, y0 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
        x1, y1 = int(min(w, cx + side / 2)), int(min(h, cy + side / 2))
        crop = bgr[y0:y1, x0:x1]
        thumb = f"{key}_{i}.jpg"
        if crop.size:
            crop = cv2.resize(crop, (160, 160), interpolation=cv2.INTER_AREA)
            cv2.imwrite(os.path.join(FACE_DIR, thumb), crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
        out.append({"x": int(x / scale), "y": int(y / scale), "w": int(fw / scale),
                    "h": int(fh / scale), "score": float(f[-1]), "emb": emb, "thumb": thumb})
    return out


# ---------------------------------------------------------------- per-file work
def process_file(path, kind, do_faces):
    """Runs in a worker thread. Reads one file and returns what to store."""
    st = os.stat(path)
    key = path_key(path)
    res = {"path": path, "kind": kind, "size": st.st_size, "mtime": st.st_mtime, "key": key,
           "taken": None, "taken_src": None, "width": None, "height": None,
           "duration": None, "dhash": None, "has_thumb": 0, "faces": None}
    name = os.path.basename(path)
    rgb = None
    if kind == "photo":
        try:
            with Image.open(path) as im:
                dt = exif_date(im)
                if dt:
                    res["taken"], res["taken_src"] = dt, "exif"
                w, h = im.size
                try:
                    if im.getexif().get(274, 1) in (5, 6, 7, 8):  # rotated 90°
                        w, h = h, w
                except Exception:
                    pass
                res["width"], res["height"] = w, h
                im.draft("RGB", (1600, 1600))  # fast JPEG decode at lower size
                im = ImageOps.exif_transpose(im).convert("RGB")
                res["dhash"] = dhash(im)
                big = im.copy()
                big.thumbnail((1600, 1600))
                im.thumbnail((THUMB_SIZE, THUMB_SIZE))
                im.save(os.path.join(THUMB_DIR, key + ".jpg"), "JPEG", quality=82)
                res["has_thumb"] = 1
                if do_faces:
                    rgb = np.asarray(big)
        except Exception:
            pass
    else:
        if cv2 is not None:
            try:
                cap = cv2.VideoCapture(path)
                fps = cap.get(cv2.CAP_PROP_FPS) or 0
                frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
                res["width"] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or None
                res["height"] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or None
                if fps > 0 and frames > 0:
                    res["duration"] = frames / fps
                    cap.set(cv2.CAP_PROP_POS_FRAMES, int(frames * 0.1))
                ok, frame = cap.read()
                cap.release()
                if ok and frame is not None:
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    im = Image.fromarray(frame_rgb)
                    res["dhash"] = None  # video frames are not compared as photos
                    im.thumbnail((THUMB_SIZE, THUMB_SIZE))
                    im.save(os.path.join(THUMB_DIR, key + ".jpg"), "JPEG", quality=80)
                    res["has_thumb"] = 1
                    if do_faces:
                        rgb = frame_rgb
            except Exception:
                pass
    if not res["taken"]:
        dt = date_from_name(name)
        if dt:
            res["taken"], res["taken_src"] = dt, "name"
        else:
            res["taken"], res["taken_src"] = datetime.fromtimestamp(st.st_mtime), "file"
    res["taken"] = res["taken"].strftime("%Y-%m-%d %H:%M:%S")
    if do_faces and rgb is not None:
        try:
            res["faces"] = find_faces(rgb, key)
        except Exception:
            res["faces"] = []
    elif do_faces:
        res["faces"] = []
    return res


# ---------------------------------------------------------------- face clustering
class Clusters:
    """Keeps a running average face for every person, to match new faces quickly."""

    def __init__(self, con):
        self.ids, self.sums, self.counts = [], [], []
        rows = con.execute(
            "SELECT person_id, emb FROM faces WHERE person_id IS NOT NULL AND emb IS NOT NULL").fetchall()
        acc = {}
        for r in rows:
            e = np.frombuffer(r["emb"], dtype=np.float32)
            if r["person_id"] in acc:
                acc[r["person_id"]][0] += e
                acc[r["person_id"]][1] += 1
            else:
                acc[r["person_id"]] = [e.copy(), 1]
        for pid, (s, c) in acc.items():
            self.ids.append(pid)
            self.sums.append(s)
            self.counts.append(c)
        self._mat = None

    def _matrix(self):
        if self._mat is None:
            if self.sums:
                m = np.stack(self.sums)
                self._mat = m / np.linalg.norm(m, axis=1, keepdims=True)
            else:
                self._mat = np.zeros((0, 128), np.float32)
        return self._mat

    def assign(self, con, emb):
        m = self._matrix()
        if len(m):
            sims = m @ emb
            j = int(np.argmax(sims))
            if sims[j] >= FACE_MATCH:
                self.sums[j] = self.sums[j] + emb
                self.counts[j] += 1
                self._mat = None
                return self.ids[j]
        cur = con.execute("INSERT INTO persons(name) VALUES (NULL)")
        self.ids.append(cur.lastrowid)
        self.sums.append(emb.copy())
        self.counts.append(1)
        self._mat = None
        return cur.lastrowid


# ---------------------------------------------------------------- scanner
class Scanner:
    def __init__(self):
        self.lock = threading.Lock()
        self.status = {"running": False, "phase": "idle", "done": 0, "total": 0,
                       "message": "", "finished_at": None, "error": None}
        self._stop = False

    def _set(self, **kw):
        with self.lock:
            self.status.update(kw)

    def get(self):
        with self.lock:
            return dict(self.status)

    def stop(self):
        self._stop = True

    def start(self):
        with self.lock:
            if self.status["running"]:
                return False
            self.status.update(running=True, phase="start", done=0, total=0,
                               message="शुरू हो रहा है…", error=None)
        self._stop = False
        threading.Thread(target=self._run, daemon=True).start()
        return True

    def _run(self):
        try:
            self._scan()
        except Exception as e:  # pragma: no cover
            self._set(error=str(e), message=f"गड़बड़: {e}")
        finally:
            self._set(running=False, phase="idle", finished_at=time.time())

    def _scan(self):
        cfg = load_config()
        root = cfg["folder"]
        if not os.path.isdir(root):
            self._set(error="folder नहीं मिला", message=f"Folder नहीं मिला: {root}")
            return
        do_faces = bool(cfg.get("faces", True)) and cv2 is not None
        if do_faces:
            if not download_models(lambda m: self._set(message=m)):
                do_faces = False
                self._set(message="Face model download नहीं हुआ (internet?). चेहरे वाला हिस्सा छोड़ रहे हैं।")

        # 1. list files
        self._set(phase="list", message="Files गिन रहे हैं…")
        files = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not d.startswith(("$", "."))
                           and d.lower() != "system volume information"]
            for fn in filenames:
                ext = os.path.splitext(fn)[1].lower()
                kind = "photo" if ext in PHOTO_EXT else "video" if ext in VIDEO_EXT else None
                if kind:
                    files.append((os.path.join(dirpath, fn), kind))

        con = db()
        known = {r["path"]: r for r in con.execute(
            "SELECT id, path, size, mtime, faces_done FROM media")}
        con.execute("UPDATE media SET seen=0")
        todo = []
        seen_ids = []
        for p, kind in files:
            r = known.get(p)
            try:
                st = os.stat(p)
            except OSError:
                continue
            if r and r["size"] == st.st_size and abs(r["mtime"] - st.st_mtime) < 1 \
                    and (r["faces_done"] or not do_faces):
                seen_ids.append(r["id"])
            else:
                todo.append((p, kind))
        for i in range(0, len(seen_ids), 500):
            chunk = seen_ids[i:i + 500]
            con.execute(f"UPDATE media SET seen=1 WHERE id IN ({','.join('?' * len(chunk))})", chunk)
        con.commit()

        # 2. read new / changed files
        self._set(phase="read", done=0, total=len(todo),
                  message=f"{len(files)} files मिलीं, {len(todo)} नई/बदली हुई पढ़ रहे हैं…")
        clusters = Clusters(con)
        workers = max(2, min(6, (os.cpu_count() or 4) - 1))
        with ThreadPoolExecutor(workers) as pool:
            batch = 64
            for i in range(0, len(todo), batch):
                if self._stop:
                    break
                part = todo[i:i + batch]
                for res in pool.map(lambda t: _safe(process_file, t[0], t[1], do_faces), part):
                    if res:
                        self._store(con, res, clusters)
                con.commit()
                self._set(done=min(i + batch, len(todo)))

        if self._stop:
            con.close()
            self._set(message="रोक दिया गया।")
            return

        # 3. forget files that no longer exist
        gone = con.execute("SELECT id, key FROM media WHERE seen=0").fetchall()
        for r in gone:
            remove_cache(con, r["id"], r["key"])
        con.execute("DELETE FROM media WHERE seen=0")
        cleanup_persons(con)
        con.commit()

        # 4. exact duplicates: hash only files that share a size with another file
        self._set(phase="hash", message="Duplicate check हो रहा है…", done=0)
        rows = con.execute("""SELECT id, path FROM media WHERE sha1 IS NULL AND size IN
                              (SELECT size FROM media GROUP BY size HAVING COUNT(*) > 1)""").fetchall()
        self._set(total=len(rows))
        for n, r in enumerate(rows):
            if self._stop:
                break
            try:
                con.execute("UPDATE media SET sha1=? WHERE id=?", (file_sha1(r["path"]), r["id"]))
            except OSError:
                pass
            if n % 20 == 0:
                con.commit()
                self._set(done=n + 1)
        con.commit()
        total = con.execute("SELECT COUNT(*) FROM media").fetchone()[0]
        con.close()
        self._set(message=f"हो गया! कुल {total} photos/videos।", done=len(rows))

    def _store(self, con, r, clusters):
        folder, name = os.path.split(r["path"])
        old = con.execute("SELECT id FROM media WHERE path=?", (r["path"],)).fetchone()
        vals = (folder, name, os.path.splitext(name)[1].lower(), r["kind"], r["size"], r["mtime"],
                r["taken"], r["taken_src"], r["width"], r["height"], r["duration"], r["dhash"],
                r["key"], r["has_thumb"], 1 if r["faces"] is not None else 0)
        if old:
            mid = old["id"]
            con.execute("""UPDATE media SET folder=?, name=?, ext=?, kind=?, size=?, mtime=?, taken=?,
                           taken_src=?, width=?, height=?, duration=?, dhash=?, key=?, has_thumb=?,
                           faces_done=?, sha1=NULL, seen=1 WHERE id=?""", vals + (mid,))
            if r["faces"] is not None:
                con.execute("DELETE FROM faces WHERE media_id=?", (mid,))
        else:
            cur = con.execute("""INSERT INTO media(folder, name, ext, kind, size, mtime, taken, taken_src,
                                 width, height, duration, dhash, key, has_thumb, faces_done, path, seen)
                                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)""", vals + (r["path"],))
            mid = cur.lastrowid
        for f in r["faces"] or []:
            pid = clusters.assign(con, f["emb"])
            con.execute("""INSERT INTO faces(media_id, person_id, x, y, w, h, score, emb, thumb)
                           VALUES (?,?,?,?,?,?,?,?,?)""",
                        (mid, pid, f["x"], f["y"], f["w"], f["h"], f["score"],
                         f["emb"].tobytes(), f["thumb"]))


def _safe(fn, *a):
    try:
        return fn(*a)
    except Exception:
        return None


def remove_cache(con, media_id, key):
    for r in con.execute("SELECT thumb FROM faces WHERE media_id=?", (media_id,)):
        try:
            os.remove(os.path.join(FACE_DIR, r["thumb"]))
        except OSError:
            pass
    try:
        os.remove(os.path.join(THUMB_DIR, key + ".jpg"))
    except OSError:
        pass


def cleanup_persons(con):
    con.execute("""DELETE FROM persons WHERE id NOT IN
                   (SELECT DISTINCT person_id FROM faces WHERE person_id IS NOT NULL)""")


# ---------------------------------------------------------------- similar photos
def popcount64(x):
    if hasattr(np, "bitwise_count"):
        return np.bitwise_count(x)
    x = x.view(np.uint8).reshape(-1, 8)
    table = np.array([bin(i).count("1") for i in range(256)], dtype=np.uint8)
    return table[x].sum(axis=1)


def similar_groups(rows, threshold=4):
    """rows: list of (id, dhash). Groups photos whose dHash differs by <= threshold bits."""
    if not rows:
        return []
    ids = np.array([r[0] for r in rows])
    hs = np.array([r[1] for r in rows], dtype=np.int64).view(np.uint64)
    parent = list(range(len(ids)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for i in range(len(hs) - 1):
        d = popcount64(hs[i + 1:] ^ hs[i])
        for j in np.nonzero(d <= threshold)[0]:
            a, b = find(i), find(i + 1 + int(j))
            if a != b:
                parent[b] = a
    groups = {}
    for i in range(len(ids)):
        groups.setdefault(find(i), []).append(int(ids[i]))
    return [g for g in groups.values() if len(g) > 1]
