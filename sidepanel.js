/* sidepanel.js — the ritual: favicons, one-click advance, a live timer, and
 * group chips. The timer runs while this panel is open (it stays docked beside
 * your tabs), attributing time to the game you're currently on. */

const $ = (sel) => document.querySelector(sel);
let lang = 'en';

async function render() {
  lang = await getLang();
  applyI18n(lang);

  const { allGames, games, done, total, doneMap, groups, disabled } = await getSummary();
  const times = await getTimes();

  $('#done-count').textContent = done;
  $('#total-count').textContent = total;

  const tokens = document.createDocumentFragment();
  games.forEach((g) => {
    const el = document.createElement('span');
    el.className = 'token' + (doneMap[g.id] ? ' on' : '');
    tokens.appendChild(el);
  });
  $('#tokens').replaceChildren(tokens);

  const meta = await getMeta();
  $('#streak').textContent = meta.streak > 0 ? t(lang, 'streak', { n: meta.streak }) : '';

  // Group filter chips (built atomically to avoid duplicate-render races).
  const chipFrag = document.createDocumentFragment();
  groups.forEach((name) => {
    const off = disabled.includes(name);
    const c = document.createElement('button');
    c.className = 'chip' + (off ? ' off' : '');
    c.textContent = name;
    c.setAttribute('aria-pressed', String(!off));
    c.addEventListener('click', () => toggleGroup(name));
    chipFrag.appendChild(c);
  });
  $('#group-chips').replaceChildren(chipFrag);
  $('#group-chips').hidden = groups.length === 0;

  const list = $('#game-list');
  const empty = $('#empty');

  if (total === 0) {
    list.replaceChildren();
    list.hidden = true;
    empty.hidden = false;
    const noneAtAll = allGames.length === 0;
    $('#empty-title').textContent = t(lang, noneAtAll ? 'emptyTitle' : 'allGroupsOffTitle');
    $('#empty-sub').textContent = t(lang, noneAtAll ? 'emptySub' : 'allGroupsOffSub');
    $('#empty-add').hidden = !noneAtAll;
    updateTimerUI(times);
    return;
  }

  list.hidden = false;
  empty.hidden = true;
  const frag = document.createDocumentFragment();
  games.forEach((g) => frag.appendChild(rowEl(g, !!doneMap[g.id], times)));
  list.replaceChildren(frag);
  updateTimerUI(times);
}

function rowEl(game, isDone, times) {
  const li = document.createElement('li');
  li.className = 'game' + (isDone ? ' done' : '') + (times.activeId === game.id ? ' active' : '');
  li.dataset.id = game.id;

  const check = document.createElement('button');
  check.className = 'check';
  check.textContent = isDone ? '✓' : '';
  check.addEventListener('click', async (e) => {
    e.stopPropagation();
    await setDone(game.id, !isDone);
    render();
  });

  const fav = document.createElement('img');
  fav.className = 'favicon';
  fav.alt = '';
  fav.src = faviconUrl(game.url, 32);
  fav.addEventListener('error', () => {
    const ph = document.createElement('span');
    ph.className = 'favicon ph';
    ph.textContent = '◆';
    fav.replaceWith(ph);
  });

  const open = document.createElement('button');
  open.className = 'game-open';
  const nameEl = document.createElement('span');
  nameEl.className = 'game-name';
  nameEl.textContent = game.name || hostOf(game.url);
  const hostEl = document.createElement('span');
  hostEl.className = 'game-host';
  hostEl.textContent = hostOf(game.url);
  open.append(nameEl, hostEl);
  open.addEventListener('click', async () => {
    openGame(game);
    await setActiveGame(game.id);
    render();
  });

  const time = document.createElement('span');
  time.className = 'game-time';
  time.textContent = formatTime(times.perGame[game.id] || 0);

  li.append(check, fav, open, time);
  return li;
}

function openGame(game) { if (game.url) chrome.tabs.create({ url: game.url, active: true }); }

// One click: bank + tick off the game you were on, open the next, start its clock.
async function advance() {
  const s1 = await getSummary();
  const times = await getTimes();
  const current = times.activeId;
  if (current && s1.games.some((g) => g.id === current) && !s1.doneMap[current]) {
    await setDone(current, true);
  }
  const s2 = await getSummary();
  const next = s2.games.find((g) => !s2.doneMap[g.id]);
  if (next) { openGame(next); await setActiveGame(next.id); }
  else { await setActiveGame(null); }
  render();
}

async function openAll() {
  const { games } = await getSummary();
  if (!games.length) return;
  const tabIds = [];
  for (const g of games) {
    if (!g.url) continue;
    const tab = await chrome.tabs.create({ url: g.url, active: false });
    tabIds.push(tab.id);
  }
  try {
    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, { title: 'Abendprogramm', color: 'orange' });
  } catch (_) {}
}

/* ---- live timer ---- */
function liveTimes(times) {
  // Returns { perGame map (with live active), total } for display.
  const per = Object.assign({}, times.perGame);
  let total = Object.values(times.perGame).reduce((a, b) => a + b, 0);
  if (times.activeId && times.since) {
    const extra = (Date.now() - times.since) / 1000;
    per[times.activeId] = (per[times.activeId] || 0) + extra;
    total += extra;
  }
  return { per, total };
}
function updateTimerUI(times) {
  const { per, total } = liveTimes(times);
  $('#timer-total').textContent = formatTime(total);
  if (times.activeId) {
    const row = document.querySelector(`.game[data-id="${times.activeId}"] .game-time`);
    if (row) row.textContent = formatTime(per[times.activeId] || 0);
  }
}

// Tick the display every second; persist accrued time every 10s and on hide.
let tickCount = 0;
setInterval(async () => {
  const times = await getTimes();
  if (!times.activeId || !times.since) return;
  updateTimerUI(times);
  if (++tickCount % 10 === 0) await tickFlush();
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) tickFlush(); });
window.addEventListener('pagehide', () => { tickFlush(); });

$('#open-next').addEventListener('click', advance);
$('#open-all').addEventListener('click', openAll);
$('#open-calendar').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('history.html') }));
$('#open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#empty-add').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#reset-day').addEventListener('click', async () => {
  await localSet({
    progress: { date: todayStr(), done: {} },
    times: { date: todayStr(), perGame: {}, activeId: null, since: null },
  });
  await recordHistory();
  render();
});

// Re-render on real changes, but ignore pure timer flushes (every ~10s).
chrome.storage.onChanged.addListener((changes) => {
  const keys = Object.keys(changes);
  if (keys.length && keys.every((k) => k === 'times')) return;
  render();
});

render();
