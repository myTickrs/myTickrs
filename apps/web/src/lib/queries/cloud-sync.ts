import type { CloudSyncSession, CloudSyncSettings, StartCloudSyncInput, SyncDirection } from '@tickrs/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { keys } from './keys.js';

export const useCloudSyncSettings = () =>
  useQuery({
    queryKey: keys.cloudSync,
    queryFn: () => api.get<CloudSyncSettings>('/cloud-sync'),
    staleTime: Infinity,
  });

export const useStartCloudSync = () =>
  useMutation({
    mutationFn: (input: StartCloudSyncInput) => api.post<CloudSyncSession>('/cloud-sync/sessions', input),
  });

export const useCloudSyncSession = (id: string | undefined) =>
  useQuery({
    enabled: Boolean(id),
    queryKey: keys.cloudSyncSession(id),
    queryFn: () => api.get<CloudSyncSession>(`/cloud-sync/sessions/${id}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || status === 'awaiting-sign-in' || status === 'comparing' || status === 'running'
        ? 2000
        : false;
    },
  });

export const useConfirmCloudSync = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: SyncDirection }) =>
      api.post<CloudSyncSession>(`/cloud-sync/sessions/${id}/confirm`, { direction }),
    onSuccess: (session) => client.setQueryData(keys.cloudSyncSession(session.id), session),
  });
};

export const useCancelCloudSync = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/cloud-sync/sessions/${id}`),
    onSuccess: (_data, id) => client.invalidateQueries({ queryKey: keys.cloudSyncSession(id) }),
  });
};
