import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Col, Dialog, Row, Text } from '@tickrs/ui';
import { useState } from 'react';
import { useT } from '../i18n.js';
import { api, ApiError, errorText, serverWording, type Transaction } from '../lib/api.js';
import {
  formatDate,
  formatMoney,
  formatQuantity,
  formatSignedMoney,
  rightLabel,
  typeLabel,
} from '../lib/format.js';
import { invalidateLedger, useLedgerMutation } from '../lib/queries.js';

export interface PendingDelete {
  transaction: Transaction;
  message: string;
  linkedCount: number;
}

export function useDeleteTransaction(onMessage: (message: string | null) => void) {
  const t = useT();
  const client = useQueryClient();
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const remove = useLedgerMutation((id: string) => api.delete(`/transactions/${id}?confirm=true`));

  const ask = async (target: Transaction | string) => {
    const id = typeof target === 'string' ? target : target.id;
    onMessage(null);
    setAsking(id);
    try {
      const transaction =
        typeof target === 'string' ? await api.get<Transaction>(`/transactions/${id}`) : target;
      try {
        await api.delete(`/transactions/${id}`);
        onMessage(t('deleteTransaction.alreadyRemoved'));
        await invalidateLedger(client);
      } catch (error) {
        if (!(error instanceof ApiError && error.code === 'CONFIRMATION_REQUIRED')) throw error;
        const ids = (error.details as { ids?: string[] } | undefined)?.ids ?? [id];
        const message = serverWording(error.message, t('deleteTransaction.linked'));
        setPending({ transaction, message, linkedCount: ids.length });
      }
    } catch (error) {
      onMessage(errorText(error, t('deleteTransaction.failed')));
    } finally {
      setAsking(null);
    }
  };

  const confirm = () => {
    if (!pending) return;
    remove.mutate(pending.transaction.id, {
      onSuccess: () => setPending(null),
      onError: (e: unknown) => {
        setPending(null);
        onMessage(errorText(e, t('deleteTransaction.failed')));
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

function describe(tx: Transaction): string {
  const instrument = tx.optionContract
    ? `${tx.optionContract.underlying} ${formatDate(tx.optionContract.expiration)} ${tx.optionContract.strike} ${rightLabel(tx.optionContract.right)}`
    : tx.symbol;
  const size =
    tx.quantity == null
      ? null
      : `${formatQuantity(tx.quantity)}${tx.price == null ? '' : ` @ ${formatMoney(tx.price, tx.currency)}`}`;
  return [typeLabel(tx.type), instrument, size].filter(Boolean).join(' · ');
}

export function DeleteTransactionDialog({
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
  const transaction = pending?.transaction;
  return (
    <Dialog open={pending != null} title={t('deleteTransaction.title')} onClose={onCancel}>
      <Col gap={2}>
        {transaction && (
          <Col gap={0}>
            <Text>{formatDate(transaction.tradeDate)}</Text>
            <Text variant="section">{describe(transaction)}</Text>
            <Text muted>
              {t('deleteTransaction.cashEffect', {
                amount: formatSignedMoney(transaction.cashEffect, transaction.currency),
              })}
            </Text>
          </Col>
        )}

        {pending && pending.linkedCount > 1 && <Banner tone="warning">{pending.message}</Banner>}

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
