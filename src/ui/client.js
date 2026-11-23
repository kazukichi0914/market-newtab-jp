// 新規タブ → データ取得処理への窓口
// 拡張内: Service Worker にメッセージを送る / 拡張外（開発時）: 同じ処理をページ内で直接呼ぶ
import { hasChromeStorage, MOCK } from '../core/storage.js';

export const mockMode = MOCK;
export const isExtension = hasChromeStorage && typeof chrome.runtime?.sendMessage === 'function' && !!chrome.runtime.id;

let local = null;
async function localScheduler() {
  if (!local) {
    local = await import('../data/scheduler.js');
    local.setMockMode(mockMode);
  }
  return local;
}

async function send(type, msg = {}) {
  if (isExtension && !mockMode) {
    const res = await chrome.runtime.sendMessage({ type, ...msg });
    if (!res) throw new Error('バックグラウンド処理から応答がありません');
    if (!res.ok) throw new Error(res.error);
    return res.v;
  }
  const s = await localScheduler();
  switch (type) {
    case 'refresh': return s.refreshAll({ range: msg.range, force: msg.force, reason: msg.reason });
    case 'refreshRange': return s.refreshRange(msg.range, { force: msg.force });
    case 'refreshNews': return s.refreshNews(msg.src, msg.force);
    case 'addSymbol': return s.fetchOne(msg.sym, msg.range);
    case 'search': return s.searchRemote(msg.q);
    case 'opened': return true;
    default: throw new Error(`unknown ${type}`);
  }
}

export const client = {
  refresh: (range, { force = false, reason = 'page' } = {}) => send('refresh', { range, force, reason }),
  refreshNews: (src, force = false) => send('refreshNews', { src, force }),
  addSymbol: (sym, range) => send('addSymbol', { sym, range }),
  search: (q) => send('search', { q }),
  opened: () => send('opened'),
};
