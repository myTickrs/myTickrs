import type { FxRateRow } from '@tickrs/shared';
import type { Store, StoreTx } from './ports.js';

export function withRequestRates(store: Store, rows: readonly FxRateRow[]): Store {
  if (rows.length === 0) return store;
  const wrap = (tx: StoreTx): StoreTx => ({
    ...tx,
    fx: {
      ...tx.fx,
      listRates: async () => [
        ...(await tx.fx.listRates()),
        ...rows.map((r) => ({ ...r, source: 'browser' })),
      ],
    },
  });
  return {
    ...store,
    name: store.name,
    ping: () => store.ping(),
    scope: (principal) => wrap(store.scope(principal)),
    transaction: (principal, fn) => store.transaction(principal, (tx) => fn(wrap(tx))),
  };
}
