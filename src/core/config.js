// 表示する指数・為替などの定義と既定値
// src: 取得元の優先リスト [providerId, symbol, options]。先頭から順に試す。

export const PANELS = {
  domestic: {
    title: '国内指数',
    kind: 'cards',
    items: [
      { id: 'n225', n: '日経平均株価', src: [['yahoo', '^N225']], d: 2 },
      { id: 'topix', n: 'TOPIX', src: [['yahoo', '1306.T', { proxy: 'TOPIX連動ETF（1306）の値' }]] },
      { id: 'nkf', n: '日経225先物', sub: 'CME・円建', src: [['yahoo', 'NIY=F']], d: 0 },
      { id: 'g250', n: '東証グロース250', src: [['yahoo', '2516.T', { proxy: 'グロース250連動ETF（2516）の値' }]] },
      { id: 'jpx400', n: 'JPX日経400', src: [['yahoo', '1591.T', { proxy: 'JPX日経400連動ETF（1591）の値' }]] },
      { id: 'reit', n: '東証REIT指数', src: [['yahoo', '1343.T', { proxy: '東証REIT指数連動ETF（1343）の値' }]] },
    ],
  },
  fx: {
    title: '為替',
    kind: 'rows',
    items: [
      { id: 'usdjpy', n: 'ドル / 円', sub: 'USD/JPY', src: [['yahoo', 'JPY=X']], d: 2, big: true },
      { id: 'eurjpy', n: 'ユーロ / 円', sub: 'EUR/JPY', src: [['yahoo', 'EURJPY=X']], d: 2 },
      { id: 'gbpjpy', n: 'ポンド / 円', sub: 'GBP/JPY', src: [['yahoo', 'GBPJPY=X']], d: 2 },
      { id: 'audjpy', n: '豪ドル / 円', sub: 'AUD/JPY', src: [['yahoo', 'AUDJPY=X']], d: 2 },
      { id: 'cnyjpy', n: '人民元 / 円', sub: 'CNY/JPY', src: [['yahoo', 'CNYJPY=X']], d: 3 },
      { id: 'eurusd', n: 'ユーロ / ドル', sub: 'EUR/USD', src: [['yahoo', 'EURUSD=X']], d: 4 },
    ],
  },
  global: {
    title: '海外指数',
    kind: 'cards',
    items: [
      { id: 'dji', n: 'NYダウ', src: [['yahoo', '^DJI']] },
      { id: 'spx', n: 'S&P 500', src: [['yahoo', '^GSPC']] },
      { id: 'ixic', n: 'NASDAQ総合', src: [['yahoo', '^IXIC']] },
      { id: 'sox', n: 'フィラデルフィア半導体', src: [['yahoo', '^SOX']] },
      { id: 'acwi', n: '全世界株（ACWI）', sub: 'オルカン参考', src: [['yahoo', 'ACWI', { proxy: 'iShares MSCI ACWI ETF（米ドル建）の値' }]] },
      { id: 'hsi', n: '香港ハンセン', src: [['yahoo', '^HSI']] },
      { id: 'sse', n: '上海総合', src: [['yahoo', '000001.SS']] },
      { id: 'dax', n: '独DAX', src: [['yahoo', '^GDAXI']] },
    ],
  },
  rates: {
    title: '金利・商品・暗号資産',
    kind: 'rows',
    items: [
      { id: 'jgb10', n: '日本10年国債利回り', sub: '財務省・日次（%）', src: [['mof', 'JGB10Y']], d: 3 },
      { id: 'ust10', n: '米10年債利回り', sub: 'US 10Y（%）', src: [['yahoo', '^TNX']], d: 3 },
      { id: 'vix', n: 'VIX 恐怖指数', sub: 'CBOE', src: [['yahoo', '^VIX']], d: 2 },
      { id: 'wti', n: 'WTI原油', sub: 'USD/バレル', src: [['yahoo', 'CL=F']], d: 2 },
      { id: 'gold', n: '金先物', sub: 'USD/トロイオンス', src: [['yahoo', 'GC=F']], d: 1 },
      { id: 'goldjpy', n: '金（円換算）', sub: '円/グラム・参考', derived: 'goldJpy', d: 0 },
      { id: 'btc', n: 'ビットコイン', sub: '円', src: [['yahoo', 'BTC-JPY']], d: 0 },
    ],
  },
};

// 画面上のパネル（表示/非表示・並べ替えの単位）
export const PANEL_LAYOUT = [
  { id: 'domestic', label: '国内指数', span: 2 },
  { id: 'fx', label: '為替', span: 1 },
  { id: 'global', label: '海外指数', span: 2 },
  { id: 'rates', label: '金利・商品・暗号資産', span: 1 },
  { id: 'watch', label: 'ウォッチリスト', span: 2 },
  { id: 'calendar', label: '今日の予定', span: 1 },
  { id: 'portfolio', label: 'ポートフォリオ', span: 2 },
  { id: 'news', label: '経済ニュース', span: 1 },
];

export const DEFAULT_WATCH = ['7203.T', '6758.T', '9984.T', '8306.T', '8035.T', '6861.T', '9983.T', '7974.T', '6501.T', '8058.T', '4063.T', '9432.T'];

export const RANGES = [
  { id: '1d', label: '1日', interval: '5m', minAgeSec: 0 },
  { id: '5d', label: '5日', interval: '30m', minAgeSec: 300 },
  { id: '1mo', label: '1ヶ月', interval: '1d', minAgeSec: 3600 },
  { id: '6mo', label: '6ヶ月', interval: '1d', minAgeSec: 3600 },
  { id: '1y', label: '1年', interval: '1d', minAgeSec: 3600 },
  { id: '5y', label: '5年', interval: '1wk', minAgeSec: 3600 },
];
export const RANGE_IDS = RANGES.map((r) => r.id);

export const NEWS_FEEDS = {
  yahoo: { label: 'Yahoo!', url: 'https://news.yahoo.co.jp/rss/topics/business.xml', hosts: ['news.yahoo.co.jp'] },
  nhk: { label: 'NHK', url: 'https://www3.nhk.or.jp/rss/news/cat5.xml', hosts: ['www3.nhk.or.jp', 'www.nhk.or.jp', 'news.web.nhk'] },
};
export const NEWS_STALE_DAYS = 3; // 最新記事がこれより古いフィードは「更新停止の可能性」と表示

export const SEARCH_ENGINES = {
  google: { label: 'Google', action: 'https://www.google.com/search', param: 'q' },
  bing: { label: 'Bing', action: 'https://www.bing.com/search', param: 'q' },
  yahoojp: { label: 'Yahoo! JAPAN', action: 'https://search.yahoo.co.jp/search', param: 'p' },
  ddg: { label: 'DuckDuckGo', action: 'https://duckduckgo.com/', param: 'q' },
};

export const ACCOUNTS = {
  tokutei: '特定',
  ippan: '一般',
  nisa_g: 'NISA成長',
  nisa_t: 'NISAつみたて',
};

export const LIMITS = { lists: 5, perList: 50, holdings: 100 };

export const DEFAULT_SETTINGS = {
  range: '1d',
  colorMode: 'jp', // jp: 上昇=赤 / us: 上昇=緑
  theme: 'auto', // auto | light | dark
  interval: 60, // 秒。0 = 自動更新しない
  offhours: 900, // 市場時間外の更新間隔（秒）。0 = しない
  density: 'normal', // normal | compact
  newsSrc: 'yahoo', // NHK の RSS は 2026-08 以降更新が止まっているため
  engine: 'google',
  hideAmounts: false,
  panels: PANEL_LAYOUT.map((p) => ({ id: p.id, visible: true })),
};

export const STALE_AFTER_MS = 60_000; // 新規タブ表示時、これより古ければ更新を依頼
export const NEWS_EVERY_MS = 10 * 60_000;
export const MAX_POINTS = 120;

// Yahoo!ファイナンス（日本版）の銘柄ページ
const JP_QUOTE_IDS = {
  '^N225': '998407.O', 'JPY=X': 'USDJPY=FX', 'EURJPY=X': 'EURJPY=FX', 'GBPJPY=X': 'GBPJPY=FX',
  'AUDJPY=X': 'AUDJPY=FX', 'CNYJPY=X': 'CNYJPY=FX', 'EURUSD=X': 'EURUSD=FX', '^DJI': '%5EDJI',
  '1306.T': '998405.T',
};

export function quoteUrl(sym) {
  if (!sym) return '#';
  if (sym === 'JGB10Y') return 'https://www.mof.go.jp/jgbs/reference/interest_rate/index.htm';
  if (JP_QUOTE_IDS[sym]) return `https://finance.yahoo.co.jp/quote/${JP_QUOTE_IDS[sym]}`;
  if (/\.T$/.test(sym)) return `https://finance.yahoo.co.jp/quote/${encodeURIComponent(sym)}`;
  return `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`;
}

export function allPanelItems() {
  return Object.values(PANELS).flatMap((p) => p.items);
}
