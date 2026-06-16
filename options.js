/* options.js — the manager: edit games (name / url / group), reorder, share,
 * toggle groups, and switch language. Saves to storage.sync as you type. */

const $ = (sel) => document.querySelector(sel);
let games = [];
let lang = 'en';

async function load() {
  lang = await getLang();
  games = await getGames();
  applyI18n(lang);
  markLang();
  draw();
}

function markLang() {
  $('#lang-en').classList.toggle('active', lang === 'en');
  $('#lang-de').classList.toggle('active', lang === 'de');
}

function draw() {
  const ed = $('#editor');
  ed.innerHTML = '';
  games.forEach((g, i) => ed.appendChild(rowEl(g, i)));
  refreshGroupList();
  drawGroupToggles();
}

function rowEl(game, i) {
  const li = document.createElement('li');
  li.className = 'edit-row';

  const moves = document.createElement('div');
  moves.className = 'moves';
  const up = miniBtn('▲', t(lang, 'moveUp'), () => move(i, -1));
  const down = miniBtn('▼', t(lang, 'moveDown'), () => move(i, 1));
  up.disabled = i === 0;
  down.disabled = i === games.length - 1;
  moves.append(up, down);

  const fields = document.createElement('div');
  fields.className = 'fields';
  const name = input(t(lang, 'namePh'), game.name, 'f-name', (v) => { game.name = v; save(); });
  const url = input('https://…', game.url, 'f-url', (v) => { game.url = v; save(); });
  url.type = 'url';
  const group = input(t(lang, 'groupPh'), game.group, 'f-group', (v) => {
    game.group = v; save(); refreshGroupList(); drawGroupToggles();
  });
  group.setAttribute('list', 'group-list');
  fields.append(name, url, group);

  const del = miniBtn('✕', t(lang, 'removeGame'), () => { games.splice(i, 1); save(); draw(); });
  del.classList.add('del');

  li.append(moves, fields, del);
  return li;
}

function miniBtn(label, aria, onClick) {
  const b = document.createElement('button');
  b.className = 'mini-btn';
  b.textContent = label;
  b.setAttribute('aria-label', aria);
  b.addEventListener('click', onClick);
  return b;
}

function input(ph, value, cls, onInput) {
  const el = document.createElement('input');
  el.className = 'inp ' + cls;
  el.placeholder = ph;
  el.value = value || '';
  el.addEventListener('input', () => onInput(el.value.trim()));
  return el;
}

function distinctGroups() {
  const out = [];
  games.forEach((g) => { if (g.group && !out.includes(g.group)) out.push(g.group); });
  return out;
}

function refreshGroupList() {
  const frag = document.createDocumentFragment();
  distinctGroups().forEach((name) => {
    const o = document.createElement('option');
    o.value = name;
    frag.appendChild(o);
  });
  $('#group-list').replaceChildren(frag);
}

// Built atomically: concurrent calls each replace in one step, so toggles can
// never end up duplicated (the previous version cleared then appended across an
// await, which let two renders both append).
async function drawGroupToggles() {
  const groups = distinctGroups();
  const sec = $('#groups-sec');
  sec.hidden = groups.length === 0;
  const disabled = await getDisabledGroups();
  const frag = document.createDocumentFragment();
  groups.forEach((name) => {
    const off = disabled.includes(name);
    const b = document.createElement('button');
    b.className = 'chip' + (off ? ' off' : '');
    b.textContent = name;
    b.setAttribute('aria-pressed', String(!off));
    b.addEventListener('click', () => toggleGroup(name)); // storage change redraws
    frag.appendChild(b);
  });
  $('#group-toggles').replaceChildren(frag);
}

function move(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= games.length) return;
  [games[i], games[j]] = [games[j], games[i]];
  save();
  draw();
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const clean = games
      .filter((g) => (g.name && g.name.trim()) || (g.url && g.url.trim()))
      .map((g) => ({ id: g.id || uid(), name: g.name || '', url: g.url || '', group: (g.group || '').trim() }));
    await setGames(clean);

    // Drop any "disabled" entries for groups that no longer exist, so a removed
    // group disappears everywhere (and won't silently re-disable if recreated).
    const live = new Set(clean.map((g) => g.group).filter(Boolean));
    const disabled = await getDisabledGroups();
    const pruned = disabled.filter((name) => live.has(name));
    if (pruned.length !== disabled.length) await setDisabledGroups(pruned);
  }, 300);
}

$('#add').addEventListener('click', () => {
  games.push({ id: uid(), name: '', url: '', group: '' });
  draw();
  const names = document.querySelectorAll('.edit-row .f-name');
  names[names.length - 1]?.focus();
});

$('#lang-en').addEventListener('click', async () => { await setLang('en'); lang = 'en'; applyI18n(lang); markLang(); draw(); });
$('#lang-de').addEventListener('click', async () => { await setLang('de'); lang = 'de'; applyI18n(lang); markLang(); draw(); });

$('#export').addEventListener('click', async () => {
  const data = JSON.stringify(await getGames(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'abendprogramm.json';
  a.click();
  URL.revokeObjectURL(url);
  msg(t(lang, 'exported'));
});

$('#import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error('not a list');
    games = parsed
      .filter((g) => g && g.url)
      .map((g) => ({ id: g.id || uid(), name: g.name || hostOf(g.url), url: g.url, group: (g.group || '').trim() }));
    await setGames(games);
    draw();
    msg(t(lang, 'imported', { n: games.length }));
  } catch (_) {
    msg(t(lang, 'importBad'), true);
  }
  e.target.value = '';
});

function msg(text, bad = false) {
  const m = $('#io-msg');
  m.textContent = text;
  m.className = 'io-msg' + (bad ? ' bad' : '');
}

// React only to *external* changes — never to our own debounced game saves,
// which would otherwise reset inputs and steal focus mid-edit.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.lang) { lang = changes.lang.newValue; applyI18n(lang); markLang(); draw(); }
  if (changes.disabledGroups) { drawGroupToggles(); }
});
load();
