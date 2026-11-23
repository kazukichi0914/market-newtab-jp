// 開発用のダミーデータ（newtab.html?mock で有効）。通信しない。
import { downsample } from './yahoo.js';

const BASE = {
  '^N225': 39500, '1306.T': 2745, 'NIY=F': 39600, '2516.T': 652, '1591.T': 24500, '1343.T': 1890,
  'JPY=X': 156.3, 'EURJPY=X': 165.2, 'GBPJPY=X': 197.8, 'AUDJPY=X': 101.4, 'CNYJPY=X': 21.6, 'EURUSD=X': 1.0571,
  '^DJI': 43800, '^GSPC': 5950, '^IXIC': 19100, '^SOX': 5050, ACWI: 118, '^HSI': 19700, '000001.SS': 3350, '^GDAXI': 19400,
  JGB10Y: 1.85, '^TNX': 4.35, '^VIX': 15.2, 'CL=F': 70.1, 'GC=F': 2650, 'BTC-JPY': 14500000,
};

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

export const mock = {
  id: 'mock',
  concurrency: 8,
  minIntervalMs: 0,
  async fetchQuote(sym, range) {
    if (sym === 'ZZZZ.T') throw new Error('銘柄が見つかりません');
    const r = hash(sym + Math.floor(Date.now() / 60000));
    const base = BASE[sym] ?? (1000 + hash(sym) * 9000);
    const prev = base;
    const pct = (r - 0.5) * 6;
    const n = 80;
    const pts = [];
    const now = Math.floor(Date.now() / 1000);
    let v = prev;
    for (let i = 0; i < n; i++) {
      v += (prev * pct / 100 - (v - prev)) / (n - i) + (hash(sym + i) - 0.5) * prev * 0.002;
      pts.push([now - (n - i) * 300, v]);
    }
    const price = pts.at(-1)[1];
    await new Promise((res) => setTimeout(res, 30));
    return {
      sym, name: sym, currency: /\.T$|=X$|JPY|\^N225|NIY/.test(sym) ? 'JPY' : 'USD',
      price, prev, chg: price - prev, pct: ((price - prev) / prev) * 100,
      rangeBase: range === '1d' ? prev : pts[0][1],
      rangePct: ((price - pts[0][1]) / pts[0][1]) * 100,
      dayHi: Math.max(...pts.map((p) => p[1])), dayLo: Math.min(...pts.map((p) => p[1])),
      hi52: base * 1.25, lo52: base * 0.8, volume: Math.round(hash(sym) * 2e7),
      time: Date.now() - 20 * 60000, pts: downsample(pts), source: 'mock',
    };
  },
  async search(q) {
    return [{ sym: `${q.toUpperCase()}`, name: `${q}（モック）`, code: q.toUpperCase(), exch: 'MOCK' }];
  },
};
