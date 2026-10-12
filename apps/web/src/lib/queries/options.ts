import type {
  ManualMarkResponse,
  NeedsActionResponse,
  OptionHistoryResponse,
  OptionIncome,
  OptionPositionsResponse,
  ResolveNeedsActionRequest,
  RollOptionRequest,
  RollResponse,
} from '@tickrs/shared';
import { useQuery } from '@tanstack/react-query';
import { api, type KnownContractTerms, type Transaction, withQuery } from '../api.js';
import { keys, seg } from './keys.js';

export const useOptionPositions = (accountId?: string) =>
  useQuery({
    queryKey: keys.optionPositions(accountId),
    queryFn: () => api.get<OptionPositionsResponse>(withQuery('/options/positions', { accountId })),
  });

export const useNeedsAction = () =>
  useQuery({
    queryKey: keys.needsAction,
    queryFn: () => api.get<NeedsActionResponse>('/options/needs-action'),
  });

export const useOptionIncome = () =>
  useQuery({ queryKey: keys.optionIncome, queryFn: () => api.get<OptionIncome>('/options/income') });

export const useOptionHistory = (enabled = true) =>
  useQuery({
    queryKey: keys.optionHistory,
    enabled,
    queryFn: () => api.get<OptionHistoryResponse>('/options/positions?status=closed'),
  });

export const deleteOptionPosition = (contractId: string, confirmed: boolean) =>
  api.delete<void>(`/options/positions/${seg(contractId)}${confirmed ? '?confirm=true' : ''}`);
export const resolveNeedsAction = (items: ResolveNeedsActionRequest['items']) =>
  api.post<{ items: Transaction[] }>('/options/needs-action/resolve', { items });
export const setManualMark = (contractId: string, mark: string) =>
  api.put<ManualMarkResponse>(`/options/contracts/${seg(contractId)}/mark`, { mark });
export const clearManualMark = (contractId: string) =>
  api.delete<void>(`/options/contracts/${seg(contractId)}/mark`);
export const lookupContractTerms = (params: Record<string, string | undefined>) =>
  api.get<KnownContractTerms>(withQuery('/options/contracts/terms', params));

export interface RollPreview {
  netPremium: string;
  fees: [string, string];
}
export const previewRoll = (body: Omit<RollOptionRequest, 'dryRun'>) =>
  api.post<RollPreview>('/options/rolls', { ...body, dryRun: true });
export const rollOption = (body: Omit<RollOptionRequest, 'dryRun'>) =>
  api.post<RollResponse>('/options/rolls', body);
