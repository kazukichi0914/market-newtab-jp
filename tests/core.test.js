import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { marketState, isJpTradingDay, sqDate, zonedToEpoch, marketOfSymbol, isSymbolLive, addDays } from '../src/core/market-calendar.js';
import { normalizeSymbol, searchLocal, displayName } from '../src/core/symbols.js';
import { fmt, signed, autoDigits, ago, esc } from '../src/core/format.js';
import { migrateV1, mergeSettings } from '../src/core/storage.js';
import { evaluate, groupBy } from '../src/core/portfolio.js';
import { parseChart, downsample } from '../src/data/providers/yahoo.js';
import { parseJgbCsv, parseWareki } from '../src/data/providers/mof.js';
import { parseRss, isAllowedLink } from '../src/data/news.js';
import { computeDelaySec, computeDerived, collectTargets } from '../src/data/scheduler.js';
import { upcomingEvents } from '../src/ui/calendar.js';

const jst = (y, mo, d, h, mi) => zonedToEpoch(y, mo, d, h, mi, 'Asia/Tokyo');
const nyt = (y, mo, d, h, mi) => zonedToEpoch(y, mo, d, h, mi, 'America/New_York');
const fixture = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

/* ---------- 市場カレンダー ---------- */

test('東証: 前場・昼休み・後場・閉場の境界', () => {
  const d = [2026, 11, 20]; // 金曜
  assert.equal(marketState('tse', jst(...d, 8, 59)).status, 'closed');
  assert.equal(marketState('tse', jst(...d, 9, 0)).session, '前場');
  assert.equal(marketState('tse', jst(...d, 11, 29)).status, 'open');
  assert.equal(marketState('tse', jst(...d, 11, 30)).status, 'break');
  assert.equal(marketState('tse', jst(...d, 12, 30)).session, '後場');
  assert.equal(marketState('tse', jst(...d, 15, 29)).status, 'open');
  assert.equal(marketState('tse', jst(...d, 15, 30)).status, 'closed');
});

test('東証: 祝日・振替休日・年末年始・土日', () => {
  const s = marketState('tse', jst(2026, 11, 23, 10, 0));
  assert.equal(s.status, 'holiday');
  assert.equal(s.holiday, '勤労感謝の日');
  assert.equal(isJpTradingDay('2026-05-06'), false); // 振替休日
  assert.equal(isJpTradingDay('2026-09-22'), false); // 国民の休日
  assert.equal(isJpTradingDay('2026-12-31'), false);
  assert.equal(isJpTradingDay('2027-01-04'), true); // 大発会
  assert.equal(marketState('tse', jst(2026, 11, 21, 10, 0)).status, 'closed'); // 土曜は休場表示にしない
  assert.equal(isJpTradingDay('2026-11-24'), true);
});

test('東証: 次の開場時刻（祝日の連休明け）', () => {
  const s = marketState('tse', jst(2026, 11, 20, 16, 0));
  assert.equal(s.nextChange, jst(2026, 11, 24, 9, 0)); // 土日＋勤労感謝の日の翌火曜
});

test('先物: 夜間取引は日付をまたぐ', () => {
  assert.equal(marketState('ose', jst(2026, 11, 19, 23, 0)).session, '夜間');
  assert.equal(marketState('ose', jst(2026, 11, 20, 3, 0)).session, '夜間');
  assert.equal(marketState('ose', jst(2026, 11, 20, 6, 0)).status, 'closed');
  assert.equal(marketState('ose', jst(2026, 11, 20, 16, 0)).status, 'break');
  assert.equal(marketState('ose', jst(2026, 11, 20, 9, 0)).session, '日中');
});

test('NY: 夏時間の切替と祝日・短縮取引', () => {
  assert.equal(marketState('nyse', nyt(2026, 3, 9, 9, 30)).status, 'open'); // 夏時間開始直後の月曜
  assert.equal(marketState('nyse', nyt(2026, 11, 2, 9, 30)).status, 'open'); // 標準時に戻った月曜
  assert.equal(marketState('nyse', nyt(2026, 11, 26, 10, 0)).status, 'holiday');
  assert.equal(marketState('nyse', nyt(2026, 11, 27, 12, 59)).status, 'open');
  assert.equal(marketState('nyse', nyt(2026, 11, 27, 13, 0)).status, 'closed');
});

test('SQ 日: 第2金曜、休業日なら前営業日', () => {
  assert.equal(sqDate(2026, 12), '2026-12-11');
  assert.equal(sqDate(2026, 11), '2026-11-13');
  assert.equal(sqDate(2027, 1), '2027-01-08');
});

test('シンボルの市場分類と取引中判定', () => {
  assert.equal(marketOfSymbol('7203.T'), 'tse');
  assert.equal(marketOfSymbol('JPY=X'), 'fx');
  assert.equal(marketOfSymbol('BTC-JPY'), 'crypto');
  assert.equal(marketOfSymbol('^GSPC'), 'nyse');
  assert.equal(isSymbolLive('JPY=X', jst(2026, 11, 22, 12, 0)), false); // 日曜
  assert.equal(isSymbolLive('BTC-JPY', jst(2026, 11, 22, 12, 0)), true);
  assert.equal(isSymbolLive('7203.T', jst(2026, 11, 20, 10, 0)), true);
});

test('addDays は月・年をまたぐ', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
});

/* ---------- シンボル・書式 ---------- */

test('normalizeSymbol', () => {
  assert.equal(normalizeSymbol('7203'), '7203.T');
  assert.equal(normalizeSymbol('７２０３'), '7203.T');
  assert.equal(normalizeSymbol('285a'), '285A.T');
  assert.equal(normalizeSymbol(' aapl '), 'AAPL');
  assert.equal(normalizeSymbol('^n225'), '^N225');
  assert.equal(normalizeSymbol(''), null);
  assert.equal(normalizeSymbol('<script>'), null);
});

test('searchLocal: コード・名前・読み', () => {
  assert.equal(searchLocal('7203')[0].sym, '7203.T');
  assert.equal(searchLocal('トヨタ')[0].sym, '7203.T');
  assert.equal(searchLocal('にんてんどう')[0].sym, '7974.T');
  assert.equal(searchLocal('ｿﾆｰ')[0].sym, '6758.T');
  assert.equal(displayName('9999.T', { name: 'FOO' }), 'FOO');
});

test('書式', () => {
  assert.equal(fmt(1234.5, 1), '1,234.5');
  assert.equal(fmt(null), '—');
  assert.equal(signed(-1.5), '−1.50');
  assert.equal(signed(0), '±0.00');
  assert.equal(autoDigits(39500), 0);
  assert.equal(ago(Date.now() - 40_000), '40秒前');
  assert.equal(esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
});

/* ---------- ストレージ移行 ---------- */

test('v1 の保存形式から v2 へ移行', () => {
  const { settings, watchlists } = migrateV1({ range: '5d', colorMode: 'us', interval: 300, watch: ['7203.T', '6758.T'], newsSrc: 'yahoo' });
  assert.equal(settings.range, '5d');
  assert.equal(settings.colorMode, 'us');
  assert.equal(settings.interval, 300);
  assert.equal(settings.newsSrc, 'yahoo');
  assert.deepEqual(watchlists, [{ id: 'main', name: 'ウォッチ', syms: ['7203.T', '6758.T'] }]);
  assert.equal(settings.panels.length, 8);
});

test('mergeSettings: 不正な期間と未知のパネルを補正', () => {
  const s = mergeSettings({ range: '10y', panels: [{ id: 'news', visible: false }, { id: 'gone', visible: true }] });
  assert.equal(s.range, '1d');
  assert.equal(s.panels[0].id, 'news');
  assert.equal(s.panels[0].visible, false);
  assert.ok(!s.panels.some((p) => p.id === 'gone'));
  assert.equal(s.panels.length, 8);
});

/* ---------- ポートフォリオ ---------- */

test('ポートフォリオ評価: 円建て・外貨建て・価格欠損', () => {
  const quotes = {
    '7203.T': { price: 3000, prev: 2900, currency: 'JPY' },
    AAPL: { price: 200, prev: 190, currency: 'USD' },
    'JPY=X': { price: 150 },
  };
  const { rows, total } = evaluate([
    { sym: '7203.T', qty: 100, cost: 2500, account: 'nisa_g' },
    { sym: 'AAPL', qty: 10, cost: 150, account: 'tokutei' },
    { sym: '9999.T', qty: 100, cost: 1000, account: 'tokutei' },
  ], (s) => quotes[s]);
  assert.equal(rows[0].value, 300000);
  assert.equal(rows[0].pl, 50000);
  assert.equal(rows[1].value, 300000); // 200 * 10 * 150
  assert.equal(rows[1].pl, 75000);
  assert.equal(total.value, 600000);
  assert.equal(total.day, 10000 + 15000);
  assert.equal(total.missing, 1);
  assert.deepEqual(groupBy(rows, (r) => r.account).map((g) => g.key), ['nisa_g', 'tokutei']);
});

/* ---------- データ解析 ---------- */

test('Yahoo chart: 実レスポンスの解析', () => {
  const q = parseChart(JSON.parse(fixture('chart-n225-1d.json')), '^N225', '1d');
  assert.equal(typeof q.price, 'number');
  assert.equal(typeof q.prev, 'number');
  assert.ok(Math.abs(q.chg - (q.price - q.prev)) < 1e-9);
  const t = parseChart(JSON.parse(fixture('chart-7203-1mo.json')), '7203.T', '1mo');
  assert.ok(t.pts.length >= 10);
  assert.equal(t.currency, 'JPY');
  assert.ok(t.rangeBase > 0);
});

test('Yahoo chart: 前日終値の補完順', () => {
  const mk = (meta, closes = [], ts = []) => ({ chart: { result: [{ meta, timestamp: ts, indicators: { quote: [{ close: closes }] } }] } });
  assert.equal(parseChart(mk({ regularMarketPrice: 110, previousClose: 100 }), 'X', '1mo').prev, 100);
  assert.equal(parseChart(mk({ regularMarketPrice: 110, chartPreviousClose: 90 }), 'X', '1d').prev, 90);
  assert.equal(parseChart(mk({ regularMarketPrice: 110, fulldayChange: 10 }), 'X', '1mo').prev, 100);
  assert.equal(parseChart(mk({ regularMarketPrice: 110 }, [100, 105, 110], [1, 2, 3]), 'X', '1mo').prev, 105);
  assert.equal(parseChart(mk({ regularMarketPrice: 110 }), 'X', '5d').prev, null);
});

test('Yahoo chart: 存在しない銘柄・形式変化はエラー', () => {
  assert.throws(() => parseChart(JSON.parse(fixture('chart-notfound.json')), 'ZZZZ.T', '1d'));
  assert.throws(() => parseChart({ foo: 1 }, 'X', '1d'));
});

test('downsample は最初と最後を残す', () => {
  const pts = Array.from({ length: 1000 }, (_, i) => [i, i]);
  const d = downsample(pts, 120);
  assert.equal(d.length, 120);
  assert.deepEqual(d[0], [0, 0]);
  assert.deepEqual(d.at(-1), [999, 999]);
});

test('財務省CSV: 和暦の解析と欠損値', () => {
  assert.equal(new Date(parseWareki('R8.11.2') * 1000).toISOString(), '2026-11-02T06:00:00.000Z');
  assert.equal(new Date(parseWareki('H31.4.26') * 1000).toISOString().slice(0, 10), '2019-04-26');
  const csv = '国債金利情報,,\r\n基準日,1年,10年\r\nS49.9.24,10.3,-\r\nR8.11.2,1.6,2.817\r\nR8.11.4,1.7,2.855\r\n';
  const pts = parseJgbCsv(csv);
  assert.equal(pts.length, 2);
  assert.equal(pts[1][1], 2.855);
  assert.throws(() => parseJgbCsv('foo,bar'));
});

test('RSS: 実フィードの解析とリンク検証', () => {
  const items = parseRss(fixture('nhk.xml'), ['www3.nhk.or.jp']);
  assert.ok(items.length >= 1);
  assert.ok(items[0].title.length > 0);
  assert.ok(items[0].link.startsWith('http'));
  const xml = '<rss><item><title><![CDATA[A &amp; B]]></title><link>javascript:alert(1)</link></item><item><title>T&#12354;</title><link>https://evil.example/x</link></item><item><title>OK</title><link>https://www3.nhk.or.jp/a</link><pubDate>Fri, 20 Nov 2026 09:00:00 +0900</pubDate></item></rss>';
  const r = parseRss(xml, ['www3.nhk.or.jp']);
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'OK');
  assert.equal(new Date(r[0].date).toISOString(), '2026-11-20T00:00:00.000Z');
  assert.equal(isAllowedLink('javascript:alert(1)', null), false);
});

/* ---------- スケジューラ ---------- */

test('更新間隔: 市場時間中・時間外・停止・アイドル', () => {
  const s = { interval: 60, offhours: 900 };
  const open = jst(2026, 11, 20, 10, 0);
  const sunday = jst(2026, 11, 22, 12, 0);
  assert.equal(computeDelaySec(s, open, open), 60);
  assert.equal(computeDelaySec(s, sunday, sunday), 900);
  assert.equal(computeDelaySec({ interval: 0, offhours: 900 }, open, open), 0);
  assert.equal(computeDelaySec({ interval: 60, offhours: 0 }, sunday, sunday), 0);
  assert.equal(computeDelaySec(s, open, open - 3600_000), 1800);
  assert.equal(computeDelaySec({ interval: 10, offhours: 900 }, open, open), 30);
});

test('金の円換算（派生値）', () => {
  const q = computeDerived({
    gold: { price: 3110.35, prev: 3000, rangeBase: 3000, pts: [[1, 3000]], fetchedAt: 5 },
    usdjpy: { price: 150, prev: 150, fetchedAt: 6 },
  });
  assert.ok(Math.abs(q.goldjpy.price - 15000) < 1e-6);
  assert.ok(q.goldjpy.chg > 0);
});

test('取得対象: パネル・ウォッチ・保有の重複は1つにまとまる', () => {
  const t = collectTargets([{ syms: ['7203.T', 'AAPL'] }, { syms: ['7203.T'] }], [{ sym: 'AAPL' }]);
  assert.ok(t.has('n225'));
  assert.ok(t.has('7203.T'));
  assert.equal([...t.keys()].filter((k) => k === 'AAPL').length, 1);
  assert.ok(!t.has('goldjpy')); // 派生値は取得しない
});

/* ---------- カレンダー ---------- */

test('今後7日間の予定: 祝日・SQ・イベント', () => {
  const ev = upcomingEvents('2026-11-20', 7);
  assert.ok(ev.some((e) => e.title.includes('勤労感謝の日')));
  assert.ok(ev.some((e) => e.title.includes('感謝祭')));
  const dec = upcomingEvents('2026-12-07', 7);
  assert.ok(dec.some((e) => e.title.includes('SQ') && e.date === '2026-12-11'));
  assert.ok(dec.some((e) => e.title.includes('FOMC')));
});
