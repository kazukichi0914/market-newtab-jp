// Service Worker: 外部への通信はすべてここで行い、結果を chrome.storage.local に保存する。
// 新規タブはストレージを読むだけなので、タブを何枚開いても通信は増えない。
import { migrateStorage, loadSettings, store, sessionArea } from './src/core/storage.js';
import { refreshAll, refreshRange, refreshNews, fetchOne, searchRemote, computeDelaySec } from './src/data/scheduler.js';

const ALARM = 'market-tick';

async function scheduleNext() {
  const settings = await loadSettings();
  const { lastNewtabAt } = await store.get(sessionArea, ['lastNewtabAt']);
  const sec = computeDelaySec(settings, Date.now(), lastNewtabAt ?? null);
  await chrome.alarms.clear(ALARM);
  if (sec > 0) await chrome.alarms.create(ALARM, { delayInMinutes: sec / 60 });
}

async function tick(reason) {
  const settings = await loadSettings();
  try {
    await refreshAll({ range: settings.range, reason });
  } finally {
    await scheduleNext();
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await migrateStorage();
  await tick('install');
});

chrome.runtime.onStartup.addListener(() => tick('startup'));

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) tick('alarm');
});

// 設定（更新間隔など）が変わったら予定を組み直す
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) {
    const o = changes.settings.oldValue || {}, n = changes.settings.newValue || {};
    if (o.interval !== n.interval || o.offhours !== n.offhours) scheduleNext();
  }
});

const handlers = {
  async refresh(msg) {
    await store.set(sessionArea, { lastNewtabAt: Date.now() });
    const r = await refreshAll({ range: msg.range || '1d', force: !!msg.force, reason: msg.reason || 'page' });
    await scheduleNext();
    return r;
  },
  async refreshRange(msg) {
    return refreshRange(msg.range, { force: !!msg.force });
  },
  async refreshNews(msg) {
    return refreshNews(msg.src, !!msg.force);
  },
  async addSymbol(msg) {
    return fetchOne(msg.sym, msg.range);
  },
  async search(msg) {
    return searchRemote(msg.q);
  },
  async opened() {
    // 新規タブが開かれた（アイドル判定用）。長く止まっていたアラームを短い間隔に戻す
    const { lastNewtabAt } = await store.get(sessionArea, ['lastNewtabAt']);
    await store.set(sessionArea, { lastNewtabAt: Date.now() });
    if (!lastNewtabAt || Date.now() - lastNewtabAt > 30 * 60_000) await scheduleNext();
    return true;
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  h(msg).then((v) => reply({ ok: true, v }), (e) => reply({ ok: false, error: e?.message || String(e) }));
  return true; // 非同期で応答する
});
