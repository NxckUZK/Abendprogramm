/* background.js — the service worker. Keep it stateless: it can be torn down
 * any time, so all state lives in chrome.storage and timing uses alarms. */

importScripts('lib.js');

// Clicking the toolbar icon opens the side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  scheduleMidnightAlarm();
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleMidnightAlarm();
  updateBadge();
});

// Whenever progress or the game list changes anywhere, refresh the badge.
chrome.storage.onChanged.addListener(() => updateBadge());

// Schedule a one-off alarm for just after local midnight, re-arming each day.
function scheduleMidnightAlarm() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  chrome.alarms.create('daily-reset', { when: next.getTime() });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'daily-reset') return;
  await getProgress();   // date rolled over -> this resets today's progress
  await updateBadge();
  scheduleMidnightAlarm();
});

// Parsed game stats arrive here from adapters/relay.js (via stats.js).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'abendprogramm-stat' && msg.stat) {
    handleStat(msg.stat, sender).then(() => sendResponse({ ok: true }));
    return true; // keep the channel open for the async response
  }
});

async function handleStat(stat, sender) {
  await saveStat(stat.game, stat);
  if (!(await getAutoAdvance())) return;

  // Match the shared game to a list entry by host (parser ids needn't equal the
  // user's game ids), then run the "done → next" flow automatically.
  const tabUrl = (sender && sender.tab && sender.tab.url) || stat.url || '';
  const host = hostOf(tabUrl);
  const game = (await getActiveGames()).find((g) => g.url && hostOf(g.url) === host);
  if (!game) return;

  const p = await getProgress();
  if (p.done[game.id]) return; // already ticked off — don't re-open anything.

  await setDone(game.id, true); // banks time, credits streak, records history
  const { games, doneMap } = await getSummary();
  const next = games.find((g) => !doneMap[g.id]);
  if (next && next.url) {
    await chrome.tabs.create({ url: next.url, active: true });
    await setActiveGame(next.id);
  } else {
    await setActiveGame(null); // nothing left tonight — pause the clock
  }
  await updateBadge();
}
