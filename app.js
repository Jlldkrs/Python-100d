/* ── Constants ────────────────────────────────────────── */
const FEYENOORD_ID  = 674;
const API_BASE      = 'https://api.football-data.org/v4';
const STORAGE_KEY   = 'fey_api_key';

/* ── State ────────────────────────────────────────────── */
let apiKey = localStorage.getItem(STORAGE_KEY) || '';

/* ── DOM refs ─────────────────────────────────────────── */
const tabs          = document.querySelectorAll('.tab');
const panels        = document.querySelectorAll('.tab-panel');
const resultsList   = document.getElementById('results-list');
const upcomingList  = document.getElementById('upcoming-list');
const errorMsg      = document.getElementById('error-msg');
const errorText     = document.getElementById('error-text');
const retryBtn      = document.getElementById('retry-btn');
const apiBanner     = document.getElementById('api-key-banner');
const apiInput      = document.getElementById('api-key-input');
const apiSaveBtn    = document.getElementById('api-key-save');

/* ── Tab switching ────────────────────────────────────── */
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
  });
});

/* ── API key banner ───────────────────────────────────── */
function showBannerIfNoKey() {
  if (!apiKey) apiBanner.classList.remove('hidden');
}

apiSaveBtn.addEventListener('click', () => {
  const val = apiInput.value.trim();
  if (!val) return;
  apiKey = val;
  localStorage.setItem(STORAGE_KEY, val);
  apiBanner.classList.add('hidden');
  loadAll();
});

/* ── Fetch helper ─────────────────────────────────────── */
async function apiFetch(path) {
  const headers = apiKey ? { 'X-Auth-Token': apiKey } : {};
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ── Date helpers ─────────────────────────────────────── */
function fmtDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(str) {
  const d = new Date(str);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/* ── Result helpers ───────────────────────────────────── */
function getResult(match) {
  if (match.status !== 'FINISHED') return null;
  const { home, away } = match.score.fullTime;
  const feyHome = match.homeTeam.id === FEYENOORD_ID;
  const feyGoals = feyHome ? home : away;
  const oppGoals = feyHome ? away : home;
  if (feyGoals > oppGoals) return 'W';
  if (feyGoals < oppGoals) return 'L';
  return 'D';
}

/* ── Logo helper ──────────────────────────────────────── */
function logoUrl(teamId) {
  return `https://crests.football-data.org/${teamId}.png`;
}

/* ── Prediction engine ────────────────────────────────── */
/**
 * Simple form-based predictor.
 * Weights: win=3, draw=1, loss=0. Normalises to probability.
 * Home advantage adds a small boost.
 */
function predict(recentMatches) {
  // Separate last-5 finished matches for form score
  const finished = recentMatches.filter(m => m.status === 'FINISHED').slice(-5);

  let feyPts = 0, maxPts = 0;
  finished.forEach(m => {
    const r = getResult(m);
    maxPts += 3;
    if (r === 'W') feyPts += 3;
    else if (r === 'D') feyPts += 1;
  });

  const formRatio = maxPts ? feyPts / maxPts : 0.45; // fallback to average

  // Base probabilities from form
  let winP  = 0.35 + formRatio * 0.30;   // 35–65 %
  let lossP = 0.20 + (1 - formRatio) * 0.20; // 20–40 %
  let drawP = Math.max(0.05, 1 - winP - lossP);

  // Normalise to sum=1
  const total = winP + drawP + lossP;
  winP  = winP  / total;
  drawP = drawP / total;
  lossP = lossP / total;

  return {
    win:  Math.round(winP  * 100),
    draw: Math.round(drawP * 100),
    loss: Math.round(lossP * 100),
  };
}

/* ── Render: result card ──────────────────────────────── */
function renderResultCard(match) {
  const feyHome = match.homeTeam.id === FEYENOORD_ID;
  const result  = getResult(match);
  const { home, away } = match.score.fullTime;

  const card = document.createElement('div');
  card.className = `match-card${feyHome ? ' fey-home' : ''}`;

  card.innerHTML = `
    <div class="card-header">
      <span class="comp-badge">${match.competition.name}</span>
      <span class="match-date">${fmtDate(match.utcDate)}</span>
    </div>
    <div class="card-body">
      <div class="team home">
        <img class="team-logo" src="${logoUrl(match.homeTeam.id)}"
             alt="${match.homeTeam.shortName || match.homeTeam.name}"
             onerror="this.style.visibility='hidden'" />
        <span class="team-name">${match.homeTeam.shortName || match.homeTeam.name}</span>
      </div>
      <div class="score-block">
        <div class="score">${home ?? '?'} – ${away ?? '?'}</div>
        ${result ? `<span class="result-pill ${result}">${result}</span>` : ''}
      </div>
      <div class="team away">
        <img class="team-logo" src="${logoUrl(match.awayTeam.id)}"
             alt="${match.awayTeam.shortName || match.awayTeam.name}"
             onerror="this.style.visibility='hidden'" />
        <span class="team-name">${match.awayTeam.shortName || match.awayTeam.name}</span>
      </div>
    </div>
  `;
  return card;
}

/* ── Render: upcoming card ────────────────────────────── */
function renderUpcomingCard(match, pred) {
  const feyHome = match.homeTeam.id === FEYENOORD_ID;

  const card = document.createElement('div');
  card.className = `match-card${feyHome ? ' fey-home' : ''}`;

  card.innerHTML = `
    <div class="card-header">
      <span class="comp-badge">${match.competition.name}</span>
      <span class="match-date">${fmtDate(match.utcDate)} · ${fmtTime(match.utcDate)}</span>
    </div>
    <div class="card-body">
      <div class="team home">
        <img class="team-logo" src="${logoUrl(match.homeTeam.id)}"
             alt="${match.homeTeam.shortName || match.homeTeam.name}"
             onerror="this.style.visibility='hidden'" />
        <span class="team-name">${match.homeTeam.shortName || match.homeTeam.name}</span>
      </div>
      <div class="score-block">
        <div class="score" style="font-size:1.1rem;letter-spacing:1px;color:#aaa">vs</div>
      </div>
      <div class="team away">
        <img class="team-logo" src="${logoUrl(match.awayTeam.id)}"
             alt="${match.awayTeam.shortName || match.awayTeam.name}"
             onerror="this.style.visibility='hidden'" />
        <span class="team-name">${match.awayTeam.shortName || match.awayTeam.name}</span>
      </div>
    </div>
    <div class="prediction-bar">
      <div class="pred-segment">
        <span class="pred-label">Feyenoord win</span>
        <span class="pred-pct">${pred.win}%</span>
      </div>
      <div class="pred-segment">
        <span class="pred-label">Draw</span>
        <span class="pred-pct">${pred.draw}%</span>
      </div>
      <div class="pred-segment">
        <span class="pred-label">${(feyHome ? match.awayTeam.shortName : match.homeTeam.shortName) || 'Opponent'} win</span>
        <span class="pred-pct">${pred.loss}%</span>
      </div>
    </div>
  `;
  return card;
}

/* ── Error display ────────────────────────────────────── */
function showError(msg) {
  errorText.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
}

/* ── Main loader ──────────────────────────────────────── */
async function loadAll() {
  hideError();

  // Show skeletons
  resultsList.innerHTML  = '<div class="skeleton-card"></div>'.repeat(5);
  upcomingList.innerHTML = '<div class="skeleton-card"></div>'.repeat(3);

  try {
    const now       = new Date();
    const pastDate  = new Date(now);  pastDate.setDate(now.getDate() - 120);
    const futureDate= new Date(now); futureDate.setDate(now.getDate() + 60);

    const fmt = d => d.toISOString().slice(0, 10);

    // Fetch all matches in window
    const data = await apiFetch(
      `/teams/${FEYENOORD_ID}/matches?dateFrom=${fmt(pastDate)}&dateTo=${fmt(futureDate)}&limit=30`
    );

    const allMatches = data.matches || [];

    const finished = allMatches
      .filter(m => m.status === 'FINISHED')
      .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
      .slice(0, 8);

    const upcoming = allMatches
      .filter(m => m.status !== 'FINISHED')
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
      .slice(0, 6);

    // Prediction based on recent form
    const pred = predict(finished);

    // Render results
    resultsList.innerHTML = '';
    if (finished.length === 0) {
      resultsList.innerHTML = '<p style="color:#aaa;text-align:center;padding:24px">No recent results found.</p>';
    } else {
      finished.forEach(m => resultsList.appendChild(renderResultCard(m)));
    }

    // Render upcoming
    upcomingList.innerHTML = '';
    if (upcoming.length === 0) {
      upcomingList.innerHTML = '<p style="color:#aaa;text-align:center;padding:24px">No upcoming fixtures found.</p>';
    } else {
      upcoming.forEach(m => upcomingList.appendChild(renderUpcomingCard(m, pred)));
    }

  } catch (err) {
    resultsList.innerHTML  = '';
    upcomingList.innerHTML = '';

    if (err.message.includes('403') || err.message.includes('401')) {
      showError('API key required or invalid. Enter your football-data.org key below.');
      apiBanner.classList.remove('hidden');
    } else if (err.message.includes('429')) {
      showError('Rate limit reached. Please wait a minute and retry.');
    } else {
      showError('Could not load match data. Check your connection and retry.');
    }
  }
}

/* ── Retry button ─────────────────────────────────────── */
retryBtn.addEventListener('click', loadAll);

/* ── Boot ─────────────────────────────────────────────── */
showBannerIfNoKey();
loadAll();
