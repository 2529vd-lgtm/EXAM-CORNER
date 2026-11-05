// Admin tab: turn a YouTube class into notes, a mind map and an MCQ test with Google Gemini,
// then save them to the right exam and subject.
// The Gemini API key is kept only in this browser (like the GitHub token) and is sent only to Google.

const YT_KEY = "geminiKey";
const YT_MODEL = "geminiModel";
const YT_DEFAULT_MODEL = "gemini-3.8-flash"; // used only until "Key जाँचें" picks the newest model for this key
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
let ytResult = null; // last Gemini answer plus the request details

function ytGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
function ytSet(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }

function ytVideoId(url) {
  const m = String(url).match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function ytExamOptions(selected) {
  return DB.exams.map((e) => `<option value="${esc(e.id)}" ${e.id === selected ? "selected" : ""}>${esc(e.name)}</option>`).join("");
}
function ytSubjectOptions(examId, selected) {
  const ex = DB.exams.find((e) => e.id === examId);
  return `<option value="">General (no subject)</option>` +
    (ex?.subjects || []).map((s) => `<option value="${esc(s.id)}" ${s.id === selected ? "selected" : ""}>${esc(s.name)}</option>`).join("");
}

function youtubeTab() {
  const key = ytGet(YT_KEY);
  const model = ytGet(YT_MODEL) || YT_DEFAULT_MODEL;
  $("view").innerHTML = `<div class="panel">
    <h2>▶️ YouTube से notes बनाएँ</h2>
    <p class="muted" style="margin-bottom:14px">YouTube class का link डालिए। Google Gemini पूरा video देखकर notes, mind map और MCQ test बनाएगा और सही exam व subject चुनेगा। आप जाँच लें, फिर <b>Website पर जोड़ो</b> दबाएँ।</p>

    <details class="help" ${key ? "" : "open"} style="margin-bottom:16px">
      <summary><b>🔑 Gemini API key ${key ? "(saved ✓)" : "(एक बार, free)"}</b></summary>
      <ol>
        <li>यह page खोलें: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> (अपने Google/Gmail account से login करें)।</li>
        <li><b>Create API key</b> दबाएँ, key copy करें और नीचे paste करें।</li>
        <li><b>Key जाँचें</b> दबाएँ। सही होगी तो model अपने आप चुन लिया जाएगा।</li>
      </ol>
      <p>Key सिर्फ़ इसी browser में रहती है और सिर्फ़ Google को भेजी जाती है। Free plan में रोज़ की एक सीमा होती है, और Google free plan का data अपने AI को सुधारने में इस्तेमाल कर सकता है।</p>
      <div class="field"><label for="yt-key">Gemini API key</label><input type="password" id="yt-key" value="${esc(key)}" placeholder="AIza..." autocomplete="off" /></div>
      <div class="field"><label for="yt-model">Model</label><input id="yt-model" list="yt-models" value="${esc(model)}" /><datalist id="yt-models"></datalist>
        <p class="help">Default: ${YT_DEFAULT_MODEL}. "Key जाँचें" आपकी key पर चलने वाले Flash models की list ले आता है।</p></div>
      <button class="btn small ghost" id="yt-check" type="button">Key जाँचें और save करें</button>
    </details>

    <div class="field"><label for="yt-url">YouTube link</label><input id="yt-url" placeholder="https://www.youtube.com/watch?v=..." /></div>
    <div class="field"><label>क्या बनाना है?</label>
      <label style="font-weight:500;display:flex;gap:8px;align-items:center"><input type="checkbox" id="yt-long" style="width:auto" checked /> पूरे notes</label>
      <label style="font-weight:500;display:flex;gap:8px;align-items:center"><input type="checkbox" id="yt-short" style="width:auto" checked /> छोटे notes (revision)</label>
      <label style="font-weight:500;display:flex;gap:8px;align-items:center"><input type="checkbox" id="yt-map" style="width:auto" checked /> Mind map</label>
      <label style="font-weight:500;display:flex;gap:8px;align-items:center"><input type="checkbox" id="yt-mcq" style="width:auto" checked /> MCQ test,
        <select id="yt-mcq-n" style="width:auto;padding:4px 8px"><option>10</option><option selected>15</option><option>20</option></select> सवाल</label>
    </div>
    <div class="field"><label for="yt-lang">Notes की भाषा</label>
      <select id="yt-lang"><option value="same">Video जैसी</option><option value="Hindi">हिन्दी</option><option value="English">English</option><option value="Hinglish">Hinglish</option></select></div>
    <div class="field"><label for="yt-exam">Exam</label>
      <select id="yt-exam"><option value="">Gemini खुद चुने</option>${ytExamOptions("")}</select></div>
    <button class="btn" id="yt-go" type="button">✨ Notes बनाओ</button>
    <p class="help">1 घंटे की class में 1–3 मिनट लग सकते हैं। Page बंद न करें।</p>
  </div>
  <div id="yt-out"></div>`;

  $("yt-check").onclick = () => ytCheckKey();
  $("yt-go").onclick = () => ytGenerate();
}

// Lists the Flash models this key can use and returns them newest first.
async function ytListFlash(key, includeLite) {
  const res = await fetch(`${GEMINI_API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Key काम नहीं कर रही (${data.error?.message || res.status})`);
    err.status = res.status;
    throw err;
  }
  const ver = (m) => parseFloat((m.match(/^gemini-([\d.]+)/) || [])[1] || 0);
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && /flash/.test(m.name) && !(includeLite ? /(image|tts|audio|live|exp)/ : /(image|tts|audio|live|lite|exp)/).test(m.name))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort((a, b) => ver(b) - ver(a) || (/preview/.test(a) - /preview/.test(b)));
}

// Newest stable "gemini-X.Y-flash", else the newest Flash of any kind.
function ytBestModel(list) {
  return list.find((m) => /^gemini-[\d.]+-flash$/.test(m)) || list[0] || "";
}

async function ytCheckKey() {
  const key = $("yt-key").value.trim();
  if (!key) return status("⚠️ पहले Gemini API key paste करें।", "err");
  busy($("yt-check"), "जाँच रहे हैं…", async () => {
    const flash = await ytListFlash(key);
    $("yt-models").innerHTML = flash.map((m) => `<option value="${esc(m)}">`).join("");
    const model = ytBestModel(flash) || $("yt-model").value.trim() || YT_DEFAULT_MODEL;
    $("yt-model").value = model;
    ytSet(YT_KEY, key);
    ytSet(YT_MODEL, model);
    status(`✅ Key सही है और save हो गई। Model: <b>${esc(model)}</b>`, "ok");
  });
}

function ytPrompt(parts, lang, examId, nMcq) {
  const exams = (examId ? DB.exams.filter((e) => e.id === examId) : DB.exams).map((e) => ({
    exam_id: e.id, exam: e.name, subjects: (e.subjects || []).map((s) => ({ subject_id: s.id, subject: s.name })),
  }));
  const langLine = lang === "same"
    ? "Write in the same language the teacher mainly uses in the video (Hindi in Devanagari script, English, or Hinglish in Roman script)."
    : `Write in ${lang}${lang === "Hindi" ? " (Devanagari script); keep standard technical terms in English in brackets where useful" : ""}.`;
  const want = [];
  if (parts.long) want.push(`"long_notes": detailed study notes in Markdown. Use "## " headings for each topic taught, bullet points, tables for comparisons, formulas, definitions and examples given in the class. Bold the key terms. End with "## Quick revision" (6–10 bullets).`);
  if (parts.short) want.push(`"short_notes": 12–20 short revision bullets in Markdown.`);
  if (parts.map) want.push(`"mindmap": a mind map in Markdown: first line "# <topic>", then "## <branch>" lines with "- point" lines under them (sub-points indented by two spaces). At most 7 branches.`);
  if (parts.mcq) want.push(`"mcqs": exactly ${nMcq} exam-style multiple-choice questions on what was taught, each {"q": question, "options": [4 strings], "answer": index 0-3 of the correct option, "explanation": one or two lines}. Vary the position of the correct answer.`);
  return `You prepare study material for Indian competitive-exam aspirants from a YouTube class.
Watch and listen to the whole video. Use only what is taught in it; fix obvious slips, but do not invent facts, numbers or names that are not in the video.
${langLine}

Pick the best matching exam and subject from this catalogue, using the ids exactly as given. If no subject fits, use "" for subject_id.
${JSON.stringify(exams)}

Return one JSON object with these keys:
"ok": true if the video is a class or lecture with study content, otherwise false,
"reason": if ok is false, why (one line),
"exam_id", "subject_id",
"title": a short, specific title for the topic of the class (max 10 words, in the notes language),
"summary": one sentence on what the class covers,
${want.join(",\n")}`;
}

async function ytCallGemini(key, model, url, prompt, lowRes) {
  const body = {
    contents: [{ parts: [{ fileData: { fileUri: url } }, { text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.3, ...(lowRes ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}) },
  };
  const res = await fetch(`${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Gemini error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const cand = (data.candidates || [])[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text) throw new Error(`Gemini ने कोई जवाब नहीं दिया (${cand?.finishReason || data.promptFeedback?.blockReason || "unknown"}).`);
  return JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
}

async function ytGenerate() {
  const key = ($("yt-key").value || "").trim() || ytGet(YT_KEY);
  const model = ($("yt-model").value || "").trim() || YT_DEFAULT_MODEL;
  const url = $("yt-url").value.trim();
  const vid = ytVideoId(url);
  const parts = { long: $("yt-long").checked, short: $("yt-short").checked, map: $("yt-map").checked, mcq: $("yt-mcq").checked };
  if (!key) return status("⚠️ पहले ऊपर Gemini API key डालकर <b>Key जाँचें</b> दबाएँ।", "err");
  if (!vid) return status("⚠️ यह YouTube link सही नहीं लग रहा। Video का पूरा link paste करें।", "err");
  if (!Object.values(parts).some(Boolean)) return status("⚠️ कम से कम एक चीज़ चुनें (notes, mind map या MCQ)।", "err");
  ytSet(YT_KEY, key);
  ytSet(YT_MODEL, model);
  const cleanUrl = `https://www.youtube.com/watch?v=${vid}`;
  const nMcq = Number($("yt-mcq-n").value) || 15;
  const prompt = ytPrompt(parts, $("yt-lang").value, $("yt-exam").value, nMcq);
  const btn = $("yt-go");
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ Gemini video देख रहा है…";
  status("⏳ Gemini video देख रहा है और notes बना रहा है। लंबी class में 1–3 मिनट लगते हैं, page बंद न करें।");
  $("yt-out").innerHTML = "";
  try {
    const run = async (m) => {
      try {
        return await ytCallGemini(key, m, cleanUrl, prompt, true);
      } catch (e) {
        if (e.status !== 400 || ytRetiredModel(e)) throw e;
        return await ytCallGemini(key, m, cleanUrl, prompt, false); // some models don't accept the low-resolution setting
      }
    };
    // When Google's servers are busy (503), wait and retry; then fall back to another Flash model.
    const runPatient = async (m) => {
      const waits = [10, 25];
      for (let i = 0; ; i++) {
        try {
          return await run(m);
        } catch (e) {
          if (!ytBusy(e) || i >= waits.length) throw e;
          status(`⏳ Google के servers पर अभी भीड़ है। ${waits[i]} सेकंड रुककर फिर कोशिश कर रहे हैं (${i + 1}/${waits.length})…`);
          await new Promise((r) => setTimeout(r, waits[i] * 1000));
        }
      }
    };
    let out;
    try {
      out = await runPatient(model);
    } catch (e) {
      if (ytBusy(e)) {
        const others = (await ytListFlash(key, true)).filter((m) => m !== model);
        if (!others.length) throw e;
        let lastErr = e;
        for (const alt of others.slice(0, 2)) {
          status(`⏳ <b>${esc(model)}</b> पर अभी भीड़ है, अब <b>${esc(alt)}</b> से बना रहे हैं…`);
          try { out = await run(alt); break; } catch (e2) { lastErr = e2; if (!ytBusy(e2) && !ytRetiredModel(e2)) throw e2; }
        }
        if (!out) throw lastErr;
      } else {
      if (!ytRetiredModel(e)) throw e;
      // The model was retired: switch to the one Gemini suggests, or the newest available, and try once more.
      const named = ((e.message.match(/use (?:models\/)?(gemini-[\w.-]+)/i) || [])[1] || "").replace(/[.-]+$/, "");
      const next = named && named !== model ? named : ytBestModel(await ytListFlash(key));
      if (!next || next === model) throw e;
      status(`⏳ Model <b>${esc(model)}</b> बंद हो गया है, अब <b>${esc(next)}</b> से बना रहे हैं…`);
      ytSet(YT_MODEL, next);
      if ($("yt-model")) $("yt-model").value = next;
      out = await runPatient(next);
      }
    }
    if (out.ok === false) throw new Error(`यह video पढ़ाई वाली class नहीं लगती: ${out.reason || ""}`);
    ytResult = { out, url: cleanUrl, parts, nMcq };
    ytReview();
    status("✅ Notes तैयार हैं। नीचे जाँचें, ज़रूरत हो तो exam/subject बदलें, फिर <b>Website पर जोड़ो</b> दबाएँ।", "ok");
  } catch (e) {
    console.error(e);
    let hint = "";
    if (e.status === 400) hint = " Video public है न? बहुत लंबी (2–3 घंटे) class हो तो छोटी class से कोशिश करें।";
    if (e.status === 403 || e.status === 401) hint = " API key गलत है या बंद है। नई key बनाकर डालें।";
    if (e.status === 404) hint = " Model का नाम पुराना हो सकता है। <b>Key जाँचें</b> दबाएँ, नया model अपने आप चुन लिया जाएगा।";
    if (ytBusy(e)) hint = " Google के servers पर अभी भीड़ है (यह आपकी key की गलती नहीं)। 5–10 मिनट बाद फिर कोशिश करें।";
    if (e.status === 429) hint = " आज की free सीमा पूरी हो गई या बहुत जल्दी-जल्दी request गई। थोड़ी देर बाद कोशिश करें।";
    if (e instanceof SyntaxError) hint = " Gemini का जवाब अधूरा आया। एक बार फिर कोशिश करें।";
    status(`❌ ${esc(e.message)}${hint}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

// True when Google's servers are overloaded for a while (not a quota problem).
function ytBusy(e) {
  return e.status === 503 || e.status === 500 || /high demand|overloaded|try again later|unavailable/i.test(e.message || "");
}

// True when Gemini says the chosen model is retired or unknown.
function ytRetiredModel(e) {
  return e.status === 404 || /no longer available|not found|is not supported|deprecated|update your code to use/i.test(e.message || "");
}

function ytValidMcqs(list) {
  return (Array.isArray(list) ? list : [])
    .filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(Number(q.answer)) && Number(q.answer) >= 0 && Number(q.answer) < q.options.length)
    .map((q) => ({ q: String(q.q), options: q.options.map(String), answer: Number(q.answer), explanation: String(q.explanation || "") }));
}

function ytReview() {
  const { out, parts } = ytResult;
  const examOk = DB.exams.some((e) => e.id === out.exam_id);
  const examId = examOk ? out.exam_id : DB.exams[0]?.id;
  const mcqs = ytValidMcqs(out.mcqs);
  const blocks = [];
  if (parts.long && out.long_notes) blocks.push(["long", "पूरे notes", previewHTML(out.long_notes)]);
  if (parts.short && out.short_notes) blocks.push(["short", "छोटे notes", previewHTML(out.short_notes)]);
  if (parts.map && out.mindmap) blocks.push(["mindmap", "Mind map (website पर चित्र बनेगा)", previewHTML(out.mindmap)]);
  if (parts.mcq && mcqs.length)
    blocks.push(["mock", `MCQ test (${mcqs.length} सवाल)`, `<ol>${mcqs.map((q) => `<li><b>${esc(q.q)}</b><br>✔️ ${esc(q.options[q.answer])}<br><span class="muted">${esc(q.explanation)}</span></li>`).join("")}</ol>`]);
  ytResult.mcqs = mcqs;
  $("yt-out").innerHTML = `<div class="panel">
    <h2>जाँचें और जोड़ें</h2>
    ${out.summary ? `<p class="muted">${esc(out.summary)}</p>` : ""}
    <div class="field"><label for="yt-title">Title</label><input id="yt-title" value="${esc(out.title || "YouTube class notes")}" /></div>
    <div class="field"><label for="yt-save-exam">Exam ${examOk ? "(Gemini ने चुना)" : ""}</label><select id="yt-save-exam">${ytExamOptions(examId)}</select></div>
    <div class="field"><label for="yt-save-subject">Subject</label><select id="yt-save-subject">${ytSubjectOptions(examId, out.subject_id)}</select></div>
    ${blocks.map(([t, label, html]) => `<details class="help" style="margin-bottom:10px" open>
        <summary><label style="display:inline-flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" data-yt-part="${t}" style="width:auto" checked /> ${esc(label)}</label></summary>
        <div class="prose" style="max-height:420px;overflow:auto;padding:8px 4px">${html}</div></details>`).join("") || `<p class="muted">Gemini ने कुछ नहीं बनाया। फिर से कोशिश करें।</p>`}
    <button class="btn" id="yt-save" type="button">✅ Website पर जोड़ो</button>
    <button class="btn ghost" id="yt-again" type="button">↻ फिर से बनाओ</button>
  </div>`;
  $("yt-save-exam").onchange = (e) => { $("yt-save-subject").innerHTML = ytSubjectOptions(e.target.value, ""); };
  $("yt-again").onclick = () => ytGenerate();
  $("yt-save").onclick = () => ytSave();
}

function ytSave() {
  const { out, url, mcqs } = ytResult;
  const title = $("yt-title").value.trim() || "YouTube class notes";
  const exam = $("yt-save-exam").value;
  const subject = $("yt-save-subject").value;
  const chosen = [...document.querySelectorAll("[data-yt-part]")].filter((c) => c.checked).map((c) => c.dataset.ytPart);
  if (!chosen.length) return status("⚠️ कम से कम एक चीज़ चुनें।", "err");
  const source = `> 🎥 Source: [YouTube class](${url}) · notes made with Gemini; check important facts.\n\n`;
  const plan = {
    long: { suffix: "", label: "notes", content: () => source + out.long_notes },
    short: { suffix: " (short notes)", label: "short notes", content: () => source + out.short_notes },
    mindmap: { suffix: " (mind map)", label: "mind map", content: () => out.mindmap },
    mock: { suffix: " (MCQ test)", label: "MCQ test", content: () => JSON.stringify({ duration: mcqs.length, negative: 0, questions: mcqs }, null, 2) + "\n" },
  };
  busy($("yt-save"), "जोड़ रहे हैं…", async () => {
    const metas = [];
    for (const type of chosen) {
      const p = plan[type];
      const meta = { id: makeId(title + (type === "long" ? "" : "-" + type), type), exam, subject, type, title: title + p.suffix, summary: type === "long" ? String(out.summary || "") : "", date: today() };
      if (type === "mock") Object.assign(meta, { questions: mcqs.length, duration: mcqs.length });
      await GH.put(PATHS.item(meta), p.content(), `Add ${p.label} from YouTube: ${title}`);
      metas.push({ meta, label: p.label });
    }
    const data = await GH.updateJSON(PATHS.items, { items: [] }, (d) => {
      const ids = new Set(metas.map((m) => m.meta.id));
      d.items = [...metas.map((m) => m.meta), ...d.items.filter((x) => !ids.has(x.id))];
    }, `Add study material from YouTube: ${title}`);
    DB.items = data.items;
    const ex = DB.exams.find((e) => e.id === exam);
    const sub = ex?.subjects?.find((s) => s.id === subject);
    const links = metas.map(({ meta, label }) => {
      const href = meta.type === "mock" ? `mock.html?id=${encodeURIComponent(meta.id)}` : `item.html?id=${encodeURIComponent(meta.id)}`;
      return `<a href="${href}" target="_blank">${esc(label)}</a>`;
    }).join(" · ");
    const examHref = `exam.html?id=${encodeURIComponent(exam)}&view=material&subject=${encodeURIComponent(subject || "all")}`;
    status(`✅ जोड़ दिया! <b>${esc(ex?.name || exam)} › ${esc(sub?.name || "General")}</b> में मिलेगा (1–2 मिनट में दिखेगा)।<br>पढ़ें: ${links} · <a href="${examHref}" target="_blank">पूरा subject खोलें</a>`, "ok");
    $("yt-out").innerHTML = "";
    $("yt-url").value = "";
  });
}
