import { Banner, Button, Col, Dialog, Row, Text } from '@tickrs/ui';
import { useState } from 'react';
import { t as translate, useT } from '../i18n.js';
import { api, ApiError, errorText, serverWording, type Account, type Transaction } from '../lib/api.js';
import { formatDate, rightLabel, typeLabel } from '../lib/format.js';
import { useLedgerMutation } from '../lib/queries.js';
import {
  TransactionEditFields,
  transactionChanges,
  transactionErrors,
  type TransactionEdits,
} from './TransactionEditFields.js';

export function whyNotEditable(tx: Pick<Transaction, 'isSystemGenerated' | 'type'>): string | null {
  if (tx.isSystemGenerated) return translate('editTransaction.notEditableSystem');
  return null;
}

export function EditTransactionDialog({
  transaction,
  accounts,
  onClose,
}: {
  transaction: Transaction | null;
  accounts: Account[];
  onClose(): void;
}) {
  const t = useT();
  const [edits, setEdits] = useState<TransactionEdits>({});
  const [errors, setErrors] = useState<TransactionEdits>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmNegative, setConfirmNegative] = useState<string | null>(null);

  const save = useLedgerMutation((body: Record<string, unknown>) =>
    api.patch(`/transactions/${transaction!.id}`, body),
  );

  if (!transaction) return null;

  const submit = (confirm = false) => {
    const found = transactionErrors(transaction, edits);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = transactionChanges(transaction, edits);
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setError(null);
    save.mutate(confirm ? { ...body, confirmNegativeStock: true } : body, {
      onSuccess: onClose,
      onError: (e: unknown) => {
        if (e instanceof ApiError && e.code === 'CONFIRMATION_REQUIRED') {
          setConfirmNegative(serverWording(e.message, t('editTransaction.confirmNegative')));
          return;
        }
        setError(errorText(e, t('editTransaction.saveFailed')));
      },
    });
  };

  const instrument = transaction.optionContract
    ? `${transaction.optionContract.underlying} ${formatDate(transaction.optionContract.expiration)} ${transaction.optionContract.strike} ${rightLabel(transaction.optionContract.right)}`
    : (transaction.symbol ?? transaction.currency);

  return (
    <Dialog
      open
      title={t('editTransaction.title', {
        type: typeLabel(transaction.type),
        typeLower: typeLabel(transaction.type).toLowerCase(),
      })}
      onClose={onClose}
      onSubmit={() => submit(Boolean(confirmNegative))}
    >
      <Col gap={2}>
        {transaction.assetClass !== 'STOCK' && <Text muted>{instrument}</Text>}
        <TransactionEditFields
          transaction={transaction}
          accounts={accounts}
          edits={edits}
          errors={errors}
          onChange={(next) => {
            setEdits(next);
            setConfirmNegative(null);
          }}
        />
        {error && <Banner tone="error">{error}</Banner>}
        {confirmNegative && <Banner tone="warning">{confirmNegative}</Banner>}
        <Row gap={1} justify="end">
          <Button onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending
              ? t('common.saving')
              : confirmNegative
                ? t('common.saveAnyway')
                : t('common.save')}
          </Button>
        </Row>
      </Col>
    </Dialog>
  );
}
