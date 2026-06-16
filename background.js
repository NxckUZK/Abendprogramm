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
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'abendprogramm-stat' && msg.stat) {
    saveStat(msg.stat.game, msg.stat).then(() => sendResponse({ ok: true }));
    return true; // keep the channel open for the async response
  }
});
