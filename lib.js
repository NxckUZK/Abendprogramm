/* lib.js — shared helpers, translations, timer + history logic.
 * Loaded via importScripts() in background.js and <script> in the pages.
 *
 * Data model
 *   sync  "games"          -> [ { id, name, url, group } ]
 *   sync  "disabledGroups" -> [ "Geo", ... ]
 *   sync  "lang"           -> "en" | "de"
 *   local "progress"       -> { date, done: { gameId: true } }
 *   local "times"          -> { date, perGame: { gameId: seconds }, activeId, since }
 *   local "history"        -> { "YYYY-MM-DD": { done: [{id,name,url,seconds}], total } }
 *   local "meta"           -> { streak, best, lastFullDate }
 */

const DEFAULT_GAMES = [
  { id: 'wordle',      name: 'Wordle',      url: 'https://www.nytimes.com/games/wordle/index.html', group: 'Words' },
  { id: 'connections', name: 'Connections', url: 'https://www.nytimes.com/games/connections',        group: 'Words' },
  { id: 'globle',      name: 'Globle',      url: 'https://globle-game.com/',                          group: 'Geo'   },
];

/* ---------------- translations ---------------- */
const I18N = {
  en: {
    countLabel: 'done today', nextBtn: 'Done → next', openAll: 'Open all',
    resetToday: 'Reset today', manageGames: 'Manage games', openCalendar: 'Calendar',
    timerTotal: 'total',
    emptyTitle: 'No games yet', emptySub: 'Add the games your group plays each night.',
    emptyAdd: 'Add a game',
    allGroupsOffTitle: 'All groups off', allGroupsOffSub: 'Turn a group back on to start.',
    streak: '🔥 {n}-day streak',
    optTitle: 'Manage your daily games',
    optSub: 'Add the games you play each night. Use the arrows to reorder — that’s the order they open in.',
    namePh: 'Game name', groupPh: 'Group (optional)',
    moveUp: 'Move up', moveDown: 'Move down', removeGame: 'Remove game', addGame: '+ Add a game',
    groupsTitle: 'Groups', groupsSub: 'Turn a group off to skip it tonight.',
    ioTitle: 'Share with the group',
    ioSub: 'Export your list to a file and send it around, or import a list a friend shared.',
    exportBtn: 'Export list', importBtn: 'Import list', langLabel: 'Language',
    exported: 'List exported.', imported: 'Imported {n} games.',
    importBad: 'That file didn’t look like a games list.',
    calTitle: 'Calendar',
    calSub: 'Your nightly history — days played, games finished, time spent.',
    calCompleted: 'completed', calTotalTime: 'Total time',
    calEmpty: 'Nothing tracked on this day.', calPick: 'Pick a day to see details.',
    calNoData: 'No days tracked yet. Finish some games tonight!',
  },
  de: {
    countLabel: 'heute erledigt', nextBtn: 'Fertig → weiter', openAll: 'Alle öffnen',
    resetToday: 'Heute zurücksetzen', manageGames: 'Spiele verwalten', openCalendar: 'Kalender',
    timerTotal: 'gesamt',
    emptyTitle: 'Noch keine Spiele', emptySub: 'Füge die Spiele hinzu, die ihr jeden Abend spielt.',
    emptyAdd: 'Spiel hinzufügen',
    allGroupsOffTitle: 'Alle Gruppen aus', allGroupsOffSub: 'Schalte eine Gruppe wieder ein, um zu starten.',
    streak: '🔥 {n} Tage in Folge',
    optTitle: 'Tägliche Spiele verwalten',
    optSub: 'Füge die Spiele hinzu, die ihr jeden Abend spielt. Mit den Pfeilen sortieren — in dieser Reihenfolge öffnen sie.',
    namePh: 'Name des Spiels', groupPh: 'Gruppe (optional)',
    moveUp: 'Nach oben', moveDown: 'Nach unten', removeGame: 'Spiel entfernen', addGame: '+ Spiel hinzufügen',
    groupsTitle: 'Gruppen', groupsSub: 'Schalte eine Gruppe aus, um sie heute Abend zu überspringen.',
    ioTitle: 'Mit der Gruppe teilen',
    ioSub: 'Exportiere deine Liste und schick sie herum, oder importiere die Liste eines Freundes.',
    exportBtn: 'Liste exportieren', importBtn: 'Liste importieren', langLabel: 'Sprache',
    exported: 'Liste exportiert.', imported: '{n} Spiele importiert.',
    importBad: 'Diese Datei sieht nicht nach einer Spieleliste aus.',
    calTitle: 'Kalender',
    calSub: 'Eure Abend-Historie — gespielte Tage, geschaffte Spiele, Zeitaufwand.',
    calCompleted: 'erledigt', calTotalTime: 'Gesamtzeit',
    calEmpty: 'An diesem Tag nichts erfasst.', calPick: 'Wähle einen Tag für Details.',
    calNoData: 'Noch keine Tage erfasst. Schafft heute Abend ein paar Spiele!',
  },
};

function defaultLang() {
  try { return (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en'; }
  catch (_) { return 'en'; }
}
function t(lang, key, vars) {
  const dict = I18N[lang] || I18N.en;
  let s = dict[key] ?? I18N.en[key] ?? key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}
function applyI18n(lang) {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(lang, el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(lang, el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(lang, el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(lang, el.dataset.i18nPh); });
}

/* ---------------- dates + misc ---------------- */
function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return todayStr(d); }
function uid() { return 'g' + Math.random().toString(36).slice(2, 9); }
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || 'game'; } }

// Chrome's own favicon cache — needs the "favicon" permission. No network call.
function faviconUrl(pageUrl, size = 32) {
  try {
    const u = new URL(chrome.runtime.getURL('/_favicon/'));
    u.searchParams.set('pageUrl', pageUrl);
    u.searchParams.set('size', String(size));
    return u.toString();
  } catch (_) { return ''; }
}

function formatTime(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/* ---------------- storage ---------------- */
function syncGet(k, fb) { return new Promise((r) => chrome.storage.sync.get({ [k]: fb }, (o) => r(o[k]))); }
function syncSet(o) { return new Promise((r) => chrome.storage.sync.set(o, r)); }
function localGet(k, fb) { return new Promise((r) => chrome.storage.local.get({ [k]: fb }, (o) => r(o[k]))); }
function localSet(o) { return new Promise((r) => chrome.storage.local.set(o, r)); }

async function getLang() { return await syncGet('lang', defaultLang()); }
async function setLang(l) { await syncSet({ lang: l }); }
async function getGames() { return await syncGet('games', DEFAULT_GAMES); }
async function setGames(games) { await syncSet({ games }); }
async function getDisabledGroups() { return await syncGet('disabledGroups', []); }
async function setDisabledGroups(arr) { await syncSet({ disabledGroups: arr }); }
async function toggleGroup(name) {
  const d = await getDisabledGroups();
  const i = d.indexOf(name);
  if (i >= 0) d.splice(i, 1); else d.push(name);
  await setDisabledGroups(d);
}
async function getActiveGames() {
  const all = await getGames();
  const disabled = await getDisabledGroups();
  return all.filter((g) => !g.group || !disabled.includes(g.group));
}

async function getProgress() {
  let p = await localGet('progress', { date: todayStr(), done: {} });
  if (p.date !== todayStr()) { p = { date: todayStr(), done: {} }; await localSet({ progress: p }); }
  return p;
}
async function getMeta() { return await localGet('meta', { streak: 0, best: 0, lastFullDate: '' }); }

/* ---------------- timer ---------------- */
async function getTimes() {
  let x = await localGet('times', { date: todayStr(), perGame: {}, activeId: null, since: null });
  if (x.date !== todayStr()) { x = { date: todayStr(), perGame: {}, activeId: null, since: null }; await localSet({ times: x }); }
  return x;
}
function bank(x, now) { // move elapsed wall-time into the active game's total
  if (x.activeId && x.since) x.perGame[x.activeId] = (x.perGame[x.activeId] || 0) + (now - x.since) / 1000;
}
// Switch the running clock to a game (or null to pause).
async function setActiveGame(id) {
  const now = Date.now();
  const x = await getTimes();
  bank(x, now);
  x.activeId = id;
  x.since = id ? now : null;
  await localSet({ times: x });
  await recordHistory();
}
// Persist accrued time without changing the active game (called periodically).
async function tickFlush() {
  const now = Date.now();
  const x = await getTimes();
  if (x.activeId && x.since) { bank(x, now); x.since = now; await localSet({ times: x }); }
}
async function overallSeconds() {
  const x = await getTimes();
  let total = Object.values(x.perGame).reduce((a, b) => a + b, 0);
  if (x.activeId && x.since) total += (Date.now() - x.since) / 1000;
  return total;
}

/* ---------------- progress + streak + history ---------------- */
async function setDone(gameId, value) {
  const p = await getProgress();
  if (value) p.done[gameId] = true; else delete p.done[gameId];
  await localSet({ progress: p });

  // Completing the game you're timing banks its time and pauses the clock.
  const x = await getTimes();
  if (value && x.activeId === gameId) {
    bank(x, Date.now());
    x.activeId = null; x.since = null;
    await localSet({ times: x });
  }
  await maybeCreditStreak();
  await recordHistory();
  return p;
}

async function maybeCreditStreak() {
  const games = await getActiveGames();
  const p = await getProgress();
  if (games.length === 0) return;
  if (games.filter((g) => p.done[g.id]).length < games.length) return;
  const meta = await getMeta();
  if (meta.lastFullDate === todayStr()) return;
  const streak = meta.lastFullDate === yesterdayStr() ? meta.streak + 1 : 1;
  await localSet({ meta: { streak, best: Math.max(meta.best, streak), lastFullDate: todayStr() } });
}

async function getHistory() { return await localGet('history', {}); }

// Keep today's calendar entry current: which games are done + time spent.
async function recordHistory() {
  const games = await getGames();
  const p = await getProgress();
  const x = await getTimes();
  const byId = Object.fromEntries(games.map((g) => [g.id, g]));
  const done = Object.keys(p.done).filter((id) => p.done[id]).map((id) => {
    const g = byId[id] || { name: '(removed)', url: '' };
    return { id, name: g.name || hostOf(g.url), url: g.url || '', seconds: Math.round(x.perGame[id] || 0) };
  });
  const total = Math.round(Object.values(x.perGame).reduce((a, b) => a + b, 0));
  const hist = await getHistory();
  if (done.length === 0 && total === 0) delete hist[todayStr()];
  else hist[todayStr()] = { done, total };
  await localSet({ history: hist });
}

async function getSummary() {
  const allGames = await getGames();
  const disabled = await getDisabledGroups();
  const games = allGames.filter((g) => !g.group || !disabled.includes(g.group));
  const p = await getProgress();
  const done = games.filter((g) => p.done[g.id]).length;
  const groups = [];
  allGames.forEach((g) => { if (g.group && !groups.includes(g.group)) groups.push(g.group); });
  return { allGames, games, done, total: games.length, doneMap: p.done, groups, disabled };
}

async function updateBadge() {
  const { done, total } = await getSummary();
  const remaining = total - done;
  await chrome.action.setBadgeText({ text: total === 0 ? '' : (remaining > 0 ? String(remaining) : '✓') });
  const complete = total > 0 && remaining === 0;
  await chrome.action.setBadgeBackgroundColor({ color: complete ? '#4ECDA4' : '#FF7A59' });
  try { await chrome.action.setBadgeTextColor({ color: '#2a160f' }); } catch (_) {}
}
