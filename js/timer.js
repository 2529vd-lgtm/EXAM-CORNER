// Study timer: a digital countdown you set yourself (hours, minutes, seconds). It keeps running across
// pages and reloads because the end time is saved in this browser.
const TIMER_KEY = "studyTimer";

function timerLoad() {
  try { return JSON.parse(localStorage.getItem(TIMER_KEY)) || {}; } catch (e) { return {}; }
}
function timerSave(state) {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(state)); } catch (e) {}
}

function timerBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.4, 0.8, 1.2].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch (e) {}
}

function fmtClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

// Renders the timer into el. state: { duration, endAt (running), left (paused) }
function setupStudyTimer(el) {
  if (!el) return;
  el.innerHTML = `<div class="study-timer">
    <div class="st-head"><b>⏱️ Study Timer</b><span class="st-label muted" id="st-label"></span></div>
    <div class="st-display" id="st-display" aria-live="polite">00:00:00</div>
    <div class="st-set" id="st-set">
      <label>Hours<input type="number" id="st-h" min="0" max="23" value="0" inputmode="numeric" /></label>
      <label>Minutes<input type="number" id="st-m" min="0" max="59" value="0" inputmode="numeric" /></label>
      <label>Seconds<input type="number" id="st-s" min="0" max="59" value="0" inputmode="numeric" /></label>
    </div>
    <div class="st-actions">
      <button type="button" class="btn" id="st-start">▶ Start</button>
      <button type="button" class="btn ghost" id="st-reset">↺ Reset</button>
    </div>
  </div>`;
  const $ = (id) => el.querySelector("#" + id);
  const display = $("st-display");
  let state = timerLoad();

  const inputMs = () =>
    ((+$("st-h").value || 0) * 3600 + (+$("st-m").value || 0) * 60 + (+$("st-s").value || 0)) * 1000;

  const draw = () => {
    const running = !!state.endAt;
    const left = running ? state.endAt - Date.now() : state.left != null ? state.left : inputMs();
    display.textContent = fmtClock(left);
    display.classList.toggle("done", !!state.done);
    display.classList.toggle("low", running && left <= 60000);
    $("st-start").textContent = running ? "⏸ Pause" : state.left != null ? "▶ Resume" : "▶ Start";
    $("st-set").classList.toggle("hidden", running || state.left != null);
    $("st-label").textContent = state.done ? "Time's up! 🎉" : running ? "Running…" : state.left != null ? "Paused" : "";
    document.title = running ? `${fmtClock(left)} ⏱️ ${document.title.replace(/^\d\d:\d\d:\d\d ⏱️ /, "")}` : document.title.replace(/^\d\d:\d\d:\d\d ⏱️ /, "");
  };

  const finish = () => {
    state = { done: true, left: 0 };
    timerSave(state);
    draw();
    timerBeep();
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) {}
    try {
      if (window.Notification && Notification.permission === "granted") new Notification("⏱️ Time's up!", { body: "Your study timer has finished." });
    } catch (e) {}
  };

  el.querySelectorAll("#st-set input").forEach((i) => i.addEventListener("input", draw));

  $("st-start").onclick = () => {
    if (state.endAt) {
      state = { left: state.endAt - Date.now() };
    } else {
      const ms = state.left != null && !state.done ? state.left : inputMs();
      if (ms <= 0) return;
      state = { endAt: Date.now() + ms };
      try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
    }
    timerSave(state);
    draw();
  };
  $("st-reset").onclick = () => {
    state = {};
    timerSave(state);
    draw();
  };

  // A timer that finished while the page was closed just shows as done.
  if (state.endAt && state.endAt <= Date.now()) { state = { done: true, left: 0 }; timerSave(state); }
  draw();
  setInterval(() => {
    if (state.endAt && state.endAt <= Date.now()) finish();
    else if (state.endAt) draw();
  }, 250);
}
