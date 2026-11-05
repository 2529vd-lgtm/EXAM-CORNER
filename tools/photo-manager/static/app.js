"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const api = async (url, opts = {}) => {
  if (opts.body && typeof opts.body !== "string") {
    opts.body = JSON.stringify(opts.body);
    opts.headers = { "Content-Type": "application/json" };
  }
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["जनवरी","फ़रवरी","मार्च","अप्रैल","मई","जून","जुलाई","अगस्त","सितंबर","अक्टूबर","नवंबर","दिसंबर"];
function size(b) {
  if (b == null) return "";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (i ? b.toFixed(b < 10 ? 1 : 0) : b) + " " + u[i];
}
function dur(s) {
  if (!s) return "";
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
}
function niceDate(t) {
  if (!t) return "";
  const [d, tm] = t.split(" "); const [y, m, dd] = d.split("-");
  return `${+dd} ${MONTHS[+m - 1]} ${y}, ${tm.slice(0, 5)}`;
}
let toastT;
function toast(msg, ms = 3500) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), ms);
}

/* ---------------- tabs ---------------- */
let currentTab = "library";
function showTab(name) {
  currentTab = name;
  $$(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab").forEach(s => s.classList.toggle("hidden", s.id !== "tab-" + name));
  if (name === "people") loadPeople();
  if (name === "dupes") loadDupes();
  if (name === "settings") loadConfig();
}
$$(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------------- stats & scan ---------------- */
async function loadStats() {
  const s = await api("/api/stats");
  $("#stats").textContent = `${s.photos} photos · ${s.videos} videos · ${size(s.bytes)}`;
  const ySel = $("#f-year"), yv = ySel.value;
  ySel.innerHTML = `<option value="">सभी साल</option>` +
    s.years.map(y => `<option value="${esc(y.y)}">${esc(y.y)} (${y.n})</option>`).join("");
  ySel.value = yv;
  const fSel = $("#f-folder"), fv = fSel.value;
  fSel.innerHTML = `<option value="">सभी folders</option>` +
    s.folders.map(f => `<option value="${esc(f.folder)}">${esc(f.folder)} (${f.n})</option>`).join("");
  fSel.value = fv;
  return s;
}
let pollT = null, wasRunning = false;
async function poll() {
  const s = await api("/api/status").catch(() => null);
  if (!s) return;
  const box = $("#progress");
  if (s.running) {
    box.classList.remove("hidden");
    const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    $("#progressFill").style.width = pct + "%";
    const phase = { list: "Files गिन रहे हैं", read: "Photos पढ़ रहे हैं", hash: "Duplicate check" }[s.phase] || "";
    $("#progressText").textContent = `${phase} ${s.total ? `${s.done}/${s.total} (${pct}%)` : ""} — ${s.message}`;
    $("#scanBtn").disabled = true;
    wasRunning = true;
    if (s.phase === "read" && s.done && s.done % 256 < 64) refreshAll(true);
  } else {
    $("#scanBtn").disabled = false;
    if (wasRunning) {
      wasRunning = false;
      $("#progressFill").style.width = "100%";
      $("#progressText").textContent = s.message;
      $("#stopBtn").classList.add("hidden");
      setTimeout(() => box.classList.add("hidden"), 6000);
      toast(s.message, 6000);
      refreshAll();
    }
    clearInterval(pollT); pollT = null;
  }
}
function startPolling() { if (!pollT) { pollT = setInterval(poll, 1000); poll(); } }
$("#scanBtn").onclick = async () => {
  const r = await api("/api/scan", { method: "POST" });
  if (!r.started) toast("Scan पहले से चल रहा है");
  $("#stopBtn").classList.remove("hidden");
  startPolling();
};
$("#stopBtn").onclick = () => api("/api/scan/stop", { method: "POST" });
function refreshAll(quiet) {
  loadStats();
  if (currentTab === "library") loadMedia(true);
  if (!quiet && currentTab === "people") loadPeople();
  if (!quiet && currentTab === "dupes") loadDupes();
  loadPersonChips();
}

/* ---------------- library ---------------- */
const F = {
  q: "#f-q", kind: "#f-kind", year: "#f-year", month: "#f-month", date_from: "#f-from", date_to: "#f-to",
  min_mb: "#f-min", max_mb: "#f-max", orient: "#f-orient", faces: "#f-faces", folder: "#f-folder", sort: "#f-sort",
};
let selectedPeople = new Set();
let items = [], total = 0, loading = false, reqNo = 0;
const picked = new Set();

function query(offset) {
  const p = new URLSearchParams();
  for (const [k, sel] of Object.entries(F)) { const v = $(sel).value.trim(); if (v) p.set(k, v); }
  if (selectedPeople.size) p.set("person", [...selectedPeople].join(","));
  p.set("offset", offset); p.set("limit", 240);
  return p.toString();
}
async function loadMedia(reset) {
  if (loading && !reset) return;
  if (reset) { items = []; $("#grid").innerHTML = ""; lastHead = ""; }
  loading = true;
  const my = ++reqNo;
  try {
    const r = await api("/api/media?" + query(items.length));
    if (my !== reqNo) return;
    total = r.total;
    const start = items.length;
    items.push(...r.items);
    renderTiles(start);
    $("#resultInfo").textContent = `${total} मिलीं · ${size(r.bytes)}`;
    const filtered = query(0).replace(/(^|&)(sort|offset|limit)=[^&]*/g, "").length > 0;
    $("#emptyLib").classList.toggle("hidden", total > 0 || filtered);
    $("#more").textContent = items.length < total ? "नीचे scroll करें, और लोड होंगी…" : "";
  } finally { if (my === reqNo) loading = false; }
}
let lastHead = "";
function renderTiles(start) {
  const grid = $("#grid"), byDate = ["new", "old"].includes($("#f-sort").value);
  const frag = document.createDocumentFragment();
  for (let i = start; i < items.length; i++) {
    const m = items[i];
    if (byDate) {
      const h = m.taken ? `${MONTHS[+m.taken.slice(5, 7) - 1]} ${m.taken.slice(0, 4)}` : "बिना date";
      if (h !== lastHead) {
        lastHead = h;
        const d = document.createElement("div"); d.className = "ghead"; d.textContent = h; frag.appendChild(d);
      }
    }
    const t = document.createElement("div");
    t.className = "tile" + (picked.has(m.id) ? " picked" : "");
    t.dataset.i = i;
    t.title = `${m.name}\n${niceDate(m.taken)}\n${size(m.size)}`;
    t.innerHTML = `<img loading="lazy" src="/thumb/${m.id}" alt="">
      <input type="checkbox" class="sel" ${picked.has(m.id) ? "checked" : ""}>
      <span class="badge">${m.kind === "video" ? "▶ " + dur(m.duration) : size(m.size)}</span>`;
    frag.appendChild(t);
  }
  grid.appendChild(frag);
}
$("#grid").addEventListener("click", e => {
  const t = e.target.closest(".tile"); if (!t) return;
  const i = +t.dataset.i, m = items[i];
  if ($("#selectMode").checked) {
    picked.has(m.id) ? picked.delete(m.id) : picked.add(m.id);
    t.classList.toggle("picked", picked.has(m.id));
    $(".sel", t).checked = picked.has(m.id);
    $("#selCount").textContent = picked.size;
    return;
  }
  openViewer(i);
});
window.addEventListener("scroll", () => {
  if (currentTab !== "library" || loading || items.length >= total) return;
  if (window.innerHeight + window.scrollY > document.body.offsetHeight - 900) loadMedia(false);
});
let debounceT;
Object.values(F).forEach(sel => {
  const el = $(sel);
  el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
    clearTimeout(debounceT); debounceT = setTimeout(() => loadMedia(true), 300);
  });
});
$("#f-reset").onclick = () => {
  Object.values(F).forEach(sel => $(sel).value = "");
  $("#f-sort").value = "new"; selectedPeople.clear(); loadPersonChips(); loadMedia(true);
};
$("#selectMode").onchange = e => {
  const on = e.target.checked;
  $("#grid").classList.toggle("selecting", on);
  $("#delSel").classList.toggle("hidden", !on);
  $("#selAll").classList.toggle("hidden", !on);
  if (!on) { picked.clear(); $$(".tile.picked").forEach(t => t.classList.remove("picked")); $$(".tile .sel").forEach(c => c.checked = false); }
  $("#selCount").textContent = picked.size;
};
$("#selAll").onclick = () => {
  items.forEach(m => picked.add(m.id));
  $$(".tile").forEach(t => { t.classList.add("picked"); $(".sel", t).checked = true; });
  $("#selCount").textContent = picked.size;
};
$("#delSel").onclick = async () => {
  if (!picked.size) return toast("पहले photos चुनिए");
  if (!confirm(`${picked.size} files delete करें? (Recycle Bin में जाएँगी)`)) return;
  await doDelete([...picked]);
  picked.clear(); $("#selCount").textContent = 0;
};
async function doDelete(ids) {
  const r = await api("/api/delete", { method: "POST", body: { ids } });
  toast(`${r.deleted.length} files ${r.recycle_bin ? "Recycle Bin में भेजी गईं" : "delete हुईं"}` +
        (r.errors.length ? ` · ${r.errors.length} नहीं हो पाईं: ${r.errors[0]}` : ""), 6000);
  const gone = new Set(r.deleted);
  let removed = 0;
  for (let i = items.length - 1; i >= 0; i--) if (gone.has(items[i].id)) { items.splice(i, 1); removed++; }
  if (removed) { total -= removed; rerenderGrid(); }
  loadStats();
  return r;
}
function rerenderGrid() {
  $("#grid").innerHTML = ""; lastHead = ""; renderTiles(0);
  $("#resultInfo").textContent = `${total} मिलीं`;
}

/* person chips in the library filter */
async function loadPersonChips() {
  const r = await api("/api/people");
  const named = r.people.filter(p => p.name || selectedPeople.has(p.id)).slice(0, 60);
  const box = $("#personChips");
  if (!named.length) {
    box.innerHTML = r.people.length ? `<span class="muted small">👤 लोग वाले tab में चेहरों को नाम दीजिए, फिर यहाँ उनसे photos खोज सकेंगे।</span>` : "";
    return;
  }
  box.innerHTML = `<span class="muted small">👤 किसकी photo:</span>` + named.map(p =>
    `<span class="chip ${selectedPeople.has(p.id) ? "on" : ""}" data-id="${p.id}">
       <img src="/face/${p.face_id}" alt="">${esc(p.name || "बिना नाम")} (${p.count})</span>`).join("");
}
$("#personChips").addEventListener("click", e => {
  const c = e.target.closest(".chip"); if (!c) return;
  const id = +c.dataset.id;
  selectedPeople.has(id) ? selectedPeople.delete(id) : selectedPeople.add(id);
  c.classList.toggle("on");
  loadMedia(true);
});

/* ---------------- viewer ---------------- */
let vList = [], vIdx = 0;
function openViewer(i, list = items) { vList = list; vIdx = i; $("#viewer").classList.remove("hidden"); showCurrent(); }
function closeViewer() { $("#viewer").classList.add("hidden"); $("#vMain").innerHTML = ""; }
async function showCurrent() {
  const m = vList[vIdx]; if (!m) return closeViewer();
  const d = await api("/api/media/" + m.id);
  const main = $("#vMain");
  if (d.kind === "video") {
    main.innerHTML = d.browser_ok
      ? `<video src="/file/${d.id}" controls autoplay></video>`
      : `<div class="nope"><img src="/thumb/${d.id}" style="max-height:50vh"><p>यह video (${esc(d.ext)}) browser में नहीं चलता।</p>
         <button onclick="openOnPc(${d.id})">▶ Laptop के player में चलाएँ</button></div>`;
    const v = $("video", main);
    if (v) v.onerror = () => { main.innerHTML = `<div class="nope"><p>Browser यह video नहीं चला पाया।</p><button onclick="openOnPc(${d.id})">▶ Laptop के player में चलाएँ</button></div>`; };
  } else {
    main.innerHTML = `<img src="${d.browser_ok ? "/file/" : "/preview/"}${d.id}" alt="">`;
  }
  const src = { exif: "camera (EXIF) से", name: "file के नाम से", file: "file की date से" }[d.taken_src] || "";
  $("#vInfo").innerHTML = `
    <div style="font-weight:600;font-size:16px">${esc(d.name)}</div>
    <div class="k">Date</div><div class="v">${niceDate(d.taken)} <span class="muted">(${src})</span></div>
    <div class="k">Size</div><div class="v">${size(d.size)}${d.width ? ` · ${d.width} × ${d.height}` : ""}${d.duration ? " · " + dur(d.duration) : ""}</div>
    <div class="k">कहाँ है</div><div class="v">${esc(d.path)}</div>
    ${d.faces.length ? `<div class="k">चेहरे</div><div class="vfaces">${d.faces.map(f =>
      `<div data-p="${f.person_id ?? ""}"><img src="/face/${f.id}"><br>${esc(f.name || "बिना नाम")}</div>`).join("")}</div>` : ""}
    <div style="margin-top:16px">
      <button onclick="openOnPc(${d.id})">📂 Laptop में खोलें</button>
      <button onclick="openOnPc(${d.id}, true)">📁 Folder में दिखाएँ</button>
      <button class="danger" id="vDel">🗑️ Delete</button>
    </div>
    <p class="muted" style="font-size:12px;margin-top:20px">← → से आगे-पीछे, Esc से बंद, Delete key से delete</p>`;
  $("#vDel").onclick = deleteCurrent;
  $$(".vfaces div", $("#vInfo")).forEach(el => el.onclick = () => {
    if (!el.dataset.p) return;
    closeViewer(); showTab("library"); selectedPeople = new Set([+el.dataset.p]); loadPersonChips(); loadMedia(true);
  });
}
async function deleteCurrent() {
  const m = vList[vIdx];
  if (!confirm(`"${m.name}" delete करें? (Recycle Bin में जाएगी)`)) return;
  const r = await doDelete([m.id]);
  if (!r.deleted.length) return;
  if (vList !== items) vList.splice(vIdx, 1);  // the library list is already updated
  if (vIdx >= vList.length) vIdx = vList.length - 1;
  vList.length ? showCurrent() : closeViewer();
  if (currentTab === "dupes") loadDupes();
}
window.openOnPc = (id, reveal) => api(`/api/open/${id}${reveal ? "?reveal=1" : ""}`, { method: "POST" });
$("#vClose").onclick = closeViewer;
$("#vPrev").onclick = () => { if (vIdx > 0) { vIdx--; showCurrent(); } };
$("#vNext").onclick = async () => {
  if (vIdx < vList.length - 1) { vIdx++; showCurrent(); }
  else if (vList === items && items.length < total) { await loadMedia(false); if (vIdx < vList.length - 1) { vIdx++; showCurrent(); } }
};
document.addEventListener("keydown", e => {
  if ($("#viewer").classList.contains("hidden")) return;
  if (e.key === "Escape") closeViewer();
  else if (e.key === "ArrowLeft") $("#vPrev").click();
  else if (e.key === "ArrowRight") $("#vNext").click();
  else if (e.key === "Delete") deleteCurrent();
});

/* ---------------- people ---------------- */
const mergePick = new Set();
async function loadPeople() {
  const r = await api("/api/people" + ($("#peopleAll").checked ? "?all=1" : ""));
  $("#peopleInfo").textContent = r.people.length
    ? `${r.people.length} लोग मिले (${r.total_faces} चेहरे)`
    : (r.total_faces ? "" : "अभी कोई चेहरा नहीं मिला। Scan पूरा होने दीजिए (Settings में चेहरे पहचानना चालू हो)।");
  $("#people").innerHTML = r.people.map(p => `
    <div class="person ${mergePick.has(p.id) ? "picked" : ""}" data-id="${p.id}">
      <button class="hide small" title="इस इंसान को list से छुपाएँ">${p.hidden ? "दिखाएँ" : "छुपाएँ"}</button>
      <img src="/face/${p.face_id}" alt="" loading="lazy">
      <div><input value="${esc(p.name || "")}" placeholder="नाम लिखें…"></div>
      <div class="cnt">${p.count} photos</div>
    </div>`).join("");
}
$("#peopleAll").onchange = loadPeople;
$("#mergeMode").onchange = e => { mergePick.clear(); $("#mergeBtn").classList.toggle("hidden", !e.target.checked); loadPeople(); };
$("#people").addEventListener("click", async e => {
  const card = e.target.closest(".person"); if (!card) return;
  const id = +card.dataset.id;
  if (e.target.classList.contains("hide")) {
    await api(`/api/people/${id}`, { method: "POST", body: { hidden: e.target.textContent === "छुपाएँ" } });
    return loadPeople();
  }
  if (e.target.tagName !== "IMG") return;
  if ($("#mergeMode").checked) {
    mergePick.has(id) ? mergePick.delete(id) : mergePick.add(id);
    card.classList.toggle("picked");
    $("#mergeBtn").textContent = `✅ चुने हुए ${mergePick.size} को एक करें`;
    return;
  }
  selectedPeople = new Set([id]);
  showTab("library"); loadPersonChips(); loadMedia(true);
});
$("#people").addEventListener("keydown", async e => {
  if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
  const id = +e.target.closest(".person").dataset.id;
  const r = await api(`/api/people/${id}`, { method: "POST", body: { name: e.target.value } });
  toast(r.merged_into ? "इसी नाम का इंसान पहले से था, दोनों जोड़ दिए ✅" : "नाम save हो गया ✅");
  e.target.blur(); loadPeople(); loadPersonChips();
});
$("#people").addEventListener("focusout", async e => {
  if (e.target.tagName !== "INPUT" || e.target.defaultValue === e.target.value) return;
  const id = +e.target.closest(".person").dataset.id;
  await api(`/api/people/${id}`, { method: "POST", body: { name: e.target.value } });
  e.target.defaultValue = e.target.value; loadPersonChips();
});
$("#mergeBtn").onclick = async () => {
  if (mergePick.size < 2) return toast("कम से कम 2 चेहरे चुनिए");
  await api("/api/people/merge", { method: "POST", body: { ids: [...mergePick] } });
  toast("एक कर दिए ✅"); mergePick.clear(); loadPeople(); loadPersonChips();
};

/* ---------------- duplicates ---------------- */
let dupeMode = "exact", dupeGroups = [];
$$(".seg button").forEach(b => b.onclick = () => {
  dupeMode = b.dataset.mode;
  $$(".seg button").forEach(x => x.classList.toggle("active", x === b));
  $("#thrBox").classList.toggle("hidden", dupeMode !== "similar");
  loadDupes();
});
$("#thr").oninput = e => { $("#thrVal").textContent = e.target.value; clearTimeout(debounceT); debounceT = setTimeout(loadDupes, 400); };
async function loadDupes() {
  $("#dupeInfo").textContent = "ढूँढ रहे हैं…";
  const r = await api(`/api/duplicates?mode=${dupeMode}&threshold=${$("#thr").value}`);
  dupeGroups = r.groups;
  $("#dupeInfo").textContent = r.groups.length
    ? `${r.groups.length} groups · ${size(r.wasted)} बच सकती है` : "कोई duplicate नहीं मिली 🎉";
  $("#dupes").innerHTML = r.groups.map((g, gi) => `
    <div class="dgroup">
      <div class="dhead">Group ${gi + 1} · ${g.length} files · ${size(g[0].size)}</div>
      <div class="ditems">${g.map((m, i) => `
        <div class="ditem">
          <div class="tile" data-g="${gi}" data-i="${i}"><img loading="lazy" src="/thumb/${m.id}">${i === 0 ? `<span class="tag">रखें</span>` : ""}
            ${m.kind === "video" ? `<span class="badge">▶ ${dur(m.duration)}</span>` : ""}</div>
          <label><input type="checkbox" class="dsel" value="${m.id}" ${i ? "checked" : ""}> Delete</label>
          <div>${size(m.size)}${m.width ? ` · ${m.width}×${m.height}` : ""}</div>
          <div>${niceDate(m.taken)}</div>
          <div class="path">${esc(m.path)}</div>
        </div>`).join("")}</div>
    </div>`).join("");
}
$("#dupes").addEventListener("click", e => {
  const t = e.target.closest(".tile"); if (!t) return;
  openViewer(+t.dataset.i, dupeGroups[+t.dataset.g]);
});
$("#dupes").addEventListener("change", e => {
  if (!e.target.classList.contains("dsel")) return;
  const grp = e.target.closest(".dgroup");
  if ($$(".dsel", grp).every(c => c.checked)) {
    e.target.checked = false;
    toast("हर group में कम से कम एक copy रखनी होगी");
  }
});
$("#dupeDel").onclick = async () => {
  const ids = $$(".dsel:checked").map(c => +c.value);
  if (!ids.length) return toast("कुछ भी चुना नहीं है");
  if (!confirm(`${ids.length} files delete करें? (Recycle Bin में जाएँगी)`)) return;
  await doDelete(ids);
  loadDupes();
};

/* ---------------- settings ---------------- */
async function loadConfig() {
  const c = await api("/api/config");
  $("#cfgFolder").value = c.folder;
  $("#cfgFaces").checked = c.faces;
  $("#cfgMsg").textContent = c.folder_exists ? "✅ Folder मिल गया" : "⚠️ यह folder अभी नहीं मिला। सही path लिखें, जैसे D:\\00";
  return c;
}
$("#cfgSave").onclick = async () => {
  try {
    await api("/api/config", { method: "POST", body: { folder: $("#cfgFolder").value } });
    toast("Save हो गया। अब 🔄 Scan करें दबाइए।"); loadConfig();
  } catch (e) { $("#cfgMsg").textContent = "⚠️ " + e.message; }
};
$("#cfgFaces").onchange = e => api("/api/config", { method: "POST", body: { faces: e.target.checked } });

/* ---------------- start ---------------- */
(async () => {
  const [s, c] = await Promise.all([loadStats(), api("/api/config")]);
  loadMedia(true); loadPersonChips(); startPolling();
  if (!s.total) {
    if (!c.folder_exists) { showTab("settings"); toast("पहले अपनी photos वाले folder का path लिखिए", 6000); }
    else toast("🔄 Scan करें दबाइए, ताकि photos दिखें", 6000);
  }
})();
