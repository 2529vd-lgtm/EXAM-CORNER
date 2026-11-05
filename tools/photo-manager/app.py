"""Photo Manager: a website that runs only on your own laptop.

Run:  python app.py      then open http://127.0.0.1:8765
"""
import io
import os
import re
import shutil
import subprocess
import sys
import threading
import webbrowser

import numpy as np
from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from PIL import Image, ImageOps

import indexer as ix

try:
    from send2trash import send2trash
except Exception:  # pragma: no cover
    send2trash = None

PORT = int(os.environ.get("PHOTO_PORT", "8765"))
BROWSER_OK = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".jfif"}
VIDEO_BROWSER_OK = {".mp4", ".webm", ".m4v", ".mov"}

app = Flask(__name__, static_folder="static", static_url_path="/static")
scanner = ix.Scanner()
ix.init_db()

ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
ALLOWED_ORIGINS = {f"http://{h}" for h in ALLOWED_HOSTS}


@app.before_request
def only_this_laptop():
    """Block other websites open in the browser from reaching this app.

    - Host check stops "DNS rebinding" (a web page pretending to be 127.0.0.1 to read photos).
    - Changes (POST) must come from this app's own page with a JSON body, so a
      different website can't trigger delete/scan/settings in the background.
    """
    if request.remote_addr not in ("127.0.0.1", "::1"):
        abort(403)
    if request.host not in ALLOWED_HOSTS:
        abort(403)
    if request.method != "GET":
        origin = request.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            abort(403)
        if request.mimetype != "application/json":
            abort(403)


@app.after_request
def no_framing(resp):
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    return resp


def media_out(r):
    return {"id": r["id"], "name": r["name"], "folder": r["folder"], "kind": r["kind"],
            "ext": r["ext"], "size": r["size"], "taken": r["taken"], "taken_src": r["taken_src"],
            "width": r["width"], "height": r["height"], "duration": r["duration"],
            "has_thumb": r["has_thumb"]}


# ---------------------------------------------------------------- pages
@app.route("/")
def home():
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------- config / scan
@app.route("/api/config", methods=["GET", "POST"])
def config():
    cfg = ix.load_config()
    if request.method == "POST":
        body = request.get_json(force=True) or {}
        if "folder" in body:
            folder = str(body["folder"]).strip().strip('"')
            if not os.path.isdir(folder):
                return jsonify(ok=False, error=f"यह folder नहीं मिला: {folder}"), 400
            cfg["folder"] = folder
        if "faces" in body:
            cfg["faces"] = bool(body["faces"])
        if "export_folder" in body:
            dest = str(body["export_folder"]).strip().strip('"')
            if dest and _inside(cfg["folder"], dest):
                return jsonify(ok=False, error="Save वाला folder, photos वाले folder के अंदर नहीं हो सकता "
                                               "(वरना हर copy duplicate दिखेगी)। कोई दूसरा folder चुनिए।"), 400
            cfg["export_folder"] = dest
        ix.save_config(cfg)
    cfg["folder_exists"] = os.path.isdir(cfg["folder"])
    cfg["export_folder"] = export_folder(cfg)
    return jsonify(cfg)


def export_folder(cfg):
    if cfg.get("export_folder"):
        return cfg["export_folder"]
    root = os.path.normpath(cfg["folder"])
    return os.path.join(os.path.dirname(root), os.path.basename(root) + "-sorted")


def _inside(root, path):
    root = os.path.normcase(os.path.abspath(root))
    path = os.path.normcase(os.path.abspath(path))
    try:
        return os.path.commonpath([root, path]) == root
    except ValueError:  # different drives on Windows
        return False


@app.route("/api/scan", methods=["POST"])
def scan():
    return jsonify(started=scanner.start(), status=scanner.get())


@app.route("/api/scan/stop", methods=["POST"])
def scan_stop():
    scanner.stop()
    return jsonify(ok=True)


@app.route("/api/status")
def status():
    return jsonify(scanner.get())


@app.route("/api/stats")
def stats():
    con = ix.db()
    s = con.execute("""SELECT COUNT(*) n, SUM(kind='photo') photos, SUM(kind='video') videos,
                       COALESCE(SUM(size),0) bytes FROM media""").fetchone()
    years = [dict(r) for r in con.execute(
        "SELECT substr(taken,1,4) y, COUNT(*) n FROM media GROUP BY y ORDER BY y DESC")]
    folders = [dict(r) for r in con.execute(
        "SELECT folder, COUNT(*) n FROM media GROUP BY folder ORDER BY folder")]
    con.close()
    return jsonify(total=s["n"], photos=s["photos"] or 0, videos=s["videos"] or 0,
                   bytes=s["bytes"], years=years, folders=folders)


# ---------------------------------------------------------------- search
SORTS = {
    "new": "taken DESC, id DESC", "old": "taken ASC, id ASC",
    "big": "size DESC", "small": "size ASC", "name": "name COLLATE NOCASE ASC",
}


@app.route("/api/media")
def media():
    a = request.args
    where, args = [], []
    if a.get("q"):
        for word in a["q"].split():
            where.append("(name LIKE ? OR folder LIKE ?)")
            args += [f"%{word}%", f"%{word}%"]
    if a.get("kind") in ("photo", "video"):
        where.append("kind=?")
        args.append(a["kind"])
    if a.get("year"):
        where.append("substr(taken,1,4)=?")
        args.append(a["year"])
    if a.get("month"):
        where.append("substr(taken,6,2)=?")
        args.append(a["month"].zfill(2))
    if a.get("date_from"):
        where.append("taken >= ?")
        args.append(a["date_from"])
    if a.get("date_to"):
        where.append("taken <= ?")
        args.append(a["date_to"] + " 23:59:59")
    if a.get("min_mb"):
        where.append("size >= ?")
        args.append(float(a["min_mb"]) * 1024 * 1024)
    if a.get("max_mb"):
        where.append("size <= ?")
        args.append(float(a["max_mb"]) * 1024 * 1024)
    if a.get("folder"):
        where.append("folder = ?")
        args.append(a["folder"])
    if a.get("orient") == "landscape":
        where.append("width > height")
    elif a.get("orient") == "portrait":
        where.append("height > width")
    people = [int(p) for p in a.get("person", "").split(",") if p.strip().isdigit()]
    for pid in people:  # every chosen person must be in the photo
        where.append("id IN (SELECT media_id FROM faces WHERE person_id=?)")
        args.append(pid)
    if a.get("faces") == "yes":
        where.append("id IN (SELECT media_id FROM faces)")
    elif a.get("faces") == "no":
        where.append("id NOT IN (SELECT media_id FROM faces)")
    sql_where = ("WHERE " + " AND ".join(where)) if where else ""
    order = SORTS.get(a.get("sort"), SORTS["new"])
    limit = min(int(a.get("limit", 200)), 1000)
    offset = int(a.get("offset", 0))
    con = ix.db()
    total, total_bytes = con.execute(
        f"SELECT COUNT(*), COALESCE(SUM(size),0) FROM media {sql_where}", args).fetchone()
    rows = con.execute(f"SELECT * FROM media {sql_where} ORDER BY {order} LIMIT ? OFFSET ?",
                       args + [limit, offset]).fetchall()
    con.close()
    return jsonify(total=total, bytes=total_bytes, items=[media_out(r) for r in rows])


@app.route("/api/media/<int:mid>")
def media_one(mid):
    con = ix.db()
    r = con.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
    if not r:
        abort(404)
    faces = [dict(f) for f in con.execute(
        """SELECT f.id, f.person_id, f.x, f.y, f.w, f.h, p.name FROM faces f
           LEFT JOIN persons p ON p.id=f.person_id WHERE f.media_id=?""", (mid,))]
    con.close()
    d = media_out(r)
    d["path"] = r["path"]
    d["faces"] = faces
    d["browser_ok"] = (r["ext"] in BROWSER_OK) if r["kind"] == "photo" else (r["ext"] in VIDEO_BROWSER_OK)
    return jsonify(d)


def _media_row(mid):
    con = ix.db()
    r = con.execute("SELECT * FROM media WHERE id=?", (mid,)).fetchone()
    con.close()
    if not r:
        abort(404)
    return r


@app.route("/thumb/<int:mid>")
def thumb(mid):
    r = _media_row(mid)
    p = os.path.join(ix.THUMB_DIR, r["key"] + ".jpg")
    if os.path.exists(p):
        resp = send_file(p, mimetype="image/jpeg", max_age=86400)
        return resp
    return send_from_directory(app.static_folder, "video.svg" if r["kind"] == "video" else "photo.svg")


@app.route("/face/<int:fid>")
def face(fid):
    con = ix.db()
    r = con.execute("SELECT thumb FROM faces WHERE id=?", (fid,)).fetchone()
    con.close()
    if not r:
        abort(404)
    p = os.path.join(ix.FACE_DIR, r["thumb"])
    if not os.path.exists(p):
        return send_from_directory(app.static_folder, "photo.svg")
    return send_file(p, mimetype="image/jpeg", max_age=86400)


@app.route("/file/<int:mid>")
def original(mid):
    r = _media_row(mid)
    if not os.path.exists(r["path"]):
        abort(404)
    return send_file(r["path"], conditional=True)


@app.route("/preview/<int:mid>")
def preview(mid):
    """Big JPEG for photo formats a browser can't show (HEIC, TIFF…)."""
    r = _media_row(mid)
    if r["ext"] in BROWSER_OK:
        return send_file(r["path"], conditional=True)
    try:
        with Image.open(r["path"]) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((2400, 2400))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=88)
    except Exception:
        abort(415)
    buf.seek(0)
    return send_file(buf, mimetype="image/jpeg")


# ---------------------------------------------------------------- open on laptop
@app.route("/api/open/<int:mid>", methods=["POST"])
def open_file(mid):
    r = _media_row(mid)
    _open(r["path"], reveal=request.args.get("reveal") == "1")
    return jsonify(ok=True)


def _open(path, reveal=False):
    if sys.platform.startswith("win"):
        if reveal:
            subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])
        else:
            os.startfile(path)  # noqa
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", path] if reveal else ["open", path])
    else:
        subprocess.Popen(["xdg-open", os.path.dirname(path) if reveal else path])


# ---------------------------------------------------------------- people
@app.route("/api/people")
def people():
    show_all = request.args.get("all") == "1"
    min_n = 1 if show_all else 2
    con = ix.db()
    rows = con.execute("""
        SELECT p.id, p.name, p.hidden, COUNT(DISTINCT f.media_id) n, MAX(f.id) face_id
        FROM persons p JOIN faces f ON f.person_id=p.id
        GROUP BY p.id HAVING n >= ? ORDER BY (p.name IS NULL), n DESC""", (min_n,)).fetchall()
    # pick the clearest face as the cover
    out = []
    for r in rows:
        if r["hidden"] and not show_all:
            continue
        out.append({"id": r["id"], "name": r["name"], "count": r["n"], "hidden": r["hidden"],
                    "face_id": _cover(con, r["id"]) or r["face_id"]})
    total_faces = con.execute("SELECT COUNT(*) FROM faces").fetchone()[0]
    con.close()
    return jsonify(people=out, total_faces=total_faces)


def _cover(con, pid):
    """The clearest (biggest, most certain) face of a person."""
    best = con.execute("SELECT id FROM faces WHERE person_id=? ORDER BY w*h*score DESC LIMIT 1",
                       (pid,)).fetchone()
    return best["id"] if best else None


@app.route("/api/people/<int:pid>")
def person_one(pid):
    con = ix.db()
    p = con.execute("SELECT id, name, hidden FROM persons WHERE id=?", (pid,)).fetchone()
    if not p:
        con.close()
        abort(404)
    n = con.execute("SELECT COUNT(DISTINCT media_id) FROM faces WHERE person_id=?", (pid,)).fetchone()[0]
    out = dict(p) | {"count": n, "face_id": _cover(con, pid)}
    con.close()
    return jsonify(out)


def _centroids(con):
    """Average face of every person (normalised), for 'is this the same person?' suggestions."""
    acc = {}
    for r in con.execute("SELECT person_id, emb FROM faces WHERE person_id IS NOT NULL AND emb IS NOT NULL"):
        e = np.frombuffer(r["emb"], dtype=np.float32)
        if r["person_id"] in acc:
            acc[r["person_id"]] += e
        else:
            acc[r["person_id"]] = e.copy()
    ids = list(acc)
    if not ids:
        return ids, np.zeros((0, 128), np.float32)
    mat = np.stack([acc[i] for i in ids])
    return ids, mat / np.linalg.norm(mat, axis=1, keepdims=True)


@app.route("/api/people/<int:pid>/suggest")
def person_suggest(pid):
    """Other groups that probably are the same person (face got split into several groups)."""
    con = ix.db()
    ids, mat = _centroids(con)
    if pid not in ids:
        con.close()
        return jsonify(people=[])
    sims = mat @ mat[ids.index(pid)]
    out = []
    for j in np.argsort(-sims):
        other = ids[j]
        if other == pid or sims[j] < 0.25 or len(out) >= 18:
            continue
        p = con.execute("SELECT name FROM persons WHERE id=?", (other,)).fetchone()
        n = con.execute("SELECT COUNT(DISTINCT media_id) FROM faces WHERE person_id=?", (other,)).fetchone()[0]
        out.append({"id": other, "name": p["name"] if p else None, "count": n,
                    "face_id": _cover(con, other), "sim": round(float(sims[j]), 2)})
    con.close()
    return jsonify(people=out)


@app.route("/api/people/<int:pid>", methods=["POST"])
def person_update(pid):
    body = request.get_json(force=True) or {}
    con = ix.db()
    if "name" in body:
        name = (body["name"] or "").strip() or None
        # same name as an existing person → merge into that person
        if name:
            other = con.execute("SELECT id FROM persons WHERE name=? AND id<>?", (name, pid)).fetchone()
            if other:
                con.execute("UPDATE faces SET person_id=? WHERE person_id=?", (other["id"], pid))
                con.execute("DELETE FROM persons WHERE id=?", (pid,))
                con.commit()
                con.close()
                return jsonify(ok=True, merged_into=other["id"])
        con.execute("UPDATE persons SET name=? WHERE id=?", (name, pid))
    if "hidden" in body:
        con.execute("UPDATE persons SET hidden=? WHERE id=?", (1 if body["hidden"] else 0, pid))
    con.commit()
    con.close()
    return jsonify(ok=True)


@app.route("/api/people/merge", methods=["POST"])
def people_merge():
    body = request.get_json(force=True) or {}
    ids = list(dict.fromkeys(int(i) for i in body.get("ids", [])))
    if len(ids) < 2:
        return jsonify(ok=False, error="कम से कम 2 लोग चुनिए"), 400
    con = ix.db()
    # keep the group that already has a name (else the one asked for, else the first)
    named = con.execute(f"SELECT id FROM persons WHERE id IN ({','.join('?'*len(ids))}) AND name IS NOT NULL "
                        "ORDER BY id LIMIT 1", ids).fetchone()
    into = named["id"] if named else int(body.get("into") or ids[0])
    for pid in ids:
        if pid != into:
            con.execute("UPDATE faces SET person_id=? WHERE person_id=?", (into, pid))
            con.execute("DELETE FROM persons WHERE id=?", (pid,))
    con.commit()
    con.close()
    return jsonify(ok=True, into=into)


@app.route("/api/people/<int:pid>/faces")
def person_faces(pid):
    con = ix.db()
    rows = [dict(r) for r in con.execute(
        "SELECT id, media_id FROM faces WHERE person_id=? ORDER BY id DESC LIMIT 500", (pid,))]
    con.close()
    return jsonify(faces=rows)


@app.route("/api/faces/<int:fid>", methods=["POST"])
def face_update(fid):
    """Move one face to another person, or remove it ('not this person')."""
    body = request.get_json(force=True) or {}
    con = ix.db()
    target = body.get("person_id")
    if target == "new":
        target = con.execute("INSERT INTO persons(name) VALUES (?)", (body.get("name"),)).lastrowid
    con.execute("UPDATE faces SET person_id=? WHERE id=?", (target, fid))
    ix.cleanup_persons(con)
    con.commit()
    con.close()
    return jsonify(ok=True, person_id=target)


# ---------------------------------------------------------------- save into folders
BAD_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _safe_name(name):
    name = BAD_CHARS.sub("_", name or "").strip(" .")
    return name[:80] or "बिना नाम"


def _export_plan(con, by, person_id):
    """List of (source path, sub-folder, size) to copy."""
    plan = []
    if by in ("people", "person"):
        sql = """SELECT DISTINCT m.path, m.size, p.name, p.id pid FROM faces f
                 JOIN persons p ON p.id=f.person_id JOIN media m ON m.id=f.media_id"""
        if by == "person":
            rows = con.execute(sql + " WHERE p.id=?", (person_id,)).fetchall()
        else:
            rows = con.execute(sql + " WHERE p.name IS NOT NULL").fetchall()
        for r in rows:
            who = _safe_name(r["name"]) if r["name"] else f"इंसान-{r['pid']}"
            plan.append((r["path"], os.path.join("लोग", who), r["size"]))
    elif by == "date":
        months = ["01-जनवरी", "02-फ़रवरी", "03-मार्च", "04-अप्रैल", "05-मई", "06-जून", "07-जुलाई",
                  "08-अगस्त", "09-सितंबर", "10-अक्टूबर", "11-नवंबर", "12-दिसंबर"]
        for r in con.execute("SELECT path, size, taken FROM media"):
            t = r["taken"] or ""
            sub = os.path.join("तारीख से", t[:4], months[int(t[5:7]) - 1]) if len(t) >= 7 else \
                os.path.join("तारीख से", "बिना तारीख")
            plan.append((r["path"], sub, r["size"]))
    return plan


def _free_space(path):
    while path and not os.path.exists(path):
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
    try:
        return shutil.disk_usage(path).free
    except OSError:
        return None


@app.route("/api/export", methods=["POST"])
def export():
    """Copy photos into neat folders: one folder per person, or Year/Month.
    Originals are never moved or changed."""
    body = request.get_json(force=True) or {}
    by = body.get("by")
    if by not in ("people", "person", "date"):
        abort(400)
    cfg = ix.load_config()
    dest = export_folder(cfg)
    if _inside(cfg["folder"], dest):
        return jsonify(ok=False, error="Save वाला folder, photos वाले folder के अंदर नहीं हो सकता। "
                                       "Settings में दूसरा folder चुनिए।"), 400
    con = ix.db()
    plan = _export_plan(con, by, int(body.get("person_id") or 0))
    con.close()
    if not plan:
        msg = ("पहले 👤 लोग tab में चेहरों को नाम दीजिए। सिर्फ़ नाम वाले लोगों के folder बनते हैं।"
               if by == "people" else "Save करने के लिए कुछ नहीं मिला।")
        return jsonify(ok=False, error=msg), 400
    need = sum(p[2] or 0 for p in plan)
    free = _free_space(dest)
    if body.get("check"):
        return jsonify(ok=True, files=len(plan), bytes=need, free=free, dest=dest)
    if free is not None and need > free:
        return jsonify(ok=False, error="Disk में इतनी जगह नहीं है।"), 400

    def job(s):
        copied = skipped = failed = 0
        s.set(total=len(plan), message=f"{dest} में save हो रहा है…")
        for n, (src, sub, size) in enumerate(plan):
            if s.stopping:
                break
            try:
                folder = os.path.join(dest, sub)
                os.makedirs(folder, exist_ok=True)
                base, ext = os.path.splitext(os.path.basename(src))
                target, k = os.path.join(folder, base + ext), 1
                while os.path.exists(target):
                    if os.path.getsize(target) == size:  # already saved earlier
                        break
                    target, k = os.path.join(folder, f"{base}_{k}{ext}"), k + 1
                if os.path.exists(target):
                    skipped += 1
                else:
                    shutil.copy2(src, target)
                    copied += 1
            except OSError:
                failed += 1
            if n % 10 == 0:
                s.set(done=n + 1)
        s.set(done=len(plan), message=f"✅ Save हो गया: {copied} नई files copy हुईं"
              + (f", {skipped} पहले से थीं" if skipped else "")
              + (f", {failed} नहीं हो पाईं" if failed else "") + f" — {dest}")

    started = scanner.start_job(job, "export", "Save शुरू हो रहा है…")
    if not started:
        return jsonify(ok=False, error="अभी Scan या Save चल रहा है, उसके ख़त्म होने का इंतज़ार कीजिए।"), 409
    return jsonify(ok=True, dest=dest, files=len(plan))


@app.route("/api/open-export", methods=["POST"])
def open_export():
    dest = export_folder(ix.load_config())
    if not os.path.isdir(dest):
        return jsonify(ok=False, error="अभी तक कुछ save नहीं हुआ है।"), 404
    _open(dest)
    return jsonify(ok=True)


# ---------------------------------------------------------------- duplicates
@app.route("/api/duplicates")
def duplicates():
    mode = request.args.get("mode", "exact")
    con = ix.db()
    if mode == "similar":
        thr = max(0, min(16, int(request.args.get("threshold", 4))))
        rows = con.execute("SELECT id, dhash FROM media WHERE kind='photo' AND dhash IS NOT NULL").fetchall()
        groups = ix.similar_groups([(r["id"], r["dhash"]) for r in rows], thr)
    else:
        groups = {}
        for r in con.execute("""SELECT id, sha1 FROM media WHERE sha1 IN
                                (SELECT sha1 FROM media WHERE sha1 IS NOT NULL
                                 GROUP BY sha1 HAVING COUNT(*) > 1)"""):
            groups.setdefault(r["sha1"], []).append(r["id"])
        groups = list(groups.values())
    out, wasted = [], 0
    for g in groups:
        rows = con.execute(f"SELECT * FROM media WHERE id IN ({','.join('?'*len(g))})", g).fetchall()
        # best copy first: biggest resolution, then biggest file, then shortest path
        items = sorted((media_out(r) | {"path": r["path"]} for r in rows),
                       key=lambda m: (-(m["width"] or 0) * (m["height"] or 0), -m["size"], len(m["path"])))
        wasted += sum(m["size"] for m in items[1:])
        out.append(items)
    con.close()
    out.sort(key=lambda g: -sum(m["size"] for m in g[1:]))
    return jsonify(groups=out, wasted=wasted, mode=mode)


# ---------------------------------------------------------------- delete
@app.route("/api/delete", methods=["POST"])
def delete():
    ids = [int(i) for i in (request.get_json(force=True) or {}).get("ids", [])]
    con = ix.db()
    deleted, errors = [], []
    for mid in ids:
        r = con.execute("SELECT id, path, key FROM media WHERE id=?", (mid,)).fetchone()
        if not r:
            continue
        try:
            if os.path.exists(r["path"]):
                if send2trash:
                    send2trash(os.path.normpath(r["path"]))  # goes to the Recycle Bin
                else:
                    os.remove(r["path"])
            ix.remove_cache(con, r["id"], r["key"])
            con.execute("DELETE FROM media WHERE id=?", (mid,))
            deleted.append(mid)
        except Exception as e:
            errors.append(f"{os.path.basename(r['path'])}: {e}")
    ix.cleanup_persons(con)
    con.commit()
    con.close()
    return jsonify(deleted=deleted, errors=errors, recycle_bin=bool(send2trash))


def main():
    url = f"http://127.0.0.1:{PORT}"
    print("\n  Photo Manager चालू है:", url)
    print("  बंद करने के लिए यह window बंद कर दीजिए (या Ctrl+C)।\n")
    if "--no-browser" not in sys.argv:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    app.run(host="127.0.0.1", port=PORT, threaded=True, debug=False)


if __name__ == "__main__":
    main()
