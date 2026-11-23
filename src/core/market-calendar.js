// 市場の取引時間・祝日・SQ 日の判定
// 時刻はすべて Intl のタイムゾーン指定で計算し、PC のローカル時刻設定に依存しない。
import { JP_HOLIDAYS, US_HOLIDAYS, US_EARLY_CLOSE, UK_HOLIDAYS, COVERAGE_UNTIL } from '../static/holidays.js';

const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const fmtCache = new Map();

function formatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return fmtCache.get(tz);
}

/** タイムゾーン tz における日時の各要素 */
export function zoned(ms, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ms))) p[type] = value;
  const y = Number(p.year), mo = Number(p.month), d = Number(p.day);
  const h = Number(p.hour) % 24, mi = Number(p.minute), s = Number(p.second);
  return { y, mo, d, h, mi, s, wd: WD[p.weekday], date: `${p.year}-${p.month}-${p.day}`, mins: h * 60 + mi };
}

function tzOffset(ms, tz) {
  const z = zoned(ms, tz);
  return Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s) - Math.floor(ms / 1000) * 1000;
}

/** tz の現地時刻 → エポックミリ秒 */
export function zonedToEpoch(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - tzOffset(guess, tz);
  const off2 = tzOffset(t, tz);
  t = guess - off2;
  return t;
}

/** 'YYYY-MM-DD' に n 日足す */
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/* ---------- 営業日判定 ---------- */

export function jpHolidayName(date) {
  if (JP_HOLIDAYS[date]) return JP_HOLIDAYS[date];
  const md = date.slice(5);
  if (md === '12-31' || md === '01-02' || md === '01-03') return '年末年始休業';
  return null;
}

function isWeekend(date) {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
}

export function isJpTradingDay(date) {
  return !isWeekend(date) && !jpHolidayName(date);
}
export function isUsTradingDay(date) {
  return !isWeekend(date) && !US_HOLIDAYS[date];
}
export function isUkTradingDay(date) {
  return !isWeekend(date) && !UK_HOLIDAYS[date];
}

export function nextJpTradingDay(date) {
  let d = addDays(date, 1);
  for (let i = 0; i < 15 && !isJpTradingDay(d); i++) d = addDays(d, 1);
  return d;
}

export function prevJpTradingDay(date) {
  let d = addDays(date, -1);
  for (let i = 0; i < 15 && !isJpTradingDay(d); i++) d = addDays(d, -1);
  return d;
}

export function holidayDataStale(now = Date.now()) {
  return zoned(now, 'Asia/Tokyo').date > COVERAGE_UNTIL;
}

/* ---------- 市場定義 ---------- */
// sessions: [開始分, 終了分, ラベル]。終了が開始より小さい場合は翌日にまたがる

export const MARKETS = {
  tse: {
    name: '東京', tz: 'Asia/Tokyo', tradingDay: isJpTradingDay, holidayName: jpHolidayName,
    sessions: [[540, 690, '前場'], [750, 930, '後場']],
    breakLabel: '昼休み',
  },
  ose: {
    name: '先物', tz: 'Asia/Tokyo', tradingDay: isJpTradingDay, holidayName: jpHolidayName,
    sessions: [[525, 945, '日中'], [1020, 360, '夜間']],
    breakLabel: '休憩',
  },
  lse: {
    name: 'ロンドン', tz: 'Europe/London', tradingDay: isUkTradingDay, holidayName: (d) => UK_HOLIDAYS[d] || null,
    sessions: [[480, 990, '']],
  },
  nyse: {
    name: 'NY', tz: 'America/New_York', tradingDay: isUsTradingDay, holidayName: (d) => US_HOLIDAYS[d] || null,
    sessions: [[570, 960, '']],
    earlyClose: US_EARLY_CLOSE,
  },
  hkex: {
    name: '香港', tz: 'Asia/Hong_Kong', tradingDay: (d) => !isWeekend(d), holidayName: () => null,
    sessions: [[570, 720, ''], [780, 960, '']],
  },
  xetra: {
    name: 'フランクフルト', tz: 'Europe/Berlin', tradingDay: (d) => !isWeekend(d), holidayName: () => null,
    sessions: [[540, 1050, '']],
  },
  sse: {
    name: '上海', tz: 'Asia/Shanghai', tradingDay: (d) => !isWeekend(d), holidayName: () => null,
    sessions: [[570, 690, ''], [780, 900, '']],
  },
};

function sessionsFor(mkt, date) {
  const early = mkt.earlyClose?.[date];
  return mkt.sessions.map(([s, e, l]) => [s, early != null && e > s ? Math.min(e, early) : e, l]);
}

/**
 * 市場の状態
 * @returns {{status:'open'|'break'|'closed'|'holiday', label:string, session:string, holiday?:string, nextChange:number|null}}
 */
export function marketState(id, now = Date.now()) {
  const mkt = MARKETS[id];
  const z = zoned(now, mkt.tz);
  const today = z.date;
  const yesterday = addDays(today, -1);

  // 日をまたぐセッション（前日開始分）を先に判定
  for (const [s, e, l] of sessionsFor(mkt, yesterday)) {
    if (e < s && mkt.tradingDay(yesterday) && z.mins < e) {
      return { status: 'open', label: l || '取引中', session: l, nextChange: zonedToEpoch(z.y, z.mo, z.d, Math.floor(e / 60), e % 60, mkt.tz) };
    }
  }

  const trading = mkt.tradingDay(today);
  if (trading) {
    const ss = sessionsFor(mkt, today);
    for (let i = 0; i < ss.length; i++) {
      const [s, e, l] = ss[i];
      const end = e < s ? 1440 + e : e;
      if (z.mins >= s && z.mins < end) {
        const endMs = e < s
          ? zonedToEpoch(z.y, z.mo, z.d, 0, 0, mkt.tz) + (1440 + e) * 60000
          : zonedToEpoch(z.y, z.mo, z.d, Math.floor(e / 60), e % 60, mkt.tz);
        return { status: 'open', label: l ? `${l}` : '取引中', session: l, nextChange: endMs };
      }
      const next = ss[i + 1];
      if (next && z.mins >= end && z.mins < next[0]) {
        return { status: 'break', label: mkt.breakLabel || '休憩', session: '', nextChange: zonedToEpoch(z.y, z.mo, z.d, Math.floor(next[0] / 60), next[0] % 60, mkt.tz) };
      }
    }
  }

  const nextOpen = nextOpenTime(mkt, now);
  if (!trading) {
    const hn = isWeekend(today) ? null : mkt.holidayName(today);
    if (hn) return { status: 'holiday', label: '休場', holiday: hn, session: '', nextChange: nextOpen };
  }
  return { status: 'closed', label: '閉場', session: '', nextChange: nextOpen };
}

function nextOpenTime(mkt, now) {
  const z = zoned(now, mkt.tz);
  let date = z.date;
  for (let i = 0; i < 15; i++) {
    if (mkt.tradingDay(date)) {
      const [y, mo, d] = date.split('-').map(Number);
      for (const [s] of sessionsFor(mkt, date)) {
        const t = zonedToEpoch(y, mo, d, Math.floor(s / 60), s % 60, mkt.tz);
        if (t > now) return t;
      }
    }
    date = addDays(date, 1);
  }
  return null;
}

/* ---------- シンボルの属する市場 ---------- */

export function marketOfSymbol(sym) {
  if (!sym) return 'always';
  if (sym === 'JGB10Y') return 'tse';
  if (/\.T$/.test(sym) || sym === '^N225') return 'tse';
  if (sym === 'NIY=F' || /=F$/.test(sym)) return 'futures';
  if (/=X$/.test(sym)) return 'fx';
  if (/-(JPY|USD)$/.test(sym)) return 'crypto';
  if (sym === '^HSI') return 'hkex';
  if (sym === '000001.SS') return 'sse';
  if (sym === '^GDAXI') return 'xetra';
  return 'nyse'; // ^DJI, ^GSPC, 米国株など
}

/** そのシンボルが現在取引されているか（更新頻度の判定用） */
export function isSymbolLive(sym, now = Date.now()) {
  const m = marketOfSymbol(sym);
  if (m === 'crypto') return true;
  if (m === 'fx' || m === 'futures') {
    // 為替・先物: 日本時間 月曜 7:00 〜 土曜 7:00 をおおよその取引時間とする
    const z = zoned(now, 'Asia/Tokyo');
    if (z.wd === 0) return false;
    if (z.wd === 6) return z.mins < 420;
    if (z.wd === 1) return z.mins >= 420;
    return true;
  }
  if (m === 'always') return true;
  return marketState(m, now).status === 'open';
}

/** 主要市場（東京・ロンドン・NY）のいずれかが開いているか */
export function anyMajorOpen(now = Date.now()) {
  return ['tse', 'ose', 'lse', 'nyse'].some((id) => marketState(id, now).status === 'open');
}

/* ---------- SQ 日 ---------- */

/** その月の SQ 日（第 2 金曜。休業日なら前営業日） */
export function sqDate(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstFri = 1 + ((5 - first + 7) % 7);
  let d = `${year}-${String(month).padStart(2, '0')}-${String(firstFri + 7).padStart(2, '0')}`;
  if (!isJpTradingDay(d)) d = prevJpTradingDay(d);
  return d;
}

export function isMajorSqMonth(month) {
  return month % 3 === 0;
}

/** from から days 日間の SQ 日 */
export function sqEvents(fromDate, days) {
  const out = [];
  const [y, m] = fromDate.split('-').map(Number);
  for (let i = 0; i < 3; i++) {
    const mm = ((m - 1 + i) % 12) + 1;
    const yy = y + Math.floor((m - 1 + i) / 12);
    const d = sqDate(yy, mm);
    if (d >= fromDate && d <= addDays(fromDate, days)) {
      out.push({ date: d, time: '', region: 'JP', title: isMajorSqMonth(mm) ? 'メジャーSQ（先物・オプション）' : 'SQ（オプション）', importance: isMajorSqMonth(mm) ? 2 : 1 });
    }
  }
  return out;
}
