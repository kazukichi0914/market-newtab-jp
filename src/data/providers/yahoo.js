// Yahoo Finance 非公式 chart API
// 注意: 公式に提供されている API ではなく、予告なく仕様変更・遮断される可能性がある。
import { RANGES, MAX_POINTS } from '../../core/config.js';

export class HttpError extends Error {
  constructor(status, msg) { super(msg || `HTTP ${status}`); this.status = status; }
}

const HOSTS = ['query1', 'query2'];

export function downsample(pts, max = MAX_POINTS) {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

/** chart API のレスポンス → Quote（純粋関数・テスト対象） */
export function parseChart(json, sym, range) {
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description || 'データがありません');
  const m = r.meta || {};
  if (m.regularMarketPrice == null && !r.timestamp) throw new Error('データ形式が想定と異なります');
  const interval = RANGES.find((x) => x.id === range)?.interval;
  const closes = r.indicators?.quote?.[0]?.close || [];
  const ts = r.timestamp || [];
  const pts = [];
  for (let i = 0; i < closes.length; i++) if (closes[i] != null && ts[i] != null) pts.push([ts[i], closes[i]]);
  const price = m.regularMarketPrice ?? pts.at(-1)?.[1] ?? null;

  // 前日終値の決定（設計書 §9.2）
  const prev = m.previousClose
    ?? (range === '1d' ? m.chartPreviousClose : null)
    ?? (m.fulldayChange != null && price != null && m.fulldayChange !== 0 ? price - m.fulldayChange : null)
    ?? (m.regularMarketChangePercent && price != null ? price / (1 + m.regularMarketChangePercent / 100) : null)
    ?? (interval === '1d' && pts.length >= 2 ? pts.at(-2)[1] : null)
    ?? (range === '1d' ? m.chartPreviousClose ?? null : null);

  const rangeBase = range === '1d' ? prev : (m.chartPreviousClose ?? pts[0]?.[1] ?? null);
  return {
    sym,
    name: m.shortName || m.longName || sym,
    currency: m.currency || null,
    price,
    prev,
    chg: price != null && prev != null ? price - prev : null,
    pct: price != null && prev ? ((price - prev) / prev) * 100 : null,
    rangeBase,
    rangePct: price != null && rangeBase ? ((price - rangeBase) / rangeBase) * 100 : null,
    dayHi: m.regularMarketDayHigh ?? null,
    dayLo: m.regularMarketDayLow ?? null,
    hi52: m.fiftyTwoWeekHigh ?? null,
    lo52: m.fiftyTwoWeekLow ?? null,
    volume: m.regularMarketVolume ?? null,
    time: m.regularMarketTime ? m.regularMarketTime * 1000 : null,
    pts: downsample(pts),
    source: 'yahoo',
  };
}

export const yahoo = {
  id: 'yahoo',
  concurrency: 4,
  minIntervalMs: 150,
  async fetchQuote(sym, range) {
    const interval = RANGES.find((x) => x.id === range)?.interval || '5m';
    let lastErr;
    for (const h of HOSTS) {
      try {
        const url = `https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.status === 404) {
          throw new HttpError(404, '銘柄が見つかりません');
        }
        if (!res.ok) throw new HttpError(res.status);
        return parseChart(await res.json(), sym, range);
      } catch (e) {
        lastErr = e;
        if (e.status === 404) break; // 存在しない銘柄はもう一方のホストでも同じ
      }
    }
    throw lastErr;
  },
  async search(q) {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0&lang=ja-JP&region=JP`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new HttpError(res.status);
    const j = await res.json();
    return (j.quotes || [])
      .filter((x) => x.symbol && ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND', 'CURRENCY', 'CRYPTOCURRENCY', 'FUTURE'].includes(x.quoteType))
      .map((x) => ({ sym: x.symbol, name: x.shortname || x.longname || x.symbol, code: x.symbol.replace(/\.T$/, ''), exch: x.exchDisp || '' }));
  },
};
