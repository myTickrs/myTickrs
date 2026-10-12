import type { ChartRange as Range } from '@tickrs/shared';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export const keys = {
  markets: ['settings', 'markets'] as const,
  settings: ['settings'] as const,
  accounts: ['accounts'] as const,
  currencies: ['currencies'] as const,
  summary: (accountId?: string) => ['portfolio', 'summary', accountId ?? 'all'] as const,
  holdings: (accountId?: string) => ['portfolio', 'holdings', accountId ?? 'all'] as const,
  holdingsByAccount: ['portfolio', 'holdings-by-account'] as const,
  transactions: (query: string) => ['transactions', query] as const,
  optionPositions: (accountId?: string) => ['options', 'positions', accountId ?? 'all'] as const,
  needsAction: ['options', 'needs-action'] as const,
  optionIncome: ['options', 'income'] as const,
  optionHistory: ['options', 'history'] as const,
  providers: ['settings', 'providers'] as const,
  feeSchedule: (accountId: string) => ['fee-schedule', accountId] as const,
  securitySearch: (term: string) => ['securities', 'search', term] as const,
  capabilities: ['capabilities'] as const,
  performance: (query: string) => ['portfolio', 'performance', query] as const,
  stockChart: (symbol: string, range: Range) => ['stocks', symbol, 'chart', range] as const,
  positionOpenings: (contractId: string) => ['transactions', 'openings', contractId] as const,
  feeQuote: (accountId: string, type: string, quantity: string, price: string, symbol?: string) =>
    ['fee-quote', accountId, type, quantity, price, symbol ?? ''] as const,
  contractTerms: (...terms: string[]) => ['contract-terms', ...terms] as const,
  rollPreview: (body: object) => ['roll-preview', body] as const,
  cloudSync: ['cloud-sync'] as const,
  cloudSyncSession: (id: string | undefined) => ['cloud-sync', 'session', id] as const,
  importConfig: ['import', 'config'] as const,
};

export const seg = encodeURIComponent;

export const invalidateLedger = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: ['portfolio'] }),
    client.invalidateQueries({ queryKey: ['transactions'] }),
    client.invalidateQueries({ queryKey: ['options'] }),
    client.invalidateQueries({ queryKey: ['stocks'] }),
  ]);

export function useLedgerMutation<TVariables, TData>(fn: (vars: TVariables) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await invalidateLedger(client);
    },
  });
}

export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
