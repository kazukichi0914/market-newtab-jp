'use strict';

/* ================= 設定・定義 ================= */

const DOMESTIC = [
  { s: '^N225', n: '日経平均株価' },
  { s: '1306.T', n: 'TOPIX（連動ETF 1306）' },
  { s: 'NIY=F', n: '日経225先物（CME・円建）' },
  { s: '1321.T', n: '日経225連動ETF（1321）' },
  { s: '2516.T', n: '東証グロース250 ETF' },
];
const GLOBAL = [
  { s: '^DJI', n: 'NYダウ' },
  { s: '^GSPC', n: 'S&P 500' },
  { s: '^IXIC', n: 'NASDAQ総合' },
  { s: '^SOX', n: 'フィラデルフィア半導体' },
  { s: '^HSI', n: '香港ハンセン' },
  { s: '^GDAXI', n: '独DAX' },
];
const FX = [
  { s: 'JPY=X', n: 'ドル / 円', sub: 'USD/JPY', d: 2 },
  { s: 'EURJPY=X', n: 'ユーロ / 円', sub: 'EUR/JPY', d: 2 },
  { s: 'GBPJPY=X', n: 'ポンド / 円', sub: 'GBP/JPY', d: 2 },
  { s: 'AUDJPY=X', n: '豪ドル / 円', sub: 'AUD/JPY', d: 2 },
  { s: 'CNYJPY=X', n: '人民元 / 円', sub: 'CNY/JPY', d: 3 },
  { s: 'EURUSD=X', n: 'ユーロ / ドル', sub: 'EUR/USD', d: 4 },
];
const OTHER = [
  { s: '^TNX', n: '米10年債利回り', sub: 'US 10Y（%）', d: 3 },
  { s: '^VIX', n: 'VIX 恐怖指数', sub: 'CBOE', d: 2 },
  { s: 'CL=F', n: 'WTI原油', sub: 'USD/バレル', d: 2 },
  { s: 'GC=F', n: '金先物', sub: 'USD/トロイオンス', d: 1 },
  { s: 'BTC-JPY', n: 'ビットコイン', sub: '円', d: 0 },
];
const DEFAULT_WATCH = ['7203.T', '6758.T', '9984.T', '8306.T', '8035.T', '6861.T', '9983.T', '7974.T', '6501.T', '8058.T', '4063.T', '9432.T'];
const JP_NAMES = {
  '7203.T': 'トヨタ自動車', '6758.T': 'ソニーG', '9984.T': 'ソフトバンクG', '8306.T': '三菱UFJ',
  '8035.T': '東京エレクトロン', '6861.T': 'キーエンス', '9983.T': 'ファーストリテイリング', '7974.T': '任天堂',
  '6501.T': '日立製作所', '8058.T': '三菱商事', '4063.T': '信越化学', '9432.T': 'NTT', '6098.T': 'リクルートHD',
  '8316.T': '三井住友FG', '8001.T': '伊藤忠商事', '4502.T': '武田薬品', '6902.T': 'デンソー', '7267.T': 'ホンダ',
  '6981.T': '村田製作所', '6367.T': 'ダイキン', '9433.T': 'KDDI', '8766.T': '東京海上HD', '6857.T': 'アドバンテスト',
  '7011.T': '三菱重工', '4568.T': '第一三共', '6954.T': 'ファナック', '8411.T': 'みずほFG', '9434.T': 'ソフトバンク',
};
const RANGE_INTERVAL = { '1d': '5m', '5d': '30m', '1mo': '1d', '1y': '1d' };
const NEWS_FEEDS = {
  nhk: 'https://www3.nhk.or.jp/rss/news/cat5.xml',
  yahoo: 'https://news.yahoo.co.jp/rss/topics/business.xml',
};

const state = {
  range: '1d',
  colorMode: 'jp',
  interval: 60,
  watch: DEFAULT_WATCH.slice(),
  newsSrc: 'nhk',
  quotes: {},
  timer: null,
};

/* ================= ストレージ（拡張外で開いた場合は localStorage） ================= */

const hasChrome = typeof chrome !== 'undefined' && chrome.storage;
const store = {
  async get(area, keys) {
    if (hasChrome) return chrome.storage[area].get(keys);
    const out = {};
    for (const k of keys) {
      try { const v = localStorage.getItem(k); if (v != null) out[k] = JSON.parse(v); } catch (_) {}
    }
    return out;
  },
  async set(area, obj) {
    if (hasChrome) return chrome.storage[area].set(obj);
    for (const [k, v] of Object.entries(obj)) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
    }
  },
};

/* ================= ユーティリティ ================= */

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmt(n, d = 2) {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function sign(n) { return n > 0 ? '+' : ''; }
function dir(n) { return n > 0 ? 'up' : n < 0 ? 'down' : 'flat'; }
function autoDigits(price) {
  if (price == null) return 2;
  if (price >= 10000) return 0;
  if (price >= 1000) return 1;
  return 2;
}

function quoteUrl(sym) {
  if (/\.T$/.test(sym)) return `https://finance.yahoo.co.jp/quote/${encodeURIComponent(sym)}`;
  const jp = { '^N225': '998407.O', 'JPY=X': 'USDJPY=FX', 'EURJPY=X': 'EURJPY=FX', 'GBPJPY=X': 'GBPJPY=FX', 'AUDJPY=X': 'AUDJPY=FX', 'CNYJPY=X': 'CNYJPY=FX', 'EURUSD=X': 'EURUSD=FX', '^DJI': '%5EDJI' };
  if (jp[sym]) return `https://finance.yahoo.co.jp/quote/${jp[sym]}`;
  return `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`;
}

function normalizeSymbol(input) {
  const s = input.trim().toUpperCase();
  if (!s) return null;
  if (/^[0-9][0-9A-Z]{3}$/.test(s)) return `${s}.T`; // 東証の4桁コード（285A 等も可）
  if (/^[\^A-Z0-9.=\-]{1,20}$/.test(s)) return s;
  return null;
}

/* ================= データ取得 ================= */

async function fetchChart(sym, range) {
  const interval = RANGE_INTERVAL[range];
  const hosts = ['query1', 'query2'];
  let lastErr;
  for (const h of hosts) {
    try {
      const url = `https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const r = json?.chart?.result?.[0];
      if (!r) throw new Error(json?.chart?.error?.description || 'no data');
      const m = r.meta;
      const closes = (r.indicators?.quote?.[0]?.close || []);
      const ts = r.timestamp || [];
      const pts = [];
      for (let i = 0; i < closes.length; i++) if (closes[i] != null) pts.push([ts[i], closes[i]]);
      const price = m.regularMarketPrice ?? pts.at(-1)?.[1];
      // 前日終値: 期間が1日以外だと previousClose が無い場合があるので順に補完
      const prev = m.previousClose
        ?? (range === '1d' ? m.chartPreviousClose : null)
        ?? (m.fulldayChange != null && price != null ? price - m.fulldayChange : null)
        ?? (m.regularMarketChangePercent != null && price != null ? price / (1 + m.regularMarketChangePercent / 100) : null)
        ?? (interval === '1d' ? pts.at(-2)?.[1] : null);
      const rangeBase = range === '1d' ? prev : (m.chartPreviousClose ?? pts[0]?.[1]);
      return {
        sym, price, prev, rangeBase,
        chg: price != null && prev != null ? price - prev : null,
        pct: price != null && prev ? ((price - prev) / prev) * 100 : null,
        rangePct: price != null && rangeBase ? ((price - rangeBase) / rangeBase) * 100 : null,
        hi52: m.fiftyTwoWeekHigh, lo52: m.fiftyTwoWeekLow,
        dayHi: m.regularMarketDayHigh, dayLo: m.regularMarketDayLow,
        name: m.shortName || m.longName || sym,
        time: m.regularMarketTime,
        pts,
      };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = { ok: true, v: await fn(items[idx]) }; }
      catch (e) { out[idx] = { ok: false, e, item: items[idx] }; }
    }
  });
  await Promise.all(workers);
  return out;
}

/* ================= 描画 ================= */

function sparkline(pts, base, w = 200, h = 44) {
  if (!pts || pts.length < 2) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
  const ys = pts.map((p) => p[1]);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (base != null && isFinite(base)) { min = Math.min(min, base); max = Math.max(max, base); }
  const pad = 3;
  const span = max - min || 1;
  const x = (i) => (i / (pts.length - 1)) * w;
  const y = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = ys.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = ys.at(-1);
  const ref = base ?? ys[0];
  const col = last > ref ? 'var(--up)' : last < ref ? 'var(--down)' : 'var(--flat)';
  const area = `${d}L${w},${h}L0,${h}Z`;
  const gid = 'g' + Math.random().toString(36).slice(2, 8);
  const baseLine = base != null && isFinite(base)
    ? `<line x1="0" x2="${w}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}" stroke="var(--muted)" stroke-width="0.8" stroke-dasharray="3 3" opacity=".6"/>`
    : '';
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/>
    </linearGradient></defs>
    ${baseLine}
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function rangeNote(q) {
  if (state.range === '1d' || q.rangePct == null) return '';
  const label = { '5d': '5日', '1mo': '1ヶ月', '1y': '1年' }[state.range];
  return `<div class="sub">${label}騰落 <span class="${dir(q.rangePct)}">${sign(q.rangePct)}${fmt(q.rangePct)}%</span></div>`;
}

function renderCards(el, defs) {
  el.innerHTML = defs.map(({ s, n, d }) => {
    const q = state.quotes[s];
    if (!q) return `<div class="card"><div class="name">${esc(n)}</div><div class="skeleton">取得中…</div></div>`;
    const dg = d ?? autoDigits(q.price);
    return `<a class="card" href="${quoteUrl(s)}">
      <div class="name">${esc(n)}</div>
      <div class="price num">${fmt(q.price, dg)}</div>
      <div class="chg num ${dir(q.chg)}">${sign(q.chg)}${fmt(q.chg, dg)}（${sign(q.pct)}${fmt(q.pct)}%）</div>
      ${rangeNote(q)}
      ${sparkline(q.pts, state.range === '1d' ? q.prev : q.rangeBase)}
    </a>`;
  }).join('');
}

function renderRows(el, defs) {
  el.innerHTML = defs.map(({ s, n, sub, d }) => {
    const q = state.quotes[s];
    if (!q) return `<div class="row"><div class="rname">${esc(n)}<small>${esc(sub || '')}</small></div><div class="skeleton">取得中…</div><div></div></div>`;
    const dg = d ?? autoDigits(q.price);
    return `<a class="row" href="${quoteUrl(s)}">
      <div class="rname">${esc(n)}<small>${esc(sub || '')}</small></div>
      <div class="rval num">${fmt(q.price, dg)}<small class="${dir(q.chg)}">${sign(q.chg)}${fmt(q.chg, dg)}（${sign(q.pct)}${fmt(q.pct)}%）</small></div>
      ${sparkline(q.pts, state.range === '1d' ? q.prev : q.rangeBase, 90, 30)}
    </a>`;
  }).join('');
}

function displayName(sym, q) {
  return JP_NAMES[sym] || q?.name || sym;
}

function renderWatch() {
  const body = $('#watchBody');
  const heat = $('#heatmap');
  body.innerHTML = state.watch.map((s) => {
    const q = state.quotes[s];
    const code = s.replace(/\.T$/, '');
    if (!q) {
      return `<tr><td><a href="${quoteUrl(s)}">${esc(displayName(s))}</a><span class="code">${esc(code)}</span></td>
        <td colspan="5" class="skeleton">取得中…</td><td><button class="del" data-sym="${esc(s)}" title="削除">✕</button></td></tr>`;
    }
    const dg = q.price >= 1000 ? 0 : 1;
    let r52 = '—';
    if (q.hi52 != null && q.lo52 != null && q.hi52 > q.lo52) {
      const p = Math.max(0, Math.min(1, (q.price - q.lo52) / (q.hi52 - q.lo52))) * 100;
      r52 = `<span class="range52" title="安値 ${fmt(q.lo52, dg)} / 高値 ${fmt(q.hi52, dg)}"><i style="left:calc(${p.toFixed(1)}% - 1px)"></i></span>`;
    }
    return `<tr>
      <td><a href="${quoteUrl(s)}">${esc(displayName(s, q))}</a><span class="code">${esc(code)}</span></td>
      <td class="num">${fmt(q.price, dg)}</td>
      <td class="num ${dir(q.chg)}">${sign(q.chg)}${fmt(q.chg, dg)}</td>
      <td class="num ${dir(q.pct)}">${sign(q.pct)}${fmt(q.pct)}%</td>
      <td>${sparkline(q.pts, state.range === '1d' ? q.prev : q.rangeBase, 110, 26)}</td>
      <td>${r52}</td>
      <td><button class="del" data-sym="${esc(s)}" title="削除">✕</button></td>
    </tr>`;
  }).join('');

  heat.innerHTML = state.watch.map((s) => {
    const q = state.quotes[s];
    const pct = q?.pct ?? 0;
    const strength = Math.min(Math.abs(pct) / 3, 1); // ±3% で最大
    const pctMix = Math.round(25 + strength * 70);
    const bg = pct === 0 || !q ? 'var(--line)' : `color-mix(in srgb, var(--${pct > 0 ? 'up' : 'down'}) ${pctMix}%, var(--panel-2))`;
    return `<a class="tile" href="${quoteUrl(s)}" style="background:${bg}">
      <b>${esc(displayName(s, q))}</b>${q ? `${sign(pct)}${fmt(pct)}%` : '—'}
    </a>`;
  }).join('');
}

function renderAll() {
  renderCards($('#domestic'), DOMESTIC);
  renderCards($('#global'), GLOBAL);
  renderRows($('#fx'), FX);
  renderRows($('#other'), OTHER);
  renderWatch();
}

/* ================= 市場セッション・時計 ================= */

const SESSIONS = [
  { n: '東京', tz: 'Asia/Tokyo', s: [[9, 0, 11, 30], [12, 30, 15, 30]] },
  { n: 'ロンドン', tz: 'Europe/London', s: [[8, 0, 16, 30]] },
  { n: 'NY', tz: 'America/New_York', s: [[9, 30, 16, 0]] },
];

function zoneParts(tz, d = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value;
  return { wd: g('weekday'), h: Number(g('hour')) % 24, m: Number(g('minute')) };
}

function renderSessions() {
  const now = new Date();
  $('#sessions').innerHTML = SESSIONS.map(({ n, tz, s }) => {
    const { wd, h, m } = zoneParts(tz, now);
    const mins = h * 60 + m;
    const weekday = !['Sat', 'Sun'].includes(wd);
    let status = 'closed', label = '閉場';
    if (weekday) {
      if (s.some(([h1, m1, h2, m2]) => mins >= h1 * 60 + m1 && mins < h2 * 60 + m2)) { status = 'open'; label = '取引中'; }
      else if (s.length > 1 && mins >= s[0][2] * 60 + s[0][3] && mins < s[1][0] * 60 + s[1][1]) { status = 'lunch'; label = '昼休み'; }
    }
    const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return `<span class="session ${status}"><span class="dot"></span>${n} ${label}<span class="t">${t}</span></span>`;
  }).join('');
}

function tick() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
  $('#date').textContent = now.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  if (now.getSeconds() === 0 || !$('#sessions').children.length) renderSessions();
}

/* ================= ニュース ================= */

async function loadNews() {
  const el = $('#news');
  el.innerHTML = '<li class="skeleton">ニュースを取得中…</li>';
  try {
    const res = await fetch(NEWS_FEEDS[state.newsSrc], { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
    const items = [...xml.querySelectorAll('item')].slice(0, 30).map((it) => ({
      title: it.querySelector('title')?.textContent?.trim(),
      link: it.querySelector('link')?.textContent?.trim(),
      date: it.querySelector('pubDate')?.textContent,
    })).filter((x) => x.title && /^https?:\/\//.test(x.link || ''));
    if (!items.length) throw new Error('記事がありません');
    el.innerHTML = items.map((x) => {
      const d = x.date ? new Date(x.date) : null;
      const ds = d && !isNaN(d) ? d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return `<li><a href="${esc(x.link)}">${esc(x.title)}<time>${ds}</time></a></li>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<li class="skeleton">ニュースを取得できませんでした（${esc(e.message)}）</li>`;
  }
}

/* ================= 更新処理 ================= */

let loading = false;
async function refresh() {
  if (loading) return;
  loading = true;
  $('#refreshBtn').classList.add('spin');
  const syms = [...new Set([...DOMESTIC, ...GLOBAL, ...FX, ...OTHER].map((x) => x.s).concat(state.watch))];
  const range = state.range;
  const results = await pool(syms, 8, (s) => fetchChart(s, range));
  if (range !== state.range) { loading = false; return; } // 途中で期間が変わった
  const failed = [];
  for (const r of results) {
    if (r.ok) state.quotes[r.v.sym] = r.v;
    else failed.push(r.item);
  }
  renderAll();
  state.lastRefresh = Date.now();
  const now = new Date();
  $('#updated').textContent = `最終更新 ${now.toLocaleTimeString('ja-JP', { hour12: false })}（データは遅延値の場合があります）`;
  $('#errors').textContent = failed.length ? `取得失敗: ${failed.join(', ')}` : '';
  store.set('local', { cache: { range, quotes: state.quotes, ts: Date.now() } });
  $('#refreshBtn').classList.remove('spin');
  loading = false;
}

function schedule() {
  clearInterval(state.timer);
  if (state.interval > 0) {
    state.timer = setInterval(() => { if (!document.hidden) refresh(); }, state.interval * 1000);
  }
}

async function saveSettings() {
  await store.set('sync', { range: state.range, colorMode: state.colorMode, interval: state.interval, watch: state.watch, newsSrc: state.newsSrc });
}

function applyColorMode() {
  document.body.classList.toggle('us', state.colorMode === 'us');
}

function setSeg(segEl, attr, value) {
  segEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === value));
}

/* ================= イベント ================= */

function bind() {
  $('#rangeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.range = b.dataset.range;
    setSeg($('#rangeSeg'), 'range', state.range);
    state.quotes = {};
    renderAll();
    saveSettings();
    loading = false;
    refresh();
  });

  $('#newsSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.newsSrc = b.dataset.src;
    setSeg($('#newsSeg'), 'src', state.newsSrc);
    saveSettings();
    loadNews();
  });

  $('#refreshBtn').addEventListener('click', () => { refresh(); loadNews(); });

  $('#search').addEventListener('submit', (e) => {
    const q = e.target.q.value.trim();
    if (/^[0-9][0-9A-Za-z]{3}$/.test(q)) {
      e.preventDefault();
      location.href = quoteUrl(`${q.toUpperCase()}.T`);
    }
  });

  $('#addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sym = normalizeSymbol($('#addInput').value);
    if (!sym) return;
    $('#addInput').value = '';
    if (state.watch.includes(sym)) return;
    try {
      const q = await fetchChart(sym, state.range);
      state.quotes[sym] = q;
      state.watch.push(sym);
      renderWatch();
      saveSettings();
    } catch (err) {
      $('#errors').textContent = `「${sym}」が見つかりません`;
    }
  });

  $('#watchBody').addEventListener('click', (e) => {
    const b = e.target.closest('.del'); if (!b) return;
    state.watch = state.watch.filter((s) => s !== b.dataset.sym);
    renderWatch();
    saveSettings();
  });

  const dlg = $('#settings');
  $('#settingsBtn').addEventListener('click', () => {
    $('#colorMode').value = state.colorMode;
    $('#interval').value = String(state.interval);
    dlg.showModal();
  });
  $('#colorMode').addEventListener('change', (e) => { state.colorMode = e.target.value; applyColorMode(); saveSettings(); });
  $('#interval').addEventListener('change', (e) => { state.interval = Number(e.target.value); schedule(); saveSettings(); });
  $('#resetWatch').addEventListener('click', () => { state.watch = DEFAULT_WATCH.slice(); saveSettings(); refresh(); dlg.close(); });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const cache = state.lastRefresh || 0;
      if (Date.now() - cache > 30000) refresh();
    }
  });
}

/* ================= 起動 ================= */

(async function init() {
  const saved = await store.get('sync', ['range', 'colorMode', 'interval', 'watch', 'newsSrc']);
  Object.assign(state, Object.fromEntries(Object.entries(saved).filter(([, v]) => v != null)));
  applyColorMode();
  setSeg($('#rangeSeg'), 'range', state.range);
  setSeg($('#newsSeg'), 'src', state.newsSrc);

  const { cache } = await store.get('local', ['cache']);
  if (cache && cache.range === state.range && cache.quotes) {
    state.quotes = cache.quotes;
    $('#updated').textContent = `前回データを表示中（${new Date(cache.ts).toLocaleTimeString('ja-JP', { hour12: false })}）… 更新中`;
  }

  tick();
  setInterval(tick, 1000);
  renderAll();
  bind();
  schedule();
  refresh();
  loadNews();
})();
