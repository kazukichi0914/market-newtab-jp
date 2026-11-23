// 財務省「国債金利情報」CSV（日次・Shift_JIS）から日本10年国債利回りを取得
// 当月分: jgbcm.csv / 前月末までの全期間: data/jgbcm_all.csv（約 1MB のため半日に 1 回だけ取得）
import { store } from '../../core/storage.js';
import { downsample } from './yahoo.js';
import { zonedToEpoch } from '../../core/market-calendar.js';

const CUR_URL = 'https://www.mof.go.jp/jgbs/reference/interest_rate/jgbcm.csv';
const ALL_URL = 'https://www.mof.go.jp/jgbs/reference/interest_rate/data/jgbcm_all.csv';
const ALL_TTL = 12 * 3600_000;
const ERA = { R: 2018, H: 1988, S: 1925 };
const RANGE_DAYS = { '1d': 31, '5d': 31, '1mo': 31, '6mo': 183, '1y': 366, '5y': 1830 };

/** 'R8.11.2' → エポック秒（日本時間 15:00 を基準時刻とする） */
export function parseWareki(s) {
  const m = /^([RHS])(\d+)\.(\d+)\.(\d+)$/.exec(String(s).trim());
  if (!m) return null;
  const y = ERA[m[1]] + Number(m[2]);
  return Math.floor(zonedToEpoch(y, Number(m[3]), Number(m[4]), 15, 0, 'Asia/Tokyo') / 1000);
}

/** CSV テキスト → [[エポック秒, 利回り]]（純粋関数・テスト対象） */
export function parseJgbCsv(text, column = '10年') {
  const lines = text.split(/\r?\n/);
  const hi = lines.findIndex((l) => l.startsWith('基準日'));
  if (hi < 0) throw new Error('財務省CSVの形式が想定と異なります');
  const col = lines[hi].split(',').indexOf(column);
  if (col < 0) throw new Error(`列「${column}」がありません`);
  const pts = [];
  for (const line of lines.slice(hi + 1)) {
    const cells = line.split(',');
    const t = parseWareki(cells[0]);
    const v = Number(cells[col]);
    if (t && cells[col] !== '-' && Number.isFinite(v)) pts.push([t, v]);
  }
  return pts;
}

async function fetchCsv(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`財務省 HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('shift_jis').decode(buf);
}

async function loadHistory(needDays) {
  const { mofHistory } = await store.get('local', ['mofHistory']);
  if (mofHistory && Date.now() - mofHistory.ts < ALL_TTL) return mofHistory.pts;
  if (needDays <= 31 && mofHistory) return mofHistory.pts; // 期限切れでも短期表示には十分
  const pts = parseJgbCsv(await fetchCsv(ALL_URL));
  const cutoff = Date.now() / 1000 - 1900 * 86400; // 約 5 年分だけ保持
  const kept = pts.filter(([t]) => t >= cutoff);
  await store.set('local', { mofHistory: { ts: Date.now(), pts: kept } });
  return kept;
}

export const mof = {
  id: 'mof',
  concurrency: 1,
  minIntervalMs: 0,
  async fetchQuote(sym, range) {
    if (sym !== 'JGB10Y') throw new Error('未対応のシンボル');
    const days = RANGE_DAYS[range] || 31;
    const cur = parseJgbCsv(await fetchCsv(CUR_URL));
    let pts = cur;
    if (days > 31 || cur.length < 2) {
      const hist = await loadHistory(days);
      const last = cur[0]?.[0] ?? Infinity;
      pts = hist.filter(([t]) => t < last).concat(cur);
    }
    if (pts.length === 0) throw new Error('財務省CSVにデータがありません');
    const cutoff = pts.at(-1)[0] - days * 86400;
    const view = pts.filter(([t]) => t >= cutoff);
    const price = pts.at(-1)[1];
    const prev = pts.length >= 2 ? pts.at(-2)[1] : null;
    const rangeBase = range === '1d' ? prev : view[0]?.[1] ?? null;
    return {
      sym, name: '日本10年国債利回り', currency: null,
      price, prev,
      chg: prev != null ? price - prev : null,
      pct: prev ? ((price - prev) / prev) * 100 : null,
      rangeBase,
      rangePct: rangeBase ? ((price - rangeBase) / rangeBase) * 100 : null,
      dayHi: null, dayLo: null, hi52: null, lo52: null, volume: null,
      time: pts.at(-1)[0] * 1000,
      pts: downsample(view),
      source: 'mof',
      daily: true,
    };
  },
};
