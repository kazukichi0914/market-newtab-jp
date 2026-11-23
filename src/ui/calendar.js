// 今日・今後 7 日間の予定（経済イベント・SQ・休場日）
import { EVENTS, EVENTS_UPDATED } from '../static/events.js';
import { US_HOLIDAYS } from '../static/holidays.js';
import { zoned, addDays, sqEvents, jpHolidayName, holidayDataStale } from '../core/market-calendar.js';
import { esc } from '../core/format.js';

export const calendarTemplate = `
  <div class="panel-head"><h2 id="h-calendar">今日の予定</h2><span class="hint" id="calHint"></span></div>
  <div id="calendar" class="calendar"></div>`;

const DAYS = 7;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const REGION = { JP: '🇯🇵', US: '🇺🇸' };

/** 期間内のイベント一覧（純粋関数） */
export function upcomingEvents(today, days = DAYS) {
  const end = addDays(today, days);
  const list = EVENTS.filter((e) => e.date >= today && e.date <= end);
  list.push(...sqEvents(today, days));
  for (let d = today; d <= end; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    const jp = wd !== 0 && wd !== 6 ? jpHolidayName(d) : null; // 土日の祝日は表示しない
    if (jp) list.push({ date: d, time: '', region: 'JP', title: `東証休場（${jp}）`, importance: 2 });
    if (US_HOLIDAYS[d]) list.push({ date: d, time: '', region: 'US', title: `米国市場休場（${US_HOLIDAYS[d]}）`, importance: 2 });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'));
}

export function renderCalendar() {
  const today = zoned(Date.now(), 'Asia/Tokyo').date;
  const list = upcomingEvents(today);
  const byDate = new Map();
  for (const e of list) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const label = (d) => {
    const [, m, dd] = d.split('-').map(Number);
    const wd = WD[new Date(`${d}T00:00:00Z`).getUTCDay()];
    const rel = d === today ? '今日' : d === addDays(today, 1) ? '明日' : '';
    return `${rel ? `<b>${rel}</b> ` : ''}${m}/${dd}（${wd}）`;
  };
  document.getElementById('calendar').innerHTML = byDate.size
    ? [...byDate].map(([d, evs]) => `<div class="cal-day${d === today ? ' today' : ''}">
        <div class="cal-date">${label(d)}</div>
        <ul>${evs.map((e) => `<li class="imp${e.importance}"><span class="cal-time">${esc(e.time || '')}</span><span class="cal-flag" title="${e.region}">${REGION[e.region] || ''}</span>${esc(e.title)}</li>`).join('')}</ul>
      </div>`).join('')
    : '<p class="skeleton">今後7日間に登録済みの主要イベントはありません。</p>';
  const stale = holidayDataStale() ? '祝日データの更新が必要です。' : '';
  document.getElementById('calHint').textContent = `${stale}イベント情報 ${EVENTS_UPDATED} 時点`;
}
