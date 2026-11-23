// ポートフォリオの評価額計算（参考値。税金・手数料は考慮しない）

/** 通貨 → 円換算レートのシンボル */
export function fxSymbolFor(currency) {
  if (!currency || currency === 'JPY') return null;
  if (currency === 'USD') return 'JPY=X';
  return `${currency}JPY=X`;
}

/**
 * @param {{sym:string, qty:number, cost:number, account:string}[]} holdings
 * @param {(sym:string)=>object|undefined} getQuote
 */
export function evaluate(holdings, getQuote) {
  const rows = [];
  let value = 0, costTotal = 0, day = 0, missing = 0;
  for (const h of holdings) {
    const q = getQuote(h.sym);
    const qty = Number(h.qty) || 0;
    const cost = Number(h.cost) || 0;
    // 英国株などペンス建て（GBp）はポンドに換算
    let currency = q?.currency || (/\.T$/.test(h.sym) ? 'JPY' : 'USD');
    let unit = 1;
    if (currency === 'GBp') { currency = 'GBP'; unit = 0.01; }
    const fxSym = fxSymbolFor(currency);
    const fx = fxSym ? getQuote(fxSym)?.price : 1;
    if (!q || q.price == null || fx == null) {
      missing++;
      rows.push({ ...h, quote: q, currency, value: null, pl: null, plPct: null, dayPl: null });
      continue;
    }
    const v = q.price * unit * qty * fx;
    const c = cost * unit * qty * fx;
    const d = q.prev != null ? (q.price - q.prev) * unit * qty * fx : 0;
    value += v; costTotal += c; day += d;
    rows.push({ ...h, quote: q, currency, value: v, pl: v - c, plPct: c ? ((v - c) / c) * 100 : null, dayPl: d });
  }
  return {
    rows,
    total: {
      value,
      cost: costTotal,
      pl: value - costTotal,
      plPct: costTotal ? ((value - costTotal) / costTotal) * 100 : null,
      day,
      dayPct: value - day ? (day / (value - day)) * 100 : null,
      missing,
    },
  };
}

/** キーごとに評価額を集計（構成比用） */
export function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    if (r.value == null) continue;
    const k = keyFn(r);
    m.set(k, (m.get(k) || 0) + r.value);
  }
  return [...m.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}
