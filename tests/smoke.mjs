// 実際のデータ取得元に接続して、形式が想定どおりかを確認する（手動実行: npm run smoke）
import { allPanelItems, NEWS_FEEDS } from '../src/core/config.js';
import { yahoo } from '../src/data/providers/yahoo.js';
import { mof } from '../src/data/providers/mof.js';
import { fetchNews } from '../src/data/news.js';

const P = { yahoo, mof };
let ng = 0;

for (const it of allPanelItems()) {
  if (!it.src) continue;
  const [pid, sym] = it.src[0];
  try {
    const q = await P[pid].fetchQuote(sym, '1d');
    const ok = q.price != null && q.prev != null;
    if (!ok) ng++;
    console.log(`${ok ? 'OK ' : 'NG '} ${it.n.padEnd(14)} ${sym.padEnd(10)} price=${q.price} prev=${q.prev} pct=${q.pct?.toFixed(2)} pts=${q.pts.length}`);
  } catch (e) {
    ng++;
    console.log(`ERR ${it.n} ${sym}: ${e.message}`);
  }
}

for (const range of ['5d', '1y', '5y']) {
  try {
    const q = await yahoo.fetchQuote('7203.T', range);
    console.log(`OK  7203.T ${range} pts=${q.pts.length} rangePct=${q.rangePct?.toFixed(2)}`);
  } catch (e) { ng++; console.log(`ERR 7203.T ${range}: ${e.message}`); }
}

try {
  const r = await yahoo.search('toyota');
  console.log(`OK  search toyota → ${r.slice(0, 3).map((x) => x.sym).join(', ')}`);
} catch (e) { ng++; console.log(`ERR search: ${e.message}`); }

for (const src of Object.keys(NEWS_FEEDS)) {
  try {
    const items = await fetchNews(src);
    const newest = Math.max(...items.map((x) => x.date || 0));
    console.log(`OK  news ${src} ${items.length}件 最新=${new Date(newest).toISOString()} 「${items[0].title}」`);
  } catch (e) { ng++; console.log(`ERR news ${src}: ${e.message}`); }
}

console.log(ng ? `\n${ng} 件の問題があります` : '\nすべて正常');
process.exitCode = ng ? 1 : 0;
