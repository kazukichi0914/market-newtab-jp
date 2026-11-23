// 新規タブのエントリ。ストレージのキャッシュを即描画し、更新は Service Worker に任せる。
import { PANELS, PANEL_LAYOUT, RANGES, STALE_AFTER_MS } from '../core/config.js';
import { store, migrateStorage, loadSettings, saveSettings, loadWatchlists, saveWatchlists, loadPortfolio, savePortfolio, mergeSettings } from '../core/storage.js';
import { fmtTime, ago, esc } from '../core/format.js';
import { client, isExtension, mockMode } from './client.js';
import { renderClock, renderSessions, applySearchEngine, bindSearch } from './header.js';
import { renderPanel, resetFlash } from './panels.js';
import { watchTemplate, renderWatch, bindWatch } from './watchlist.js';
import { portfolioTemplate, renderPortfolio, bindPortfolio } from './portfolio.js';
import { newsTemplate, renderNews, bindNews } from './news.js';
import { calendarTemplate, renderCalendar } from './calendar.js';
import { openSettings } from './settings.js';

const $ = (s) => document.querySelector(s);

const state = {
  settings: null,
  watchlists: [],
  portfolio: [],
  snaps: {}, // range → { ts, quotes, errors }
  news: {}, // src → { ts, items, error }
  readNews: new Set(),
};

let ui = { activeList: 'main', sort: { col: null, asc: false }, pfView: 'account' };
let flash = false; // 初回描画ではフラッシュしない
let refreshing = false;
let lastAttemptAt = 0; // 失敗が続くときに連続で再試行しないための記録

/* ---------- 値の参照 ---------- */

function snap(range) { return state.snaps[range]; }

/** 表示中の期間の Quote。現在値は常に「1日」の最新値で上書きする */
function getQuote(key) {
  const range = state.settings.range;
  const q = snap(range)?.quotes?.[key];
  if (range === '1d') return q;
  const d = snap('1d')?.quotes?.[key];
  if (!q) return d ? { ...d, pts: null, rangePct: null } : undefined;
  if (!d || (d.fetchedAt || 0) <= (q.fetchedAt || 0)) return q;
  const rangePct = d.price != null && q.rangeBase ? ((d.price - q.rangeBase) / q.rangeBase) * 100 : q.rangePct;
  return { ...q, price: d.price, prev: d.prev, chg: d.chg, pct: d.pct, time: d.time, volume: d.volume, dayHi: d.dayHi, dayLo: d.dayLo, rangePct };
}

function getError(key) {
  return snap(state.settings.range)?.errors?.[key] || (state.settings.range !== '1d' ? snap('1d')?.errors?.[key] : null) || null;
}

/** ポートフォリオ用: シンボルで「1日」の Quote を引く（為替はパネル項目の値も使う） */
function getQuoteBySym(sym) {
  const quotes = snap('1d')?.quotes || {};
  if (quotes[sym]) return quotes[sym];
  return Object.values(quotes).find((q) => q.sym === sym && q.source !== 'derived');
}

/* ---------- 文脈オブジェクト（各コンポーネントに渡す） ---------- */

const ctx = {
  state,
  get ui() { return ui; },
  get range() { return state.settings.range; },
  get flash() { return flash; },
  client,
  getQuote, getError, getQuoteBySym,
  async saveSettings() { await saveSettings(state.settings); },
  async saveWatchlists() { await saveWatchlists(state.watchlists); renderWatch(ctx); },
  async savePortfolio() { await savePortfolio(state.portfolio); renderPortfolio(ctx); },
  saveUi() { try { localStorage.setItem('mt:ui', JSON.stringify({ activeList: ui.activeList, pfView: ui.pfView })); } catch (_) { /* noop */ } },
  applySettings,
  toast,
  requestRefresh: () => refresh({ force: false, reason: 'page' }),
  async toggleHide() {
    state.settings.hideAmounts = !state.settings.hideAmounts;
    await saveSettings(state.settings);
    renderPortfolio(ctx);
  },
  async markRead(h) {
    state.readNews.add(h);
    const arr = [...state.readNews].slice(-500);
    await store.set('local', { readNews: arr });
  },
};

/* ---------- レイアウト ---------- */

const TEMPLATES = {
  watch: watchTemplate,
  portfolio: portfolioTemplate,
  news: newsTemplate,
  calendar: calendarTemplate,
};

function buildLayout() {
  const grid = $('#grid');
  grid.innerHTML = PANEL_LAYOUT.map((p) => {
    const inner = TEMPLATES[p.id] || `<h2 id="h-${p.id}">${esc(PANELS[p.id].title)}</h2><div class="${PANELS[p.id].kind}" id="body-${p.id}"></div>`;
    return `<section class="panel span-${p.span}" id="panel-${p.id}" aria-labelledby="h-${p.id}">${inner}</section>`;
  }).join('');
}

function applyLayout() {
  state.settings.panels.forEach((p, i) => {
    const el = document.getElementById(`panel-${p.id}`);
    if (!el) return;
    el.hidden = !p.visible;
    el.style.order = String(i);
  });
}

function applySettings() {
  const s = state.settings;
  const root = document.documentElement;
  root.dataset.theme = s.theme === 'auto' ? '' : s.theme;
  if (s.theme === 'auto') delete root.dataset.theme;
  document.body.classList.toggle('us', s.colorMode === 'us');
  document.body.classList.toggle('compact', s.density === 'compact');
  applySearchEngine(s.engine);
  applyLayout();
  setRangeButtons();
  renderData();
  renderPortfolio(ctx);
  renderNews(ctx);
}

function setRangeButtons() {
  document.querySelectorAll('#rangeSeg button').forEach((b) => {
    const on = b.dataset.range === state.settings.range;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
}

/* ---------- 描画 ---------- */

function renderData() {
  for (const id of Object.keys(PANELS)) renderPanel(id, document.getElementById(`body-${id}`), ctx);
  renderWatch(ctx);
  renderPortfolio(ctx);
  renderStatus();
}

function renderStatus() {
  const s = snap(state.settings.range) || snap('1d');
  const el = $('#updated');
  if (!navigator.onLine) {
    el.innerHTML = `<span class="offline">オフライン</span> — ${s?.ts ? `${fmtTime(s.ts, true)} のデータを表示中` : 'データがありません'}`;
  } else if (!s?.ts) {
    el.textContent = refreshing ? 'データを取得中…' : Object.keys(s?.errors || {}).length ? 'データ提供元に接続できません。しばらくしてから再度お試しください。' : 'データがありません';
  } else {
    el.textContent = `最終更新 ${fmtTime(s.ts, true)}（${ago(s.ts)}）${refreshing ? ' · 更新中…' : ''} · 株価は約20分遅延`;
  }
  const errs = Object.entries(s?.errors || {});
  const errEl = $('#errors');
  if (errs.length) {
    errEl.textContent = `⚠ ${errs.length}件取得失敗`;
    errEl.title = errs.map(([k, v]) => `${k}: ${v}`).join('\n');
  } else {
    errEl.textContent = mockMode ? '（モックデータ表示中）' : '';
    errEl.title = '';
  }
  $('#refreshBtn').classList.toggle('spin', refreshing);
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

/* ---------- 更新 ---------- */

async function refresh({ force = false, reason = 'page' } = {}) {
  if (refreshing && !force) return;
  refreshing = true;
  lastAttemptAt = Date.now();
  renderStatus();
  try {
    await client.refresh(state.settings.range, { force, reason });
  } catch (e) {
    toast(`更新できませんでした（${e.message}）`);
  } finally {
    refreshing = false;
    renderStatus();
  }
}

function isStale(range) {
  const s = snap(range);
  const limit = Math.max(STALE_AFTER_MS, (state.settings.interval || 0) * 1000);
  return !s?.ts || Date.now() - s.ts > limit;
}

async function loadSnap(range) {
  const key = `snap:${range}`;
  const v = (await store.get('local', [key]))[key];
  if (v) state.snaps[range] = v;
}

async function changeRange(range) {
  if (range === state.settings.range) return;
  state.settings.range = range;
  setRangeButtons();
  await loadSnap(range);
  resetFlash();
  flash = false;
  renderData();
  flash = true;
  saveSettings(state.settings);
  refresh();
}

/* ---------- イベント ---------- */

function bind() {
  $('#rangeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-range]');
    if (b) changeRange(b.dataset.range);
  });
  $('#refreshBtn').addEventListener('click', () => refresh({ force: true, reason: 'manual' }));
  $('#settingsBtn').addEventListener('click', () => openSettings(ctx));
  bindSearch();
  bindWatch(ctx);
  bindPortfolio(ctx);
  bindNews(ctx);

  store.onChanged((changes, area) => {
    if (area === 'local') {
      let data = false;
      for (const [k, { newValue }] of Object.entries(changes)) {
        if (k.startsWith('snap:') && newValue) { state.snaps[k.slice(5)] = newValue; data = true; }
        if (k.startsWith('news:') && newValue) { state.news[k.slice(5)] = newValue; renderNews(ctx); }
        if (k === 'portfolio') { state.portfolio = newValue || []; renderPortfolio(ctx); }
      }
      if (data) renderData();
    }
    if (area === 'sync') {
      // 他の端末・他のタブでの変更を反映
      if (changes.settings?.newValue && JSON.stringify(mergeSettings(changes.settings.newValue)) !== JSON.stringify(state.settings)) {
        const prevRange = state.settings.range;
        state.settings = mergeSettings(changes.settings.newValue);
        if (state.settings.range !== prevRange) loadSnap(state.settings.range).then(applySettings);
        else applySettings();
      }
      if (changes.watchlists?.newValue && JSON.stringify(changes.watchlists.newValue) !== JSON.stringify(state.watchlists)) {
        state.watchlists = changes.watchlists.newValue;
        if (!state.watchlists.some((l) => l.id === ui.activeList)) ui.activeList = state.watchlists[0]?.id;
        renderWatch(ctx);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (e.target.closest('input, textarea, select, [contenteditable]') || $('#settings').open) return;
    if (e.key === '/') { e.preventDefault(); $('#search input').focus(); }
    else if (e.key === 'r') refresh({ force: true, reason: 'manual' });
    else if (e.key === 'h') ctx.toggleHide();
    else if (/^[1-6]$/.test(e.key)) changeRange(RANGES[Number(e.key) - 1].id);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isStale(state.settings.range)) refresh();
  });
  addEventListener('online', () => { renderStatus(); refresh(); });
  addEventListener('offline', renderStatus);
  document.addEventListener('click', (e) => {
    // メニューの外をクリックしたら閉じる
    document.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });
}

/* ---------- 起動 ---------- */

(async function init() {
  await migrateStorage();
  try { ui = { ...ui, ...JSON.parse(localStorage.getItem('mt:ui') || '{}') }; } catch (_) { /* noop */ }
  const [settings, watchlists, portfolio] = await Promise.all([loadSettings(), loadWatchlists(), loadPortfolio()]);
  Object.assign(state, { settings, watchlists, portfolio });
  const ranges = [...new Set(['1d', settings.range])];
  await Promise.all(ranges.map(loadSnap));
  const local = await store.get('local', [`news:${settings.newsSrc}`, 'readNews']);
  if (local[`news:${settings.newsSrc}`]) state.news[settings.newsSrc] = local[`news:${settings.newsSrc}`];
  state.readNews = new Set(local.readNews || []);

  buildLayout();
  renderClock();
  renderSessions();
  renderCalendar();
  bind();
  applySettings();
  flash = true;

  setInterval(() => { renderClock(); renderStatus(); }, 1000);
  setInterval(renderSessions, 15_000);
  setInterval(renderCalendar, 10 * 60_000);
  // 自動更新の保険（拡張では主に Service Worker のアラームが更新する）
  setInterval(() => {
    if (!document.hidden && state.settings.interval > 0 && isStale(state.settings.range) && Date.now() - lastAttemptAt > STALE_AFTER_MS) refresh();
  }, isExtension && !mockMode ? 15_000 : 5_000);

  client.opened().catch(() => {});
  if (isStale(settings.range) || !state.news[settings.newsSrc]) refresh();
  if (!state.news[settings.newsSrc]) client.refreshNews(settings.newsSrc).catch(() => {});
})();
