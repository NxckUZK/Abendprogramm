/* parsers.js — pure share-text parsers, one per game.
 *
 * Each parser takes the raw text a game's "Share" button copies to the
 * clipboard and returns a structured stats object — or null if the text
 * doesn't look like a result it recognises. No chrome.* and no DOM here, so
 * these run in the page's MAIN world and stay trivially unit-testable.
 *
 * To add a game: write a parse function, then register it in PARSERS with the
 * URL fragment(s) that identify its page.
 *
 * A parser result is { game, ...fields }. Common fields by convention:
 *   game      canonical id, e.g. 'wordle'
 *   puzzle    puzzle number / id as shown, if any
 *   solved    boolean — did the player win
 *   guesses   attempts used (number), or null if not solved
 *   maxGuesses guess limit, if the game has one
 *   display   short human label for the UI, e.g. "3/6"
 *   score     normalised 0–100 (% of best possible, 0 = lost) so heterogeneous
 *             games sum into one comparable nightly "total score". Keep the
 *             game's native number in `display`, not here.
 *   raw       the original share text (kept for debugging / future re-parse)
 */

/* ---------------- Wordle ----------------
 * Share looks like:
 *   Wordle 1,486 3/6
 *   (blank)
 *   🟨⬜⬜⬜⬜
 *   ...
 * Loss is "X/6". Hard mode appends "*" to the score (e.g. "4/6*").
 */
function parseWordle(text) {
  // Puzzle number is grouped locale-dependently: "1,824" (en) or "1.824" (de).
  const m = /Wordle\s+([\d.,]+)\s+([\dX])\/(\d+)(\*?)/i.exec(text);
  if (!m) return null;
  const solved = m[2].toUpperCase() !== 'X';
  const guesses = solved ? Number(m[2]) : null;
  const maxGuesses = Number(m[3]);
  return {
    game: 'wordle',
    puzzle: Number(m[1].replace(/[.,]/g, '')),
    solved,
    guesses,
    maxGuesses,
    hardMode: m[4] === '*',
    display: `${solved ? guesses : 'X'}/${maxGuesses}`,
    // Normalised 0–100: a 1/6 is 100, each extra guess steps down, a loss is 0.
    score: solved ? Math.round(((maxGuesses - guesses + 1) / maxGuesses) * 100) : 0,
    grid: gridRows(text),
    raw: text,
  };
}

/* ---------------- Timeguessr ----------------
TimeGuessr #1112 — 28,356/50,000

1️⃣ 🏆4191 - 📅6y - 🌍3545.8 km
2️⃣ 🏆7200 - 📅6y - 🌍700.2 km
3️⃣ 🏆2512 - 📅8y - 🌍8931.1 km
4️⃣ 🏆6896 - 📅5y - 🌍1007.3 km
5️⃣ 🏆7557 - 📅0y - 🌍1885.2 km

https://timeguessr.com
*/
function parseTimeguessr(text) {
  const rounds = [...text.matchAll(/🏆\s*(\d+)/g)].map((m) => Number(m[1]));
  if (!rounds.length) return null; // not a TimeGuessr result.
  const total = rounds.reduce((a, b) => a + b, 0);
  // The header also states "28,356/50,000" — use its denominator as the max,
  // else fall back to 10,000 per round.
  const head = /([\d.,]+)\s*\/\s*([\d.,]+)/.exec(text);
  const max = head ? Number(head[2].replace(/[.,]/g, '')) : rounds.length * 10000;
  return {
    game: 'timeguessr',
    rounds,
    total,
    maxScore: max,
    display: total.toLocaleString('en-US'), // native number, e.g. "28,356"
    score: Math.round((total / max) * 100),  // normalised 0–100 for the nightly sum
    raw: text,
  };
}

/* ---------------- travle daily ----------------
 * You name countries forming a path from a start to a target country. "+N" is
 * how many guesses OVER the optimal route you used — the penalty, +0 = perfect.
 * Emojis are the per-guess result (✅ on-path, 🟧 valid detour, ❌ off-track).
 * Two share shapes — emojis inline, or on their own line:
 *   #travle #1281 +0 (3 Hinweise) ✅✅✅✅ https://travle.earth
 *   #travle #1281 +2
 *   ✅🟧✅🟧✅✅
 *   https://travle.earth
 */
function parseTravle(text) {
  const head = /#travle\s+#?(\d+)/i.exec(text);
  if (!head) return null;
  const plusM = /\+(\d+)/.exec(text);            // the penalty, if completed
  const hintsM = /\((\d+)\s*(?:Hinweis(?:e)?|hints?)\)/i.exec(text);

  const marks = [...text.matchAll(/(✅|🟩|🟧|🟨|🟥|❌)/gu)].map((x) => x[1]);
  const correct = marks.filter((c) => c === '✅' || c === '🟩').length;
  const detours = marks.filter((c) => c === '🟧' || c === '🟨').length;
  const wrong = marks.filter((c) => c === '🟥' || c === '❌').length;

  const solved = plusM != null;                  // a "+N" means you reached the target
  const plus = solved ? Number(plusM[1]) : null;
  const hints = hintsM ? Number(hintsM[1]) : 0;
  // Perfect run = 100; each extra guess and hint chips away.
  const penalty = (plus || 0) * 10 + hints * 5;

  return {
    game: 'travle',
    puzzle: Number(head[1]),
    plus,
    hints,
    guesses: marks.length,
    correct,
    detours,
    wrong,
    solved,
    display: solved ? `+${plus}` : 'X',
    score: solved ? Math.max(0, 100 - penalty) : 0,
    raw: text,
  };
}

/* Pull the emoji grid rows out of a share text (Wordle-family games). */
function gridRows(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[⬛⬜\u{1F7E5}\u{1F7E7}\u{1F7E8}\u{1F7E9}\u{1F7E6}\u{1F7EA}]+$/u.test(l));
}

/* ---------------- registry ----------------
 * Order matters only if two matchers could overlap — first hit wins.
 */
const PARSERS = [
  { id: 'wordle', match: (url) => url.includes('nytimes.com/games/wordle'), parse: parseWordle },
  { id: 'timeguessr', match: (url) => url.includes('timeguessr.com'), parse: parseTimeguessr },
  { id: 'travle', match: (url) => url.includes('travle.earth'), parse: parseTravle },
];

function getParserForUrl(url) {
  return PARSERS.find((p) => p.match(url)) || null;
}

// Expose for both MAIN-world injection (window) and any module-style import.
if (typeof window !== 'undefined') {
  window.AbendprogrammParsers = { PARSERS, getParserForUrl, parseWordle, parseTimeguessr, parseTravle };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PARSERS, getParserForUrl, parseWordle, parseTimeguessr, parseTravle };
}
