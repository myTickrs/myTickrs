import type { LedgerTxn } from './types.js';

export function orderLedger<T extends LedgerTxn>(txns: readonly T[]): T[] {
  const byId = new Map(txns.map((t) => [t.id, t]));
  const isGeneratedChild = (t: T) =>
    t.isSystemGenerated === true && t.linkedTxnId != null && byId.has(t.linkedTxnId);

  const parents = txns
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => !isGeneratedChild(t))
    .toSorted((a, b) =>
      a.t.tradeDate < b.t.tradeDate ? -1 : a.t.tradeDate > b.t.tradeDate ? 1 : a.index - b.index,
    );

  const children = new Map<string, T[]>();
  for (const t of txns) {
    if (isGeneratedChild(t)) {
      const list = children.get(t.linkedTxnId!) ?? [];
      list.push(t);
      children.set(t.linkedTxnId!, list);
    }
  }

  const out: T[] = [];
  for (const { t } of parents) {
    out.push(t);
    for (const child of children.get(t.id) ?? []) out.push(child);
  }
  return out;
}
