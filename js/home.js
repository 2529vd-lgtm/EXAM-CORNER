function examCardHTML(e) {
  return `<a class="card exam-card" href="exam.html?id=${encodeURIComponent(e.id)}">
    <span class="tag">${fmtDate(e.date, { day: "numeric", month: "long", year: "numeric" })}${e.time ? " · " + esc(e.time) : ""}</span>
    <h3 style="margin-top:8px">${esc(e.name)}</h3>
    ${e.fullName ? `<p>${esc(e.fullName)}</p>` : ""}
    <div class="countdown" data-countdown="${examTime(e).toISOString()}"></div>
    <p>${(e.subjects || []).length} subjects</p>
    <span class="btn small" style="margin-top:10px">Syllabus, Notes, PYQ, Mock →</span>
  </a>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const site = await renderChrome("home");
  const { exams } = await loadJSON("content/exams.json", { exams: [] });
  const now = Date.now();
  const upcoming = exams.filter((e) => examTime(e) > now).sort((a, b) => examTime(a) - examTime(b));
  const past = exams.filter((e) => examTime(e) <= now).sort((a, b) => examTime(b) - examTime(a));

  // Masthead
  document.getElementById("masthead").innerHTML = `
    <div class="date">${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
    <h1>${esc(site.name)}</h1>
    <p>${esc(site.tagline || "")}</p>`;

  // Exam ticker
  const ticker = document.getElementById("ticker");
  if (upcoming.length) {
    const items = upcoming
      .map((e) => `<a href="exam.html?id=${encodeURIComponent(e.id)}">📅 ${esc(e.name)}: <b>${daysLeft(examTime(e))} days left</b> (${fmtDate(e.date)})</a>`)
      .join("");
    ticker.innerHTML = `<span class="label">Exam Alert</span><div class="track">${items}${items}</div>`;
  } else ticker.remove();

  // Exam lists
  document.getElementById("upcoming").innerHTML = upcoming.length
    ? upcoming.map(examCardHTML).join("")
    : `<p class="empty">No upcoming exams right now.</p>`;
  if (past.length) {
    document.getElementById("past-wrap").classList.remove("hidden");
    document.getElementById("past").innerHTML = past.map(examCardHTML).join("");
  }
  startCountdowns();

  // About + socials
  document.getElementById("about-name").textContent = site.author || site.name;
  document.getElementById("about-text").innerHTML = renderMarkdown(site.about || "");
  document.getElementById("avatar").innerHTML = site.photo
    ? `<img src="${esc(site.photo)}" alt="${esc(site.author || site.name)}" />`
    : esc((site.author || site.name || "?")[0]);
  const socials = socialLinksHTML(site);
  document.getElementById("about-socials").innerHTML =
    socials || `<p class="muted">Social media links coming soon.</p>`;
});
