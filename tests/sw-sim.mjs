// Service Worker（background.js）を Node 上で疑似的に動かす結合テスト（実際に通信する）
// 実行: npm run sim
// chrome.* API を最小限のフェイクで置き換え、インストール → 取得 → 保存 → メッセージ応答を確認する。

const listeners = { installed: [], startup: [], alarm: [], message: [], changed: [] };
const mkArea = (name) => {
  const data = {};
  return {
    data,
    async get(keys) {
      const out = {};
      for (const k of [].concat(keys)) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: data[k], newValue: v }; data[k] = structuredClone(v); }
      for (const fn of listeners.changed) fn(changes, name);
    },
    async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
  };
};
const alarms = {};
globalThis.chrome = {
  storage: { local: mkArea('local'), sync: mkArea('sync'), session: mkArea('session'), onChanged: { addListener: (f) => listeners.changed.push(f) } },
  alarms: {
    async create(name, o) { alarms[name] = o; },
    async clear(name) { delete alarms[name]; },
    onAlarm: { addListener: (f) => listeners.alarm.push(f) },
  },
  runtime: {
    id: 'sim',
    onInstalled: { addListener: (f) => listeners.installed.push(f) },
    onStartup: { addListener: (f) => listeners.startup.push(f) },
    onMessage: { addListener: (f) => listeners.message.push(f) },
  },
};

const send = (msg) => new Promise((resolve) => { listeners.message[0](msg, {}, resolve); });
let fails = 0;
const check = (cond, label) => { console.log(`${cond ? 'OK ' : 'NG '} ${label}`); if (!cond) fails++; };

// v1 の保存データがある状態からの更新をシミュレート
await chrome.storage.sync.set({ range: '1d', colorMode: 'us', interval: 300, watch: ['7203.T', '6758.T', 'AAPL'], newsSrc: 'yahoo' });

await import('../background.js');
const t0 = Date.now();
await Promise.all(listeners.installed.map((f) => f({ reason: 'update' })));
console.log(`install + 初回取得: ${Date.now() - t0}ms`);

const sync = chrome.storage.sync.data;
const local = chrome.storage.local.data;
check(sync.schemaVersion === 2, 'スキーマが v2 に移行');
check(sync.settings?.colorMode === 'us' && sync.settings?.interval === 300, 'v1 の設定を引き継ぎ');
check(JSON.stringify(sync.watchlists?.[0]?.syms) === JSON.stringify(['7203.T', '6758.T', 'AAPL']), 'v1 のウォッチリストを引き継ぎ');
check(!('watch' in sync), 'v1 の旧キーを削除');

const snap = local['snap:1d'];
const n = Object.keys(snap?.quotes || {}).length;
check(n >= 30, `snap:1d に ${n} 件保存（エラー ${Object.keys(snap?.errors || {}).length} 件）`);
check(snap?.quotes?.n225?.price > 0, `日経平均 ${snap?.quotes?.n225?.price}`);
check(snap?.quotes?.jgb10?.price > 0, `日本10年債 ${snap?.quotes?.jgb10?.price}`);
check(snap?.quotes?.goldjpy?.price > 0, `金（円換算） ${Math.round(snap?.quotes?.goldjpy?.price)} 円/g`);
check(snap?.quotes?.topix?.proxy, 'TOPIX は代用値として表示');
check(local['news:yahoo']?.items?.length > 0, `ニュース ${local['news:yahoo']?.items?.length} 件`);
check(alarms['market-tick']?.delayInMinutes >= 0.5, `次回アラーム ${alarms['market-tick']?.delayInMinutes} 分後`);

// 直後のページからの更新依頼 → 取得済みなので通信は最小限
const t1 = Date.now();
const r = await send({ type: 'refresh', range: '1d', reason: 'page' });
check(r.ok, `ページからの更新依頼に応答（${Date.now() - t1}ms）`);

// 期間切替
const r2 = await send({ type: 'refresh', range: '1y', reason: 'page' });
check(r2.ok && Object.keys(local['snap:1y']?.quotes || {}).length >= 30, `1年の期間データ ${Object.keys(local['snap:1y']?.quotes || {}).length} 件`);

// 銘柄追加（存在する／しない）
const ok = await send({ type: 'addSymbol', sym: '7974.T', range: '1d' });
check(ok.ok && local['snap:1d'].quotes['7974.T']?.price > 0, `銘柄追加 7974.T → ${local['snap:1d'].quotes['7974.T']?.price}`);
const ng = await send({ type: 'addSymbol', sym: 'ZZZZ.T', range: '1d' });
check(!ng.ok, `存在しない銘柄は拒否（${ng.error}）`);

// 検索
const s = await send({ type: 'search', q: 'sony' });
check(s.ok && s.v.length > 0, `検索 sony → ${s.v?.slice(0, 3).map((x) => x.sym).join(', ')}`);

// 外貨建て保有 → 為替を追加取得
await chrome.storage.local.set({ portfolio: [{ sym: 'AAPL', qty: 10, cost: 150, account: 'tokutei' }] });
await send({ type: 'refresh', range: '1d', force: true, reason: 'manual' });
check(local['snap:1d'].quotes.AAPL?.currency === 'USD', 'AAPL は USD 建て');

console.log(fails ? `\n${fails} 件失敗` : '\nすべて正常');
process.exit(fails ? 1 : 0);
