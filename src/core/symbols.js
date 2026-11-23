// シンボルの正規化・表示名・ローカル検索
import { JP_SYMBOLS, INTL_NAMES } from '../static/symbols-jp.js';

const JP_MAP = new Map(JP_SYMBOLS.map(([c, n]) => [`${c}.T`, n]));

// 全角英数→半角、カタカナ→ひらがな、小文字化
export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase()
    .trim();
}

// 入力をシンボルに変換。不正なら null
export function normalizeSymbol(input) {
  const s = normalizeText(input).toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  if (/^[0-9][0-9A-Z]{3}$/.test(s)) return `${s}.T`; // 東証コード（285A 等も可）
  if (/^[0-9][0-9A-Z]{3}\.T$/.test(s)) return s;
  if (/^[\^A-Z0-9][A-Z0-9.=\-^]{0,19}$/.test(s)) return s;
  return null;
}

export function isJpStock(sym) {
  return /^[0-9][0-9A-Z]{3}\.T$/.test(sym);
}

export function codeOf(sym) {
  return sym.replace(/\.T$/, '');
}

export function displayName(sym, quote) {
  return JP_MAP.get(sym) || INTL_NAMES[sym] || quote?.name || codeOf(sym);
}

// ローカル辞書の検索（コード前方一致 → 名前・読みの前方一致 → 部分一致）
export function searchLocal(query, limit = 8) {
  const q = normalizeText(query);
  if (!q) return [];
  const scored = [];
  for (const [code, name, kana] of JP_SYMBOLS) {
    const n = normalizeText(name);
    let score = 0;
    if (code.toLowerCase().startsWith(q)) score = 4;
    else if (n.startsWith(q) || kana.startsWith(q)) score = 3;
    else if (n.includes(q) || kana.includes(q)) score = 2;
    if (score) scored.push({ score, sym: `${code}.T`, name, code });
  }
  for (const [sym, name] of Object.entries(INTL_NAMES)) {
    const n = normalizeText(name);
    if (sym.toLowerCase().startsWith(q) || n.startsWith(q)) scored.push({ score: 3, sym, name, code: sym });
    else if (n.includes(q)) scored.push({ score: 1, sym, name, code: sym });
  }
  scored.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return scored.slice(0, limit).map(({ sym, name, code }) => ({ sym, name, code }));
}
