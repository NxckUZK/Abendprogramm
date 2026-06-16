/* history.js — month calendar of nights played, with games finished and time
 * spent per day. Reads the "history" store written by recordHistory(). */

const $ = (sel) => document.querySelector(sel);
let lang = 'en';
let history = {};
const view = new Date(); // first of currently shown month
view.setDate(1);
let selected = null;

function localeOf(l) { return l === 'de' ? 'de-DE' : 'en-US'; }
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function init() {
  lang = await getLang();
  history = await getHistory();
  applyI18n(lang);
  drawWeekdays();
  draw();
}

function drawWeekdays() {
  // Monday-first headers, localized.
  const fmt = new Intl.DateTimeFormat(localeOf(lang), { weekday: 'short' });
  const frag = document.createDocumentFragment();
  const monday = new Date(2024, 0, 1); // a Monday
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const s = document.createElement('span');
    s.textContent = fmt.format(d);
    frag.appendChild(s);
  }
  $('#weekdays').replaceChildren(frag);
}

function draw() {
  $('#month-label').textContent =
    new Intl.DateTimeFormat(localeOf(lang), { month: 'long', year: 'numeric' }).format(view);

  const year = view.getFullYear(), month = view.getMonth();
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const days = new Date(year, month + 1, 0).getDate();
  const today = ymd(new Date());

  const frag = document.createDocumentFragment();
  for (let i = 0; i < lead; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-cell blank';
    frag.appendChild(blank);
  }
  for (let d = 1; d <= days; d++) {
    const date = ymd(new Date(year, month, d));
    const entry = history[date];
    const cell = document.createElement('div');
    cell.className = 'cal-cell'
      + (entry ? ' played' : '')
      + (date === today ? ' today' : '')
      + (date === selected ? ' sel' : '');

    const num = document.createElement('span');
    num.className = 'd';
    num.textContent = d;
    cell.appendChild(num);

    if (entry) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = '✓ ' + entry.done.length;
      cell.appendChild(cnt);
      cell.addEventListener('click', () => { selected = date; draw(); detail(date); });
    }
    frag.appendChild(cell);
  }
  $('#grid').replaceChildren(frag);

  if (selected && history[selected]) detail(selected);
  else if (Object.keys(history).length === 0) emptyDetail('calNoData');
  else emptyDetail('calPick');
}

function emptyDetail(key) {
  const p = document.createElement('p');
  p.className = 'detail-empty';
  p.textContent = t(lang, key);
  $('#day-detail').replaceChildren(p);
}

function detail(date) {
  const entry = history[date];
  const box = $('#day-detail');
  if (!entry) { emptyDetail('calEmpty'); return; }

  const heading = document.createElement('h2');
  heading.textContent = new Intl.DateTimeFormat(localeOf(lang),
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date + 'T00:00'));

  const total = document.createElement('p');
  total.className = 'detail-total';
  total.textContent = `${t(lang, 'calTotalTime')}: ${formatTime(entry.total)} · ${entry.done.length} ${t(lang, 'calCompleted')}`;

  const list = document.createElement('ul');
  list.className = 'detail-list';
  entry.done.forEach((g) => {
    const li = document.createElement('li');
    li.className = 'detail-item';

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
    name.className = 'di-name';
    name.textContent = g.name;

    const time = document.createElement('span');
    time.className = 'di-time';
    time.textContent = formatTime(g.seconds);

    li.append(fav, name, time);
    list.appendChild(li);
  });

  box.replaceChildren(heading, total, list);
}

$('#prev').addEventListener('click', () => { view.setMonth(view.getMonth() - 1); draw(); });
$('#next').addEventListener('click', () => { view.setMonth(view.getMonth() + 1); draw(); });

chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.history) { history = await getHistory(); draw(); }
  if (changes.lang) { lang = changes.lang.newValue; applyI18n(lang); drawWeekdays(); draw(); }
});

init();
