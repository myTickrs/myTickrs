import type {
  CommitRequest,
  CommitResult,
  ExtractResponse,
  ImportConfig,
  ImportFile,
  Mapping,
  ReviewResponse,
  SourceRow,
} from '@tickrs/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { keys, useLedgerMutation } from './keys.js';

export const useImportConfig = (waitingForSignIn = false) =>
  useQuery({
    queryKey: keys.importConfig,
    queryFn: () => api.get<ImportConfig>('/import/config'),
    refetchInterval: waitingForSignIn ? 2000 : false,
    refetchIntervalInBackground: waitingForSignIn,
    refetchOnWindowFocus: waitingForSignIn ? 'always' : true,
  });

export const startImportSignIn = (provider: string) =>
  api.post<{ authorizeUrl: string }>('/import/ai/sign-in', { provider });

export const useImportSignOut = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/import/ai/sign-in'),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.importConfig }),
  });
};

export const extractImportFile = (body: {
  file: ImportFile;
  mapping?: Mapping;
  saveMapping?: boolean;
  readWithAi?: boolean;
  locale: string;
}) => api.importPost<ExtractResponse>('/import/extract', body);

export const reviewImport = (body: {
  accountId?: string;
  currency?: string;
  rows: SourceRow[];
  openingDate?: string;
}) => api.importPost<ReviewResponse>('/import/review', body);

export const checkImport = (body: CommitRequest) =>
  api.importPost<{ ok: true; rows: number }>('/import/check', body);

export const useCommitImport = () =>
  useLedgerMutation((body: CommitRequest) => api.importPost<CommitResult>('/import/commit', body));
