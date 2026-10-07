import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Col, Dialog, Select, Text } from '@tickrs/ui';
import { useState } from 'react';
import { useT } from '../i18n.js';
import { api, errorText, type OptionPosition, type Paged, type Transaction } from '../lib/api.js';
import { formatDate, formatQuantity, typeLabel } from '../lib/format.js';
import { useAccounts, useLedgerMutation } from '../lib/queries.js';
import {
  TransactionEditFields,
  transactionChanges,
  transactionErrors,
  type TransactionEdits,
} from './TransactionEditFields.js';

export function EditPositionDialog({
  position,
  onClose,
}: {
  position: OptionPosition | null;
  onClose(): void;
}) {
  const t = useT();
  const contractId = position?.contractId ?? '';
  const accounts = useAccounts();
  const openings = useQuery({
    enabled: Boolean(position),
    queryKey: ['transactions', 'openings', contractId],
    queryFn: async () => {
      const params = new URLSearchParams({
        assetClass: 'OPTION',
        symbol: position!.underlying,
        type: position!.side === 'SHORT' ? 'STO' : 'BTO',
        pageSize: '200',
      });
      const page = await api.get<Paged<Transaction>>(`/transactions?${params}`);
      const onContract = page.items.filter(
        (tx) => tx.optionContract?.id === contractId && !tx.isSystemGenerated,
      );
      const ids = position!.openingTxnIds;
      if (!ids) return onContract;
      const byId = new Map(onContract.map((tx) => [tx.id, tx]));
      return ids.flatMap((id) => byId.get(id) ?? []);
    },
    retry: false,
  });
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<TransactionEdits>({});
  const [errors, setErrors] = useState<TransactionEdits>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useLedgerMutation((input: { id: string; body: Record<string, unknown> }) =>
    api.patch(`/transactions/${input.id}`, input.body),
  );

  if (!position) return null;
  const openingTrades = openings.data ?? [];
  const opening =
    openingTrades.find((tx) => tx.id === pickedId) ?? openingTrades[openingTrades.length - 1] ?? null;
  const pick = (id: string) => {
    setPickedId(id);
    setEdits({});
    setErrors({});
    setFormError(null);
  };

  const submit = () => {
    if (!opening) return onClose();
    const found = transactionErrors(opening, edits);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = transactionChanges(opening, edits);
    if (Object.keys(body).length === 0) return onClose();
    setFormError(null);
    save.mutate(
      { id: opening.id, body },
      {
        onSuccess: onClose,
        onError: (e: unknown) => setFormError(errorText(e, t('editPosition.saveFailed'))),
      },
    );
  };

  return (
    <Dialog
      open
      title={t('editPosition.title')}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <Button onClick={onClose} variant="text">
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!opening || save.isPending}>
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <Col gap={2}>
        {formError && <Banner tone="error">{formError}</Banner>}
        {openingTrades.length > 1 && opening && (
          <>
            <Text muted>{t('editPosition.severalOpenings', { count: openingTrades.length })}</Text>
            <Select
              label={t('editPosition.openingTrade')}
              value={opening.id}
              onChange={pick}
              disabled={save.isPending}
              options={openingTrades.map((tx) => ({
                value: tx.id,
                label: `${formatDate(tx.tradeDate)} · ${typeLabel(tx.type)} ${formatQuantity(tx.quantity)} × ${tx.price ?? ''}`,
              }))}
            />
          </>
        )}
        {opening ? (
          <TransactionEditFields
            key={opening.id}
            transaction={opening}
            accounts={accounts.data?.items ?? []}
            edits={edits}
            errors={errors}
            onChange={setEdits}
            types={['BTO', 'STO']}
            disabled={save.isPending}
          />
        ) : (
          <Text muted>
            {openings.isLoading ? t('editPosition.loadingOpening') : t('editPosition.noOpening')}
          </Text>
        )}
      </Col>
    </Dialog>
  );
}
