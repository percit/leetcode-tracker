/* gridgrind — LeetCode pattern tracker with adaptive progression + spaced repetition.
 * No build step. PATTERNS comes from data.js (parsed from the "Ultimate LeetCode
 * Patterns" list: https://github.com/Automedon/ultimate-leetcode-patterns).
 */

const EASY_UNLOCK_MEDIUM = 3; // solve this many Easy in a pattern before Medium is suggested
const MEDIUM_ADVANCE_NEXT = 2; // solve this many Medium before moving on to the next pattern
const TIMER_MIN = { Easy: 30, Medium: 45 };
const BOX_INTERVAL_DAYS = [1, 2, 4, 8, 16, 30]; // Leitner box -> days until due again

const PROGRESS_KEY = "gridgrind_progress_v1";
const ACTIVE_PATTERN_KEY = "gridgrind_active_pattern_v1";
const CUSTOM_KEY = "gridgrind_custom_v1";

/* ---------------------------------------------------------------------- */
/* Seed: real history already logged by hand in the obsidian-vault notes  */
/* (leetcode/latwe.md, lekko problematyczne.md, trudne.md), pattern 1.    */
/* ---------------------------------------------------------------------- */

const SEED_DATE = "2026-08-31";

const SEED_PROGRESS = {
  "ransom-note": {
    personalDifficulty: "easy",
    box: 3,
    attempts: [{ date: SEED_DATE, outcome: "clean", timeSec: null, note: "" }],
  },
  "contains-duplicate": {
    personalDifficulty: "medium",
    box: 1,
    attempts: [
      {
        date: SEED_DATE,
        outcome: "struggled",
        timeSec: null,
        note: "Pomyliłem: find() na unordered_map zwraca iterator, nie wartość. Pierwsze rozwiązanie działało, ale nieoptymalne pamięciowo (mapa zamiast setu).",
      },
    ],
  },
  "valid-anagram": {
    personalDifficulty: "medium",
    box: 1,
    attempts: [
      {
        date: SEED_DATE,
        outcome: "struggled",
        timeSec: null,
        note: "Użyłem pełnej hash mapy do dodawania/odejmowania, a mogłem zwykłej tablicy 26 liter — mniejsze constrainty pozwalają na prostsze rozwiązanie.",
      },
    ],
  },
  "longest-palindrome": {
    personalDifficulty: "medium",
    box: 1,
    attempts: [
      {
        date: SEED_DATE,
        outcome: "struggled",
        timeSec: null,
        note: "Nie ogarnąłem od razu obsługi środkowego pojedynczego znaku przy nieparzystych długościach (np. 'aabccd' — kilka par plus jedna pojedyncza litera w środku).",
      },
    ],
  },
  "two-sum": {
    personalDifficulty: "hard",
    box: 0,
    attempts: [
      {
        date: SEED_DATE,
        outcome: "failed",
        timeSec: null,
        note: "Zapomniałem o unordered_map w ogóle i jak robić find() na niej — nawet po podpowiedziach nie skończyłem zadania.",
      },
    ],
  },
  "isomorphic-strings": {
    personalDifficulty: "hard",
    box: 0,
    attempts: [
      {
        date: SEED_DATE,
        outcome: "struggled",
        timeSec: null,
        note: "Nie miałem pomysłu przez odwróconą kolejność mapowania; nawet po podpowiedzi użyłem hash mapy zamiast tablicy ASCII (256 znaków).",
      },
    ],
  },
  "word-pattern": {
    personalDifficulty: "hard",
    box: 0,
    attempts: [
      {
        date: SEED_DATE,
        outcome: "struggled",
        timeSec: null,
        note: "Zapomniałem jak rozbić string ze spacjami na vector<string> (istringstream) i pomyliłem push z push_back. To niemal to samo rozwiązanie co Isomorphic Strings zrobione wcześniej.",
      },
    ],
  },
};

/* ---------------------------------------------------------------------- */
/* Date helpers                                                            */
/* ---------------------------------------------------------------------- */

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T00:00:00");
  const b = new Date(toStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

/* ---------------------------------------------------------------------- */
/* Storage                                                                 */
/* ---------------------------------------------------------------------- */

let progress = {};
let activePatternId = 1;
let customProblems = [];

function loadCustom() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function saveCustom() {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(customProblems));
  syncToServer();
}
function slugify(title) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let slug = base || "custom";
  let n = 1;
  while (PROBLEM_INDEX[slug] || customProblems.some((c) => c.slug === slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

function loadState() {
  try {
    progress = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch (e) {
    progress = {};
  }
  const savedPattern = Number(localStorage.getItem(ACTIVE_PATTERN_KEY));
  activePatternId = savedPattern && PATTERNS.some((p) => p.id === savedPattern) ? savedPattern : 1;

  customProblems = loadCustom();
  for (const c of customProblems) {
    PROBLEM_INDEX[c.slug] = { ...c, patternId: null, patternName: c.patternName };
  }

  if (Object.keys(progress).length === 0) {
    // First run: seed with real, already-logged history for pattern 1.
    for (const slug in SEED_PROGRESS) {
      const seed = SEED_PROGRESS[slug];
      const lastAttempt = seed.attempts[seed.attempts.length - 1];
      progress[slug] = {
        personalDifficulty: seed.personalDifficulty,
        box: seed.box,
        due: addDays(lastAttempt.date, BOX_INTERVAL_DAYS[seed.box]),
        attempts: seed.attempts,
      };
    }
    saveProgress();
    saveActivePattern(1);
  }
}

// When served from server.py (not opened as a bare file://), every save
// also gets pushed straight to data/progress.json in the repo — nothing to
// remember to export. localStorage stays as the always-on fallback/cache.
let serverAvailable = false;
function syncToServer() {
  ghScheduleSave();
  if (!serverAvailable) return;
  fetch("/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ progress, customProblems, activePatternId }),
  }).catch(() => {
    serverAvailable = false;
  });
}

/* GitHub mode: when hosted on GitHub Pages (no server.py), progress is read
   from data/progress.json in the repo and written back through the GitHub
   contents API with a fine-grained token kept only in this browser's
   localStorage. Without a token the page still works, saving to
   localStorage only. */
const GH = { owner: "percit", repo: "leetcode-tracker", path: "data/progress.json", branch: "main" };
const GH_TOKEN_KEY = "gridgrind.ghToken";
let ghMode = false;
let ghSha = null;
let ghTimer = null;

function ghToken() {
  try {
    return localStorage.getItem(GH_TOKEN_KEY) || "";
  } catch (e) {
    return "";
  }
}
function setSyncStatus(text, isError) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("err", !!isError);
}
function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64DecodeUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function ghHeaders() {
  const h = { Accept: "application/vnd.github+json" };
  const t = ghToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}
const GH_URL = `https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.path}`;

async function ghLoad() {
  const res = await fetch(`${GH_URL}?ref=${GH.branch}`, { headers: ghHeaders(), cache: "no-store" });
  if (!res.ok) return null;
  const j = await res.json();
  ghSha = j.sha;
  return JSON.parse(b64DecodeUtf8(j.content));
}
function ghScheduleSave() {
  if (!ghMode) return;
  if (!ghToken()) {
    setSyncStatus("zapis tylko w tej przeglądarce — dodaj token GitHub", true);
    return;
  }
  clearTimeout(ghTimer);
  setSyncStatus("zapisuję…");
  ghTimer = setTimeout(() => ghSave(true), 1500);
}
async function ghSave(retry) {
  const snapshot = { progress, customProblems, activePatternId };
  const body = {
    message: `progress update (web) ${new Date().toISOString().slice(0, 16)}`,
    content: b64EncodeUtf8(JSON.stringify(snapshot, null, 2) + "\n"),
    branch: GH.branch,
  };
  if (ghSha) body.sha = ghSha;
  try {
    const res = await fetch(GH_URL, { method: "PUT", headers: { ...ghHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if ((res.status === 409 || res.status === 422) && retry) {
      // File changed in the repo since we loaded it (e.g. saved from home) — refresh sha and retry once.
      const cur = await fetch(`${GH_URL}?ref=${GH.branch}`, { headers: ghHeaders(), cache: "no-store" });
      if (cur.ok) ghSha = (await cur.json()).sha;
      return ghSave(false);
    }
    if (!res.ok) {
      setSyncStatus(res.status === 401 || res.status === 403 ? "token odrzucony — sprawdź token GitHub" : `błąd zapisu (${res.status})`, true);
      return;
    }
    ghSha = (await res.json()).content.sha;
    setSyncStatus("zapisano w repo ✓");
  } catch (e) {
    setSyncStatus("brak połączenia — zapisane tylko lokalnie", true);
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  syncToServer();
}
function saveActivePattern(id) {
  activePatternId = id;
  localStorage.setItem(ACTIVE_PATTERN_KEY, String(id));
  syncToServer();
}

function getProgress(slug) {
  return progress[slug] || { personalDifficulty: null, box: 0, due: null, attempts: [] };
}

/* ---------------------------------------------------------------------- */
/* Problem lookup                                                         */
/* ---------------------------------------------------------------------- */

const PROBLEM_INDEX = {}; // slug -> { ...problem, patternId, patternName }
for (const pattern of PATTERNS) {
  for (const prob of pattern.problems) {
    if (!PROBLEM_INDEX[prob.slug]) {
      PROBLEM_INDEX[prob.slug] = { ...prob, patternId: pattern.id, patternName: pattern.name };
    }
  }
}

function hasAnyAttempt(slug) {
  return (progress[slug]?.attempts.length || 0) > 0;
}
function isSolved(slug) {
  const p = progress[slug];
  if (!p || p.attempts.length === 0) return false;
  return p.attempts.some((a) => a.outcome !== "failed");
}

function patternStats(pattern) {
  const easy = pattern.problems.filter((p) => p.difficulty === "Easy");
  const med = pattern.problems.filter((p) => p.difficulty === "Medium");
  const easySolved = easy.filter((p) => isSolved(p.slug)).length;
  const medSolved = med.filter((p) => isSolved(p.slug)).length;
  const attempted = pattern.problems.filter((p) => hasAnyAttempt(p.slug)).length;
  return {
    easyTotal: easy.length,
    medTotal: med.length,
    easySolved,
    medSolved,
    total: pattern.problems.length,
    attempted,
  };
}

/* ---------------------------------------------------------------------- */
/* Adaptive suggestion + due reviews                                      */
/* ---------------------------------------------------------------------- */

function getSuggestion() {
  let guard = 0;
  let id = activePatternId;
  while (guard < PATTERNS.length + 1) {
    guard += 1;
    const pattern = PATTERNS.find((p) => p.id === id);
    if (!pattern) return null;
    const stats = patternStats(pattern);

    const nextEasy = pattern.problems.find((p) => p.difficulty === "Easy" && !hasAnyAttempt(p.slug));
    if (stats.easySolved < EASY_UNLOCK_MEDIUM && nextEasy) {
      return { problem: nextEasy, pattern };
    }
    const nextMedium = pattern.problems.find((p) => p.difficulty === "Medium" && !hasAnyAttempt(p.slug));
    if (stats.medSolved < MEDIUM_ADVANCE_NEXT && nextMedium) {
      return { problem: nextMedium, pattern };
    }
    // This pattern is either cleared or exhausted in scope — move to the next one.
    id += 1;
    if (id > PATTERNS.length) return null;
    saveActivePattern(id);
  }
  return null;
}

function getDueReviews() {
  const today = todayStamp();
  const out = [];
  for (const slug in progress) {
    const p = progress[slug];
    if (p.attempts.length > 0 && p.due && p.due <= today) {
      const info = PROBLEM_INDEX[slug];
      if (!info) continue;
      out.push({ slug, ...info, due: p.due, box: p.box, personalDifficulty: p.personalDifficulty, overdueDays: daysBetween(p.due, today) });
    }
  }
  out.sort((a, b) => a.due.localeCompare(b.due));
  return out;
}

// The single most important thing to do right now: the most overdue review
// if anything is due, otherwise the adaptive "next new problem" suggestion.
function getFocusItem() {
  const reviews = getDueReviews();
  if (reviews.length > 0) {
    const r = reviews[0];
    return {
      type: "review",
      slug: r.slug,
      title: r.title,
      url: r.url,
      difficulty: r.difficulty,
      patternName: r.patternName,
      overdueDays: r.overdueDays,
      queueCount: reviews.length,
    };
  }
  const suggestion = getSuggestion();
  if (!suggestion) return null;
  return {
    type: "new",
    slug: suggestion.problem.slug,
    title: suggestion.problem.title,
    url: suggestion.problem.url,
    difficulty: suggestion.problem.difficulty,
    patternName: suggestion.pattern.name,
    queueCount: 0,
  };
}

function overallStats() {
  let solved = 0;
  let total = 0;
  for (const pattern of PATTERNS) total += pattern.problems.length;
  const seen = new Set();
  for (const slug in progress) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (isSolved(slug)) solved += 1;
  }
  return { solved, total };
}

function currentStreak() {
  const days = new Set();
  for (const slug in progress) {
    for (const a of progress[slug].attempts) days.add(a.date);
  }
  if (days.size === 0) return 0;
  const sorted = [...days].sort().reverse();
  const today = todayStamp();
  const yesterday = addDays(today, -1);
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;
  let streak = 1;
  let cursor = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const expected = addDays(cursor, -1);
    if (sorted[i] === expected) {
      streak += 1;
      cursor = sorted[i];
    } else if (sorted[i] === cursor) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}

/* ---------------------------------------------------------------------- */
/* DOM refs                                                                */
/* ---------------------------------------------------------------------- */

const els = {
  nav: document.getElementById("nav"),
  statStrip: document.getElementById("statStrip"),
  viewHome: document.getElementById("viewHome"),
  viewBrowse: document.getElementById("viewBrowse"),
  viewSession: document.getElementById("viewSession"),
  focusHeading: document.getElementById("focusHeading"),
  suggestCard: document.getElementById("suggestCard"),
  patternList: document.getElementById("patternList"),
  customList: document.getElementById("customList"),
  addCustomToggle: document.getElementById("addCustomToggle"),
  addCustomForm: document.getElementById("addCustomForm"),
  customTitle: document.getElementById("customTitle"),
  customUrl: document.getElementById("customUrl"),
  customDiffSelect: document.getElementById("customDiffSelect"),
  customPattern: document.getElementById("customPattern"),
  cancelCustomBtn: document.getElementById("cancelCustomBtn"),
  saveCustomBtn: document.getElementById("saveCustomBtn"),
  backBtn: document.getElementById("backBtn"),
  sessionHead: document.getElementById("sessionHead"),
  sessionTitle: document.getElementById("sessionTitle"),
  openLeetcodeBtn: document.getElementById("openLeetcodeBtn"),
  timerDisplay: document.getElementById("timerDisplay"),
  timerStartBtn: document.getElementById("timerStartBtn"),
  timerResetBtn: document.getElementById("timerResetBtn"),
  finishBtn: document.getElementById("finishBtn"),
  savedNote: document.getElementById("savedNote"),
  outcomeForm: document.getElementById("outcomeForm"),
  outcomeRow: document.getElementById("outcomeRow"),
  diffSelect: document.getElementById("diffSelect"),
  notesInput: document.getElementById("notesInput"),
  codeInput: document.getElementById("codeInput"),
  cancelSaveBtn: document.getElementById("cancelSaveBtn"),
  saveAttemptBtn: document.getElementById("saveAttemptBtn"),
  postAttemptBlock: document.getElementById("postAttemptBlock"),
  attemptsLog: document.getElementById("attemptsLog"),
  idealInput: document.getElementById("idealInput"),
  idealUncertain: document.getElementById("idealUncertain"),
  saveIdealBtn: document.getElementById("saveIdealBtn"),
  exportOneBtn: document.getElementById("exportOneBtn"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  ghTokenBtn: document.getElementById("ghTokenBtn"),
  importJsonBtn: document.getElementById("importJsonBtn"),
  importJsonFile: document.getElementById("importJsonFile"),
};

let expandedPatterns = new Set();
let mainView = "home"; // "home" | "browse" — remembered so "back" from session returns correctly

/* ---------------------------------------------------------------------- */
/* Rendering: top-level views                                             */
/* ---------------------------------------------------------------------- */

function renderStatStrip() {
  const { solved, total } = overallStats();
  const streak = currentStreak();
  const activePattern = PATTERNS.find((p) => p.id === activePatternId);
  els.statStrip.innerHTML = `
    <span><b>${solved}</b> / ${total} rozwiązane</span>
    <span>◆ streak <b>${streak}</b> ${streak === 1 ? "dzień" : "dni"}</span>
    <span>aktywny pattern: <b>${activePattern ? activePattern.name : "—"}</b></span>
  `;
}

function showMainView(name) {
  mainView = name;
  els.viewHome.hidden = name !== "home";
  els.viewBrowse.hidden = name !== "browse";
  els.viewSession.hidden = true;
  [...els.nav.children].forEach((b) => b.classList.toggle("active", b.dataset.view === name));
}

function renderHome() {
  const focus = getFocusItem();

  if (!focus) {
    els.focusHeading.textContent = "Gotowe";
    els.suggestCard.innerHTML = `<p class="empty-note">Wszystkie zadania Easy/Medium ze wszystkich 41 patternów zaliczone. 🎉 Czas na Hard albo powtórki.</p>`;
    return;
  }

  const isReview = focus.type === "review";
  els.focusHeading.textContent = isReview ? "Zaległa powtórka" : "Następne zadanie";

  els.suggestCard.innerHTML = `
    <div class="suggest-top">
      <span class="pattern-tag">${focus.patternName}</span>
      <span class="diff-tag ${focus.difficulty}">${focus.difficulty}</span>
      ${isReview ? `<span class="diff-tag Hard">${focus.overdueDays === 0 ? "dziś" : focus.overdueDays + "d spóźnione"}</span>` : ""}
    </div>
    <h3 class="suggest-title">${focus.title}</h3>
    <div class="suggest-actions">
      <button class="btn primary" id="startSuggestedBtn">Start (${TIMER_MIN[focus.difficulty]} min)</button>
    </div>
    ${isReview && focus.queueCount > 1 ? `<p class="warn-line">+ ${focus.queueCount - 1} kolejnych w kolejce — po zapisaniu wyniku zobaczysz następne.</p>` : ""}
  `;
  document.getElementById("startSuggestedBtn").addEventListener("click", () => openSession(focus.slug));
}

function statusChipFor(slug) {
  const p = progress[slug];
  if (!p || p.attempts.length === 0) return { cls: "new", label: "nowe" };
  if (p.box >= 4) return { cls: "mastered", label: "opanowane" };
  const today = todayStamp();
  if (p.due <= today) {
    const overdue = daysBetween(p.due, today);
    return overdue > 3 ? { cls: "overdue", label: overdue + "d spóźnione" } : { cls: "due", label: "do powtórki" };
  }
  return { cls: "new", label: "w trakcie" };
}

function renderCustomList() {
  if (customProblems.length === 0) {
    els.customList.innerHTML = "";
    return;
  }
  const rows = customProblems
    .map((c) => {
      const chip = statusChipFor(c.slug);
      return `
        <div class="problem-row" data-slug="${c.slug}">
          <span class="problem-left">
            <span class="diff-tag ${c.difficulty}">${c.difficulty[0]}</span>
            <span class="problem-title">${c.title}</span>
          </span>
          <span class="status-chip ${chip.cls}">${chip.label}</span>
        </div>
      `;
    })
    .join("");
  els.customList.innerHTML = `
    <div class="pattern-item">
      <div class="pattern-head"><span class="pattern-name">Własne zadania</span></div>
      <div class="problem-list">${rows}</div>
    </div>
  `;
  els.customList.querySelectorAll(".problem-row").forEach((row) => {
    row.addEventListener("click", () => openSession(row.dataset.slug));
  });
}

function renderBrowse() {
  renderCustomList();
  els.patternList.innerHTML = "";
  PATTERNS.forEach((pattern) => {
    const stats = patternStats(pattern);
    const item = document.createElement("div");
    item.className = "pattern-item";
    const pct = stats.total ? Math.round((stats.attempted / stats.total) * 100) : 0;
    const isExpanded = expandedPatterns.has(pattern.id);

    const head = document.createElement("div");
    head.className = "pattern-head";
    head.innerHTML = `
      <span class="pattern-name"><span class="idx">${pattern.id}.</span> ${pattern.name} ${pattern.id === activePatternId ? '<span class="pattern-active-mark">● aktywny</span>' : ""}</span>
      <span class="pattern-progress">
        <span class="pattern-count">${stats.attempted}/${stats.total} (E:${stats.easySolved}/${stats.easyTotal} M:${stats.medSolved}/${stats.medTotal})</span>
        <span class="pattern-bar"><span class="pattern-bar-fill" style="width:${pct}%"></span></span>
      </span>
    `;
    head.addEventListener("click", () => {
      if (expandedPatterns.has(pattern.id)) expandedPatterns.delete(pattern.id);
      else expandedPatterns.add(pattern.id);
      renderBrowse();
    });
    item.appendChild(head);

    if (isExpanded) {
      const list = document.createElement("div");
      list.className = "problem-list";
      pattern.problems.forEach((prob) => {
        const chip = statusChipFor(prob.slug);
        const row = document.createElement("div");
        row.className = "problem-row";
        row.innerHTML = `
          <span class="problem-left">
            <span class="diff-tag ${prob.difficulty}">${prob.difficulty[0]}</span>
            <span class="problem-title">${prob.title}</span>
          </span>
          <span class="status-chip ${chip.cls}">${chip.label}</span>
        `;
        row.addEventListener("click", () => openSession(prob.slug));
        list.appendChild(row);
      });
      item.appendChild(list);
    }

    els.patternList.appendChild(item);
  });
}

/* ---------------------------------------------------------------------- */
/* Session view                                                           */
/* ---------------------------------------------------------------------- */

let currentSlug = null;
let elapsedSec = 0;
let budgetSec = 0;
let timerInterval = null;
let timerRunning = false;
let selectedOutcome = null;
let selectedDiff = null;

function formatMMSS(totalSec) {
  const sign = totalSec < 0 ? "+" : "";
  const abs = Math.abs(totalSec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateTimerDisplay() {
  const remaining = budgetSec - elapsedSec;
  els.timerDisplay.textContent = formatMMSS(remaining);
  els.timerDisplay.classList.toggle("over", remaining < 0);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  els.timerStartBtn.textContent = "Start";
}

function openSession(slug, opts = {}) {
  currentSlug = slug;
  const info = PROBLEM_INDEX[slug];
  if (!info) return;

  if (!opts.noOpenTab && info.url) {
    window.open(info.url, "_blank", "noopener");
  }

  const p = getProgress(slug);
  els.sessionHead.innerHTML = `
    <span class="pattern-tag">${info.patternName}</span>
    <span class="diff-tag ${info.difficulty}">${info.difficulty}</span>
  `;
  els.sessionTitle.textContent = info.title;
  els.openLeetcodeBtn.href = info.url || "#";
  els.openLeetcodeBtn.style.display = info.url ? "" : "none";

  budgetSec = (TIMER_MIN[info.difficulty] || 30) * 60;
  elapsedSec = 0;
  stopTimer();
  updateTimerDisplay();

  // History, and the reference solution, stay hidden until this attempt is
  // saved — seeing your own past notes before trying biases the attempt.
  selectedOutcome = null;
  selectedDiff = p.personalDifficulty;
  els.outcomeForm.hidden = true;
  els.finishBtn.hidden = false;
  els.savedNote.hidden = true;
  els.postAttemptBlock.hidden = true;
  els.notesInput.value = "";
  els.codeInput.value = "";
  [...els.outcomeRow.children].forEach((b) => b.classList.remove("selected", "clean", "struggled", "failed"));
  [...els.diffSelect.children].forEach((b) => b.classList.toggle("selected", b.dataset.diff === selectedDiff));
  els.saveAttemptBtn.disabled = true;

  els.idealInput.value = p.idealSolution || "";
  els.idealUncertain.checked = !!p.idealSolutionUncertain;

  renderAttemptsLog(p);

  els.viewHome.hidden = true;
  els.viewBrowse.hidden = true;
  els.viewSession.hidden = false;
}

function renderAttemptsLog(p) {
  if (p.attempts.length === 0) {
    els.attemptsLog.innerHTML = "";
    return;
  }
  const outcomeLabel = { clean: "✅ sprawnie", struggled: "🟡 ciężko", failed: "❌ nie rozwiązane" };
  const rows = p.attempts
    .slice()
    .reverse()
    .map((a) => {
      const codeBlock = a.code
        ? `<details class="code-details"><summary>kod</summary><pre class="code-pre">${escapeHtml(a.code)}</pre></details>`
        : "";
      return `<div class="attempt-entry"><b>${a.date}</b> — ${outcomeLabel[a.outcome]}${a.timeSec ? " · " + Math.round(a.timeSec / 60) + " min" : ""}${a.note ? " — " + escapeHtml(a.note) : ""}${codeBlock}</div>`;
    })
    .join("");
  els.attemptsLog.innerHTML = `<div class="field-label">Historia prób</div>${rows}`;
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

els.timerStartBtn.addEventListener("click", () => {
  if (timerRunning) {
    stopTimer();
    return;
  }
  timerRunning = true;
  els.timerStartBtn.textContent = "Pauza";
  timerInterval = setInterval(() => {
    elapsedSec += 1;
    updateTimerDisplay();
  }, 1000);
});

els.timerResetBtn.addEventListener("click", () => {
  stopTimer();
  elapsedSec = 0;
  updateTimerDisplay();
});

els.finishBtn.addEventListener("click", () => {
  stopTimer();
  els.outcomeForm.hidden = false;
  els.finishBtn.hidden = true;
});

els.outcomeRow.addEventListener("click", (e) => {
  const btn = e.target.closest(".outcome-btn");
  if (!btn) return;
  selectedOutcome = btn.dataset.outcome;
  [...els.outcomeRow.children].forEach((b) => {
    b.classList.remove("selected", "clean", "struggled", "failed");
  });
  btn.classList.add("selected", selectedOutcome);
  els.saveAttemptBtn.disabled = false;
});

els.diffSelect.addEventListener("click", (e) => {
  const btn = e.target.closest(".diff-opt");
  if (!btn) return;
  selectedDiff = btn.dataset.diff;
  [...els.diffSelect.children].forEach((b) => b.classList.toggle("selected", b === btn));
});

els.cancelSaveBtn.addEventListener("click", () => {
  els.outcomeForm.hidden = true;
  els.finishBtn.hidden = false;
});

els.saveAttemptBtn.addEventListener("click", () => {
  if (!selectedOutcome || !currentSlug) return;
  const p = getProgress(currentSlug);
  const attempt = {
    date: todayStamp(),
    outcome: selectedOutcome,
    timeSec: elapsedSec || null,
    note: els.notesInput.value.trim(),
    code: els.codeInput.value.trim() || null,
  };
  p.attempts.push(attempt);
  if (selectedDiff) p.personalDifficulty = selectedDiff;

  let box = p.box || 0;
  if (selectedOutcome === "clean") box = Math.min(BOX_INTERVAL_DAYS.length - 1, box + 1);
  else if (selectedOutcome === "failed") box = 0;
  p.box = box;
  p.due = addDays(todayStamp(), BOX_INTERVAL_DAYS[box]);

  progress[currentSlug] = p;
  saveProgress();

  // Stay on the session view and reveal history/reference now that this
  // attempt is locked in — don't auto-navigate away.
  els.outcomeForm.hidden = true;
  els.savedNote.hidden = false;
  els.postAttemptBlock.hidden = false;
  renderAttemptsLog(p);
});

els.backBtn.addEventListener("click", () => {
  stopTimer();
  showMainView(mainView);
  renderAll();
});

els.saveIdealBtn.addEventListener("click", () => {
  if (!currentSlug) return;
  const p = getProgress(currentSlug);
  p.idealSolution = els.idealInput.value.trim() || null;
  p.idealSolutionUncertain = els.idealUncertain.checked;
  progress[currentSlug] = p;
  saveProgress();
  els.saveIdealBtn.textContent = "Zapisano ✓";
  setTimeout(() => {
    els.saveIdealBtn.textContent = "Zapisz";
  }, 1200);
});

/* ---------------------------------------------------------------------- */
/* Export to Obsidian-style Markdown                                      */
/* ---------------------------------------------------------------------- */

const OUTCOME_MD_LABEL = { clean: "sprawnie", struggled: "ciężko", failed: "nie rozwiązane" };

function buildProblemMarkdown(slug) {
  const info = PROBLEM_INDEX[slug];
  const p = progress[slug];
  if (!info || !p) return "";

  let md = info.url ? `### [${info.title}](${info.url})\n` : `### ${info.title}\n`;
  md += `- pattern: ${info.patternName} · trudność: ${info.difficulty}${p.personalDifficulty ? " · dla mnie: " + p.personalDifficulty : ""}\n`;
  for (const a of p.attempts) {
    const label = OUTCOME_MD_LABEL[a.outcome] || a.outcome;
    const mins = a.timeSec ? ` (${Math.round(a.timeSec / 60)} min)` : "";
    const note = a.note ? ` — ${a.note}` : "";
    md += `- ${a.date}: ${label}${mins}${note}\n`;
  }
  md += "\n";

  const withCode = p.attempts.filter((a) => a.code);
  if (withCode.length > 0) {
    const latest = withCode[withCode.length - 1];
    md += "```\n" + latest.code + "\n```\n\n";
    if (withCode.length > 1) {
      const first = withCode[0];
      md += `wcześniejsza wersja (${first.date}):\n\`\`\`\n${first.code}\n\`\`\`\n\n`;
    }
  }
  if (p.idealSolution) {
    const label = p.idealSolutionUncertain
      ? "najlepsze znane rozwiązanie (niepewne czy optymalne)"
      : "idealne rozwiązanie";
    md += `${label}:\n\`\`\`\n${p.idealSolution}\n\`\`\`\n\n`;
  }
  return md;
}

function downloadText(filename, text, mime = "text/markdown") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

els.exportOneBtn.addEventListener("click", () => {
  if (!currentSlug) return;
  downloadText(`${currentSlug}.md`, buildProblemMarkdown(currentSlug));
});

els.exportAllBtn.addEventListener("click", () => {
  const slugs = Object.keys(progress).filter((slug) => progress[slug].attempts.length > 0 || progress[slug].idealSolution);
  // Group key sorts numbered patterns in order, custom groups (patternId
  // null) last — plain Number(patternId) breaks for those, so use strings.
  const byPattern = {};
  for (const slug of slugs) {
    const info = PROBLEM_INDEX[slug];
    if (!info) continue;
    const key = info.patternId != null ? String(info.patternId).padStart(3, "0") : "zzz-" + info.patternName;
    if (!byPattern[key]) byPattern[key] = { name: info.patternName, slugs: [] };
    byPattern[key].slugs.push(slug);
  }
  const keys = Object.keys(byPattern).sort();
  let md = "";
  for (const key of keys) {
    md += `## ${byPattern[key].name}\n\n`;
    for (const slug of byPattern[key].slugs) md += buildProblemMarkdown(slug);
  }
  downloadText("gridgrind-export.md", md || "Brak zapisanych prób.\n");
});

/* ---------------------------------------------------------------------- */
/* JSON snapshot — the only way progress actually gets into git, since a  */
/* browser page can't write into the repo directly.                       */
/* ---------------------------------------------------------------------- */

els.exportJsonBtn.addEventListener("click", () => {
  const snapshot = { progress, customProblems, activePatternId, exportedAt: new Date().toISOString() };
  downloadText("gridgrind-progress.json", JSON.stringify(snapshot, null, 2), "application/json");
});

els.ghTokenBtn.addEventListener("click", () => {
  const cur = ghToken();
  const t = prompt(
    "Wklej token GitHub (fine-grained, tylko repo leetcode-tracker, Contents: Read and write).\nZostaje tylko w tej przeglądarce. Puste = usuń token.",
    cur ? "(token zapisany — wklej nowy albo zostaw puste, by usunąć)" : ""
  );
  if (t === null || t.startsWith("(token zapisany")) return;
  try {
    if (t.trim()) localStorage.setItem(GH_TOKEN_KEY, t.trim());
    else localStorage.removeItem(GH_TOKEN_KEY);
  } catch (e) {}
  setSyncStatus(t.trim() ? "token zapisany ✓" : "token usunięty", !t.trim());
  if (t.trim()) ghScheduleSave();
});

els.importJsonBtn.addEventListener("click", () => {
  els.importJsonFile.click();
});

els.importJsonFile.addEventListener("change", () => {
  const file = els.importJsonFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      alert("Nie udało się wczytać pliku — to nie jest poprawny JSON.");
      return;
    }
    if (!confirm("To nadpisze cały obecny progress w tej przeglądarce danymi z pliku. Kontynuować?")) return;
    progress = data.progress || {};
    customProblems = data.customProblems || [];
    for (const c of customProblems) PROBLEM_INDEX[c.slug] = { ...c, patternId: null };
    saveProgress();
    saveCustom();
    if (data.activePatternId) saveActivePattern(data.activePatternId);
    els.importJsonFile.value = "";
    showMainView("home");
    renderAll();
  };
  reader.readAsText(file);
});

/* ---------------------------------------------------------------------- */
/* Manually adding a problem that isn't in the seeded pattern list         */
/* ---------------------------------------------------------------------- */

let selectedCustomDiff = "Easy";

function resetCustomForm() {
  els.customTitle.value = "";
  els.customUrl.value = "";
  els.customPattern.value = "Własne zadania";
  selectedCustomDiff = "Easy";
  [...els.customDiffSelect.children].forEach((b) => b.classList.toggle("selected", b.dataset.diff === selectedCustomDiff));
}

els.addCustomToggle.addEventListener("click", () => {
  const showing = !els.addCustomForm.hidden;
  els.addCustomForm.hidden = showing;
  if (!showing) resetCustomForm();
});

els.cancelCustomBtn.addEventListener("click", () => {
  els.addCustomForm.hidden = true;
});

els.customDiffSelect.addEventListener("click", (e) => {
  const btn = e.target.closest(".diff-opt");
  if (!btn) return;
  selectedCustomDiff = btn.dataset.diff;
  [...els.customDiffSelect.children].forEach((b) => b.classList.toggle("selected", b === btn));
});

els.saveCustomBtn.addEventListener("click", () => {
  const title = els.customTitle.value.trim();
  if (!title) return;
  const slug = slugify(title);
  const custom = {
    slug,
    title,
    url: els.customUrl.value.trim() || null,
    difficulty: selectedCustomDiff,
    patternName: els.customPattern.value.trim() || "Własne zadania",
  };
  customProblems.push(custom);
  saveCustom();
  PROBLEM_INDEX[slug] = { ...custom, patternId: null };
  els.addCustomForm.hidden = true;
  resetCustomForm();
  renderBrowse();
});

/* ---------------------------------------------------------------------- */
/* Nav + boot                                                              */
/* ---------------------------------------------------------------------- */

els.nav.addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-btn");
  if (!btn) return;
  showMainView(btn.dataset.view);
  renderAll();
});

function renderAll() {
  renderStatStrip();
  if (mainView === "home") renderHome();
  else renderBrowse();
}

async function bootGitHub() {
  // Only on a real website (GitHub Pages), never for a local file:// page.
  if (!/^https?:$/.test(location.protocol) || ["127.0.0.1", "localhost"].includes(location.hostname)) {
    loadState();
    return;
  }
  ghMode = true;
  els.ghTokenBtn.hidden = false;
  setSyncStatus("wczytuję z repo…");
  let data = null;
  try {
    data = await ghLoad();
  } catch (e) {
    data = null;
  }
  if (data) {
    progress = data.progress || {};
    customProblems = data.customProblems || [];
    for (const c of customProblems) PROBLEM_INDEX[c.slug] = { ...c, patternId: null };
    activePatternId = data.activePatternId && PATTERNS.some((p) => p.id === data.activePatternId) ? data.activePatternId : 1;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(customProblems));
      localStorage.setItem(ACTIVE_PATTERN_KEY, String(activePatternId));
    } catch (e) {}
    setSyncStatus(ghToken() ? "zsynchronizowane z repo ✓" : "tylko odczyt — dodaj token GitHub, żeby zapisywać", !ghToken());
  } else {
    loadState();
    setSyncStatus("nie udało się wczytać z repo — używam danych z przeglądarki", true);
  }
}

async function boot() {
  try {
    const res = await fetch("/load");
    if (res.ok) {
      serverAvailable = true;
      const data = await res.json();
      if (data) {
        progress = data.progress || {};
        customProblems = data.customProblems || [];
        for (const c of customProblems) PROBLEM_INDEX[c.slug] = { ...c, patternId: null };
        activePatternId = data.activePatternId && PATTERNS.some((p) => p.id === data.activePatternId) ? data.activePatternId : 1;
      } else {
        // Server is up but data/progress.json doesn't exist yet — bootstrap
        // from localStorage (or the seed), then push it to create the file.
        loadState();
      }
    } else {
      await bootGitHub();
    }
  } catch (e) {
    // Opened as a plain file:// page, or server.py isn't running — fall
    // back to localStorage only, exactly like before this feature existed.
    serverAvailable = false;
    await bootGitHub();
  }
  showMainView("home");
  renderAll();
}

boot();
