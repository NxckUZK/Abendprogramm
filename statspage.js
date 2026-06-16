/* statspage.js — one card per game, built generically from getGameStats().
 * Any parser that returns { score, display } shows up here automatically. */

const $ = (sel) => document.querySelector(sel);
let lang = 'en';

async function init() {
  lang = await getLang();
  applyI18n(lang);
  await draw();
}

async function draw() {
  const games = await getGameStats();
  const cards = $('#cards');
  const empty = $('#stats-empty');

  if (!games.length) {
    cards.replaceChildren();
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  cards.replaceChildren(...games.map(cardEl));
}

function cardEl(g) {
  const card = document.createElement('section');
  card.className = 'stat-card';

  /* ---- header: favicon + name ---- */
  const head = document.createElement('div');
  head.className = 'sc-head';

  const fav = document.createElement('img');
  fav.className = 'favicon';
  fav.alt = '';
  fav.src = faviconUrl(g.url, 32);
  fav.addEventListener('error', () => {
    const ph = document.createElement('span');
    ph.className = 'favicon ph';
    ph.textContent = '◆';
    fav.replaceWith(ph);
  });

  const name = document.createElement('span');
  name.className = 'sc-name';
  name.textContent = g.name;

  head.append(fav, name);

  /* ---- metric row ---- */
  const metrics = document.createElement('div');
  metrics.className = 'sc-metrics';
  metrics.append(
    metric(String(g.played), t(lang, 'statsPlayed')),
    metric(g.avg == null ? '–' : String(g.avg), t(lang, 'statsAvg')),
    metric(g.bestDisplay || (g.best == null ? '–' : String(g.best)), t(lang, 'statsBest')),
    metric(g.last && g.last.display ? g.last.display : '–', t(lang, 'statsLast')),
  );

  /* ---- sparkline: recent normalised scores ---- */
  const spark = sparkEl(g.entries.slice(-24));

  card.append(head, metrics, spark);
  return card;
}

function metric(value, label) {
  const box = document.createElement('div');
  box.className = 'sc-metric';
  const v = document.createElement('span');
  v.className = 'sc-val';
  v.textContent = value;
  const l = document.createElement('span');
  l.className = 'sc-lbl';
  l.textContent = label;
  box.append(v, l);
  return box;
}

function sparkEl(entries) {
  const spark = document.createElement('div');
  spark.className = 'sc-spark';
  entries.forEach((e) => {
    const bar = document.createElement('span');
    bar.className = 'sc-bar' + (e.score === 0 ? ' zero' : '');
    // Scores are 0–100; clamp height to a readable 6–100%.
    const h = e.score == null ? 0 : Math.max(6, Math.min(100, e.score));
    bar.style.height = h + '%';
    bar.title = `${e.date}: ${e.display || (e.score == null ? '?' : e.score)}`;
    spark.appendChild(bar);
  });
  return spark;
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.stats || changes.games) draw();
  if (changes.lang) { lang = changes.lang.newValue; applyI18n(lang); draw(); }
});

init();
