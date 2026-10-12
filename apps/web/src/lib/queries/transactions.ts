import type { CreateTransactionRequest, FeeQuoteRequest, UpdateTransactionRequest } from '@tickrs/shared';
import { useQuery } from '@tanstack/react-query';
import { api, type FeeBreakdown, type Paged, type Transaction, withQuery } from '../api.js';
import { keys, seg } from './keys.js';

export const useTransactions = (query: string) =>
  useQuery({
    queryKey: keys.transactions(query),
    queryFn: () => api.get<Paged<Transaction>>(`/transactions?${query}`),
  });

export const quoteFee = (body: FeeQuoteRequest) => api.post<FeeBreakdown>('/fees/quote', body);

export const getTransaction = (id: string) => api.get<Transaction>(`/transactions/${seg(id)}`);
export const listTransactions = (params: Record<string, string | undefined>) =>
  api.get<Paged<Transaction>>(withQuery('/transactions', params));
export const createTransaction = (body: CreateTransactionRequest) =>
  api.post<{ items: Transaction[] }>('/transactions', body);
export const updateTransaction = (id: string, body: UpdateTransactionRequest) =>
  api.patch<{ items: Transaction[] }>(`/transactions/${seg(id)}`, body);
export const deleteTransaction = (id: string, confirmed: boolean) =>
  api.delete<void>(`/transactions/${seg(id)}${confirmed ? '?confirm=true' : ''}`);
