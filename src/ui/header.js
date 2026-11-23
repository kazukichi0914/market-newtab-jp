// ヘッダー: 時計・市場の開閉・検索
import { marketState, zoned } from '../core/market-calendar.js';
import { SEARCH_ENGINES, quoteUrl } from '../core/config.js';
import { normalizeSymbol } from '../core/symbols.js';
import { duration, esc } from '../core/format.js';
import { attachSuggest } from './suggest.js';

const SESSION_IDS = ['tse', 'ose', 'lse', 'nyse'];
const NAMES = { tse: '東京', ose: '先物', lse: 'ロンドン', nyse: 'NY' };
const TZ = { tse: 'Asia/Tokyo', ose: 'Asia/Tokyo', lse: 'Europe/London', nyse: 'America/New_York' };

export function renderClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
  document.getElementById('date').textContent = now.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

export function renderSessions() {
  const now = Date.now();
  document.getElementById('sessions').innerHTML = SESSION_IDS.map((id) => {
    const st = marketState(id, now);
    const z = zoned(now, TZ[id]);
    const t = `${String(z.h).padStart(2, '0')}:${String(z.mi).padStart(2, '0')}`;
    let label = st.label;
    if (id === 'tse' && st.status === 'open') label = st.session; // 前場 / 後場
    if (id === 'ose' && st.status === 'open') label = st.session; // 日中 / 夜間
    if (st.status === 'open' && !st.session) label = '取引中';
    const until = st.nextChange ? duration(st.nextChange - now) : '';
    const tip = [
      st.holiday ? `休場: ${st.holiday}` : '',
      until ? (st.status === 'open' ? `終了まで ${until}` : `開始まで ${until}`) : '',
      `現地時刻 ${t}`,
    ].filter(Boolean).join(' / ');
    const cls = st.status === 'open' ? 'open' : st.status === 'break' ? 'lunch' : st.status === 'holiday' ? 'holiday' : 'closed';
    return `<span class="session ${cls}" title="${esc(tip)}"><span class="dot"></span>${NAMES[id]} ${esc(label)}${st.holiday ? `<span class="t">${esc(st.holiday)}</span>` : `<span class="t">${t}</span>`}</span>`;
  }).join('');
}

export function applySearchEngine(engineId) {
  const form = document.getElementById('search');
  const e = SEARCH_ENGINES[engineId] || SEARCH_ENGINES.google;
  form.action = e.action;
  form.querySelector('input').name = e.param;
  form.querySelector('input').placeholder = `${e.label} で検索 / 銘柄コード・銘柄名でチャートへ`;
}

export function bindSearch() {
  const form = document.getElementById('search');
  const input = form.querySelector('input');
  attachSuggest(input, (it) => { location.href = quoteUrl(it.sym); });
  form.addEventListener('submit', (e) => {
    const q = input.value.trim();
    if (/^[0-9][0-9A-Za-z]{3}$/.test(q.normalize('NFKC'))) {
      e.preventDefault();
      location.href = quoteUrl(normalizeSymbol(q));
    }
  });
}
