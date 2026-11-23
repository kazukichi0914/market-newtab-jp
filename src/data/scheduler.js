// データ取得の司令塔。拡張では Service Worker、開発時（拡張外）はページ内で動く。
import { RANGES, NEWS_FEEDS, NEWS_EVERY_MS, allPanelItems } from '../core/config.js';
import { store, sessionArea, loadSettings, loadWatchlists, loadPortfolio } from '../core/storage.js';
import { isSymbolLive, anyMajorOpen } from '../core/market-calendar.js';
import { fxSymbolFor } from '../core/portfolio.js';
import { yahoo, HttpError } from './providers/yahoo.js';
import { mof } from './providers/mof.js';
import { mock } from './providers/mock.js';
import { fetchNews } from './news.js';

const PROVIDERS = { yahoo, mof };
let mockMode = false;
export function setMockMode(on) { mockMode = !!on; }
function provider(id) { return mockMode ? mock : PROVIDERS[id]; }

const CLOSED_MIN_AGE_MS = 30 * 60_000; // 閉場中のシンボルは 30 分に 1 回で十分
const MANUAL_DEBOUNCE_MS = 10_000;
const LOCK_MS = 30_000;
const PAUSE_MS = 5 * 60_000;
const GOLD_OZ_G = 31.1035;

export const snapKey = (range) => `snap:${range}`;
export const newsKey = (src) => `news:${src}`;

/* ---------- 取得対象 ---------- */

/** key → 取得元リスト。パネル項目は item.id、ウォッチ・保有銘柄はシンボルがキー */
export function collectTargets(watchlists, portfolio) {
  const targets = new Map();
  for (const it of allPanelItems()) if (it.src) targets.set(it.id, it.src);
  const syms = new Set();
  for (const wl of watchlists) for (const s of wl.syms) syms.add(s);
  for (const h of portfolio) syms.add(h.sym);
  for (const s of syms) targets.set(s, [['yahoo', s]]);
  return targets;
}

/** 保有銘柄の円換算に必要な為替シンボルを追加 */
function addFxTargets(targets, quotes, portfolio) {
  for (const h of portfolio) {
    const fx = fxSymbolFor(quotes[h.sym]?.currency === 'GBp' ? 'GBP' : quotes[h.sym]?.currency);
    if (fx && !targets.has(fx)) targets.set(fx, [['yahoo', fx]]);
  }
}

/* ---------- 取得の制御 ---------- */

const nextSlot = new Map();
async function throttle(p) {
  const now = Date.now();
  const at = Math.max(now, nextSlot.get(p.id) || 0);
  nextSlot.set(p.id, at + (p.minIntervalMs || 0));
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

async function getPauses() {
  const { pauses } = await store.get(sessionArea, ['pauses']);
  return pauses || {};
}

async function withRetry(fn, tries = 2) {
  let delay = 1000;
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const fatal = e instanceof HttpError && [400, 401, 403, 404, 429].includes(e.status);
      if (fatal || i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  });
  await Promise.all(workers);
}

/**
 * 指定キーを取得する
 * @returns {Promise<{quotes:Object, errors:Object}>}
 */
async function fetchKeys(entries, range) {
  const pauses = await getPauses();
  const newPauses = {};
  const inflight = new Map(); // provider:sym → Promise（同一シンボルの重複取得を防ぐ）
  const quotes = {}, errors = {};
  const health = {}; // provider → { ok, ng }。1 件も成功せず失敗が続いたら、その取得元は今回打ち切る

  const fetchSrc = (pid, sym) => {
    const k = `${pid}:${sym}`;
    if (!inflight.has(k)) {
      inflight.set(k, (async () => {
        const p = provider(pid);
        if (!p) throw new Error(`未知の取得元 ${pid}`);
        const until = pauses[p.id] || newPauses[p.id];
        if (until && until > Date.now()) throw new Error('データ提供元の制限により一時停止中');
        const h = (health[p.id] ||= { ok: 0, ng: 0 });
        if (h.ok === 0 && h.ng >= 4) throw new Error('データ提供元に接続できません');
        await throttle(p);
        try {
          const q = await withRetry(() => p.fetchQuote(sym, range));
          h.ok++;
          return q;
        } catch (e) {
          if (!(e instanceof HttpError && e.status === 404)) h.ng++;
          if (e instanceof HttpError && (e.status === 429 || e.status === 403)) newPauses[p.id] = Date.now() + PAUSE_MS;
          throw e;
        }
      })());
    }
    return inflight.get(k);
  };

  await pool(entries, 4, async ([key, src]) => {
    let lastErr;
    for (const [pid, sym, opts] of src) {
      try {
        const q = await fetchSrc(pid, sym);
        quotes[key] = { ...q, sym, proxy: opts?.proxy || null, fetchedAt: Date.now() };
        return;
      } catch (e) { lastErr = e; }
    }
    errors[key] = lastErr?.message || '取得失敗';
  });

  if (Object.keys(newPauses).length) await store.set(sessionArea, { pauses: { ...pauses, ...newPauses } });
  return { quotes, errors };
}

/** 派生値（金の円換算） */
export function computeDerived(quotes) {
  const g = quotes.gold, u = quotes.usdjpy;
  if (g?.price != null && u?.price != null) {
    const k = u.price / GOLD_OZ_G;
    const prev = g.prev != null && u.prev != null ? (g.prev * u.prev) / GOLD_OZ_G : null;
    const price = g.price * k;
    const rangeBase = g.rangeBase != null ? g.rangeBase * k : null;
    quotes.goldjpy = {
      sym: 'GC=F', name: '金（円換算）', currency: 'JPY', price, prev,
      chg: prev != null ? price - prev : null,
      pct: prev ? ((price - prev) / prev) * 100 : null,
      rangeBase, rangePct: rangeBase ? ((price - rangeBase) / rangeBase) * 100 : null,
      pts: (g.pts || []).map(([t, v]) => [t, v * k]),
      time: g.time, fetchedAt: Math.min(g.fetchedAt || 0, u.fetchedAt || 0), source: 'derived',
      proxy: '金先物（ドル建）× ドル円 ÷ 31.1035 で換算した参考値',
    };
  }
  return quotes;
}

/* ---------- 期間ごとの更新 ---------- */

const running = new Map();

export function refreshRange(range, opts = {}) {
  if (running.has(range)) return running.get(range);
  const job = doRefreshRange(range, opts).finally(() => running.delete(range));
  running.set(range, job);
  return job;
}

async function doRefreshRange(range, { force = false, onlyKeys = null } = {}) {
  const lockKey = `lock:${range}`;
  const lock = (await store.get(sessionArea, [lockKey]))[lockKey];
  if (!force && lock && Date.now() - lock < LOCK_MS) return { skipped: 'locked' };
  await store.set(sessionArea, { [lockKey]: Date.now() });

  try {
    const [watchlists, portfolio] = await Promise.all([loadWatchlists(), loadPortfolio()]);
    const key = snapKey(range);
    const old = (await store.get('local', [key]))[key] || { ts: 0, quotes: {}, errors: {} };
    const targets = collectTargets(watchlists, portfolio);
    addFxTargets(targets, old.quotes, portfolio);
    const minAge = (RANGES.find((r) => r.id === range)?.minAgeSec || 0) * 1000;
    const now = Date.now();

    const due = [];
    for (const [k, src] of targets) {
      if (onlyKeys && !onlyKeys.includes(k)) continue;
      const q = old.quotes[k];
      const live = isSymbolLive(src[0][1], now);
      const age = q ? now - (q.fetchedAt || 0) : Infinity;
      const need = force || !q || age >= (live ? minAge : Math.max(minAge, CLOSED_MIN_AGE_MS));
      if (need) due.push([k, src]);
    }

    let { quotes, errors } = due.length ? await fetchKeys(due, range) : { quotes: {}, errors: {} };

    // 保有銘柄の通貨が初めて分かった場合、必要な為替を追加取得
    const merged = { ...old.quotes, ...quotes };
    const fxTargets = new Map();
    addFxTargets(fxTargets, merged, portfolio);
    const missingFx = [...fxTargets].filter(([k]) => !merged[k]);
    if (missingFx.length) {
      const extra = await fetchKeys(missingFx, range);
      Object.assign(merged, extra.quotes);
      errors = { ...errors, ...extra.errors };
    }

    // 対象外になったキーを掃除
    for (const k of Object.keys(merged)) if (!targets.has(k) && !fxTargets.has(k) && k !== 'goldjpy') delete merged[k];
    computeDerived(merged);

    const keptErrors = {};
    for (const [k, v] of Object.entries({ ...old.errors, ...errors })) if (!quotes[k] && targets.has(k)) keptErrors[k] = v;
    // 1 件も取得できなかった場合は「最終更新」を進めない
    const snap = { ts: Object.keys(quotes).length ? Date.now() : old.ts || 0, quotes: merged, errors: keptErrors, range };
    await store.set('local', { [key]: snap });
    return { fetched: due.length, failed: Object.keys(errors).length };
  } finally {
    await store.remove(sessionArea, [lockKey]);
  }
}

/**
 * 定期・手動更新の入口
 * 1日（現在値の元）は常に、表示中の期間が別ならそれも更新する
 */
export async function refreshAll({ range = '1d', force = false, reason = '' } = {}) {
  if (reason === 'manual') {
    const snap = (await store.get('local', [snapKey(range)]))[snapKey(range)];
    if (snap && Date.now() - snap.ts < MANUAL_DEBOUNCE_MS) return { skipped: 'debounce' };
  }
  const jobs = [refreshRange('1d', { force })];
  if (range !== '1d') jobs.push(refreshRange(range, { force }));
  const settings = await loadSettings();
  jobs.push(refreshNews(settings.newsSrc, force || reason === 'manual'));
  const results = await Promise.allSettled(jobs);
  return { results: results.map((r) => r.status) };
}

/** ウォッチリスト・保有に追加する銘柄の存在確認と即時取得 */
export async function fetchOne(sym, range = '1d') {
  const p = provider('yahoo');
  const q = await p.fetchQuote(sym, range);
  for (const r of new Set(['1d', range])) {
    const key = snapKey(r);
    const snap = (await store.get('local', [key]))[key] || { ts: Date.now(), quotes: {}, errors: {} };
    const qq = r === range ? q : await p.fetchQuote(sym, r).catch(() => null);
    if (qq) {
      snap.quotes[sym] = { ...qq, sym, fetchedAt: Date.now() };
      delete snap.errors?.[sym];
      await store.set('local', { [key]: snap });
    }
  }
  return { sym, name: q.name, currency: q.currency };
}

export async function searchRemote(q) {
  const p = provider('yahoo');
  return p.search ? p.search(q) : [];
}

/* ---------- ニュース ---------- */

export async function refreshNews(src, force = false) {
  if (!NEWS_FEEDS[src]) return;
  const key = newsKey(src);
  const old = (await store.get('local', [key]))[key];
  if (!force && old && Date.now() - old.ts < NEWS_EVERY_MS) return;
  try {
    const items = mockMode
      ? Array.from({ length: 12 }, (_, i) => ({ title: `モックニュース ${i + 1}：日経平均は小幅続伸、半導体株に買い`, link: `https://news.yahoo.co.jp/mock/${i}`, date: Date.now() - i * 1800_000 }))
      : await fetchNews(src);
    await store.set('local', { [key]: { ts: Date.now(), items, error: null } });
  } catch (e) {
    await store.set('local', { [key]: { ts: Date.now(), items: old?.items || [], error: e.message } });
  }
}

/* ---------- 次回更新までの間隔 ---------- */

/**
 * 次回の自動更新までの秒数（純粋関数・テスト対象）。0 = 予定しない
 * @param {{interval:number, offhours:number}} settings
 * @param {number} now
 * @param {number|null} lastNewtabAt 最後に新規タブが開かれた時刻
 */
export function computeDelaySec(settings, now, lastNewtabAt) {
  const idle = lastNewtabAt != null && now - lastNewtabAt > 30 * 60_000;
  if (!settings.interval) return 0; // 「自動更新しない」
  let sec;
  if (anyMajorOpen(now)) sec = settings.interval;
  else sec = settings.offhours;
  if (!sec) return 0;
  if (idle) sec = Math.max(sec, 1800);
  return Math.max(30, sec); // chrome.alarms の最短周期は 30 秒
}
