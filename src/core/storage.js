// chrome.storage のラッパー（拡張外で開いた場合は localStorage にフォールバック）とスキーマ移行
import { DEFAULT_SETTINGS, DEFAULT_WATCH, PANEL_LAYOUT, RANGE_IDS } from './config.js';

export const SCHEMA_VERSION = 2;

// ?mock（開発用のダミーデータ）のときは本物のキャッシュを汚さないよう、別の保存先（localStorage）を使う
export const MOCK = typeof location !== 'undefined' && new URLSearchParams(location.search || '').has('mock');
export const hasChromeStorage = !MOCK && typeof chrome !== 'undefined' && !!chrome.storage?.local;
const PREFIX = MOCK ? 'mtmock' : 'mt';

const listeners = new Set();

function lsKey(area, k) {
  return `${PREFIX}:${area}:${k}`;
}

export const store = {
  async get(area, keys) {
    if (hasChromeStorage) return chrome.storage[area].get(keys);
    const out = {};
    for (const k of keys) {
      try {
        const v = localStorage.getItem(lsKey(area, k));
        if (v != null) out[k] = JSON.parse(v);
      } catch (_) { /* 読めなければ無視 */ }
    }
    return out;
  },
  async set(area, obj) {
    if (hasChromeStorage) return chrome.storage[area].set(obj);
    const changes = {};
    for (const [k, v] of Object.entries(obj)) {
      try { localStorage.setItem(lsKey(area, k), JSON.stringify(v)); } catch (_) { /* 容量超過など */ }
      changes[k] = { newValue: v };
    }
    for (const fn of listeners) fn(changes, area);
  },
  async remove(area, keys) {
    if (hasChromeStorage) return chrome.storage[area].remove(keys);
    for (const k of keys) {
      try { localStorage.removeItem(lsKey(area, k)); } catch (_) { /* noop */ }
    }
  },
  onChanged(fn) {
    if (hasChromeStorage) chrome.storage.onChanged.addListener(fn);
    else {
      listeners.add(fn);
      // 別タブ（開発時）の変更も拾う
      addEventListener('storage', (e) => {
        const m = new RegExp(`^${PREFIX}:(\\w+):(.+)$`).exec(e.key || '');
        if (!m) return;
        try { fn({ [m[2]]: { newValue: e.newValue ? JSON.parse(e.newValue) : undefined } }, m[1]); } catch (_) { /* noop */ }
      });
    }
  },
};

// session 領域が無い環境（開発時）では local を使う
export const sessionArea = hasChromeStorage && chrome.storage.session ? 'session' : 'local';

/* ---------- 設定・ウォッチリスト ---------- */

export function mergeSettings(saved) {
  const s = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  if (!RANGE_IDS.includes(s.range)) s.range = DEFAULT_SETTINGS.range;
  // パネル定義の追加・削除に追従
  const known = new Map((s.panels || []).map((p) => [p.id, p]));
  const ordered = (s.panels || []).filter((p) => PANEL_LAYOUT.some((l) => l.id === p.id));
  for (const l of PANEL_LAYOUT) if (!known.has(l.id)) ordered.push({ id: l.id, visible: true });
  s.panels = ordered;
  return s;
}

export function defaultWatchlists() {
  return [{ id: 'main', name: 'ウォッチ', syms: DEFAULT_WATCH.slice() }];
}

export async function loadSettings() {
  const { settings } = await store.get('sync', ['settings']);
  return mergeSettings(settings);
}

export async function saveSettings(settings) {
  await store.set('sync', { settings });
}

export async function loadWatchlists() {
  const { watchlists } = await store.get('sync', ['watchlists']);
  return Array.isArray(watchlists) && watchlists.length ? watchlists : defaultWatchlists();
}

export async function saveWatchlists(watchlists) {
  await store.set('sync', { watchlists });
}

export async function loadPortfolio() {
  const { portfolio } = await store.get('local', ['portfolio']);
  return Array.isArray(portfolio) ? portfolio : [];
}

export async function savePortfolio(portfolio) {
  await store.set('local', { portfolio });
}

/* ---------- スキーマ移行 ---------- */

/**
 * v1 → v2
 * v1: sync { range, colorMode, interval, watch: string[], newsSrc }, local { cache }
 * v2: sync { settings, watchlists, schemaVersion }, local { snap:<range>, news:<src>, portfolio, ... }
 */
export function migrateV1(syncData) {
  const settings = mergeSettings({
    ...(syncData.range ? { range: syncData.range } : {}),
    ...(syncData.colorMode ? { colorMode: syncData.colorMode } : {}),
    ...(syncData.interval != null ? { interval: Number(syncData.interval) } : {}),
    ...(syncData.newsSrc ? { newsSrc: syncData.newsSrc } : {}),
  });
  const watchlists = Array.isArray(syncData.watch) && syncData.watch.length
    ? [{ id: 'main', name: 'ウォッチ', syms: syncData.watch.slice(0, 50) }]
    : defaultWatchlists();
  return { settings, watchlists };
}

export async function migrateStorage() {
  const data = await store.get('sync', ['schemaVersion', 'range', 'colorMode', 'interval', 'watch', 'newsSrc', 'settings', 'watchlists']);
  const v = data.schemaVersion || (data.watch || data.colorMode ? 1 : 0);
  if (v >= SCHEMA_VERSION) return false;
  if (v === 1) {
    const { settings, watchlists } = migrateV1(data);
    await store.set('sync', { settings, watchlists, schemaVersion: SCHEMA_VERSION });
    await store.remove('sync', ['range', 'colorMode', 'interval', 'watch', 'newsSrc']);
    await store.remove('local', ['cache']);
  } else {
    await store.set('sync', {
      settings: mergeSettings(data.settings),
      watchlists: data.watchlists || defaultWatchlists(),
      schemaVersion: SCHEMA_VERSION,
    });
  }
  return true;
}
