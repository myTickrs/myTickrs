import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Col, Dialog, Row, Text } from '@tickrs/ui';
import { useState } from 'react';
import { useT } from '../i18n.js';
import { api, ApiError, errorText, type OptionPosition } from '../lib/api.js';
import { joinList } from '../lib/format.js';
import { invalidateLedger, useLedgerMutation } from '../lib/queries.js';

interface PendingDelete {
  position: OptionPosition;
  count: number;
}

export function useDeletePosition(onMessage: (message: string | null) => void) {
  const t = useT();
  const client = useQueryClient();
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const remove = useLedgerMutation((contractId: string) =>
    api.delete(`/options/positions/${contractId}?confirm=true`),
  );

  const ask = async (position: OptionPosition) => {
    onMessage(null);
    setAsking(position.contractId);
    try {
      await api.delete(`/options/positions/${position.contractId}`);
      await invalidateLedger(client);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFIRMATION_REQUIRED') {
        const count = (error.details as { count?: number } | undefined)?.count ?? 1;
        setPending({ position, count });
      } else {
        onMessage(errorText(error, t('deletePosition.failed')));
      }
    } finally {
      setAsking(null);
    }
  };

  const confirm = () => {
    if (!pending) return;
    remove.mutate(pending.position.contractId, {
      onSuccess: () => setPending(null),
      onError: (e: unknown) => {
        setPending(null);
        onMessage(errorText(e, t('deletePosition.failed')));
      },
    });
  };

  return {
    ask,
    busy: asking != null || remove.isPending,
    dialogProps: {
      pending,
      busy: remove.isPending,
      onCancel: () => setPending(null),
      onConfirm: confirm,
    },
  };
}

export function DeletePositionDialog({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: PendingDelete | null;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  const t = useT();
  const position = pending?.position;
  return (
    <Dialog open={pending != null} title={t('deletePosition.title')} onClose={onCancel}>
      <Col gap={2}>
        {position && pending && (
          <Col gap={0}>
            <Text variant="section">{position.description}</Text>
            <Text muted>{joinList(position.accounts.map((a) => a.name))}</Text>
          </Col>
        )}
        {pending && <Banner tone="warning">{t('deletePosition.removes', { count: pending.count })}</Banner>}
        <Text muted>{t('deleteTransaction.recalculated')}</Text>
        <Row gap={1} justify="end">
          <Button onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" tone="danger" onClick={onConfirm} disabled={busy}>
            {busy ? t('common.deleting') : t('common.delete')}
          </Button>
        </Row>
      </Col>
    </Dialog>
  );
}
