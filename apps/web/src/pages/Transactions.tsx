import { useState } from 'react';
import { type Column, DataTable } from '@tickrs/ui';
import { Badge, Banner, Button, Card, Col, Field, Row, Select, Spinner, Text } from '@tickrs/ui';
import { DeleteTransactionDialog, useDeleteTransaction } from '../features/DeleteTransactionDialog.js';
import { EditTransactionDialog, whyNotEditable } from '../features/EditTransactionDialog.js';
import { useT } from '../i18n.js';
import type { Transaction } from '../lib/api.js';
import {
  formatDate,
  formatMoney,
  formatMoneyWithCode,
  formatQuantity,
  rightLabel,
  typeLabel,
} from '../lib/format.js';
import { useAccounts, useDebounced, useTransactions } from '../lib/queries.js';

function totalValue(tx: Transaction): string | null {
  if (tx.quantity == null || tx.price == null) return tx.amount;
  const multiplier = tx.optionContract ? Number(tx.optionContract.multiplier) : 1;
  return String(Number(tx.quantity) * Number(tx.price) * multiplier);
}

type SortKey = 'tradeDate' | 'symbol';
const STOCK_TRADES = new Set(['BUY', 'SELL', 'SELL_SHORT', 'BUY_TO_COVER']);
type TxnSort = { key: SortKey; direction: 'asc' | 'desc' };
const SORT_KEYS: readonly string[] = ['tradeDate', 'symbol'] satisfies SortKey[];

function nextSort(current: TxnSort, key: SortKey): TxnSort {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: key === 'symbol' ? 'asc' : 'desc' };
}

export function TransactionsPage({ onAdd }: { onAdd(): void }) {
  const t = useT();
  const accounts = useAccounts();
  const [assetClass, setAssetClass] = useState<'' | 'STOCK' | 'OPTION'>('');
  const [accountId, setAccountId] = useState('');
  const [symbol, setSymbol] = useState('');
  const symbolFilter = useDebounced(symbol.trim().toUpperCase(), 300);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<TxnSort>({ key: 'tradeDate', direction: 'desc' });
  const [message, setMessage] = useState<string | null>(null);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: '50',
    sort: sort.key,
    direction: sort.direction,
  });
  if (assetClass) params.set('assetClass', assetClass);
  if (accountId) params.set('accountId', accountId);
  if (symbolFilter) params.set('symbol', symbolFilter);
  const transactions = useTransactions(params.toString());

  const [editing, setEditing] = useState<Transaction | null>(null);
  const remove = useDeleteTransaction(setMessage);

  const accountNames = new Map((accounts.data?.items ?? []).map((a) => [a.id, a.name]));

  const columns: Column<Transaction>[] = [
    { key: 'tradeDate', header: t('common.date'), sortable: true, render: (tx) => formatDate(tx.tradeDate) },
    {
      key: 'symbol',
      header: t('common.symbol'),
      sortable: true,
      render: (tx) =>
        tx.optionContract
          ? `${tx.optionContract.underlying} ${formatDate(tx.optionContract.expiration)} ${tx.optionContract.strike} ${rightLabel(tx.optionContract.right)}`
          : tx.symbol,
    },
    { key: 'account', header: t('common.account'), render: (tx) => accountNames.get(tx.accountId) ?? '' },
    {
      key: 'type',
      header: t('common.type'),
      render: (tx) => (
        <Row gap={1}>
          {STOCK_TRADES.has(tx.type) ? (
            <Badge
              label={typeLabel(tx.type)}
              tone={tx.type === 'BUY' || tx.type === 'BUY_TO_COVER' ? 'positive' : 'negative'}
            />
          ) : (
            <Text>{typeLabel(tx.type)}</Text>
          )}
          {tx.isSystemGenerated && <Badge label={t('common.auto')} title={t('common.autoSystemTitle')} />}
        </Row>
      ),
    },
    { key: 'quantity', header: t('common.qty'), align: 'right', render: (tx) => formatQuantity(tx.quantity) },
    {
      key: 'price',
      header: t('common.price'),
      align: 'right',
      render: (tx) => formatMoney(tx.price, tx.currency),
    },
    {
      key: 'fee',
      header: t('common.fee'),
      align: 'right',
      render: (tx) => (
        <Row gap={1} justify="end">
          <span>{formatMoney(tx.fee, tx.currency)}</span>
          {tx.feeSource === 'AUTO' && (
            <Badge label={t('common.auto')} title={t('transactions.autoFeeTitle')} />
          )}
        </Row>
      ),
    },
    {
      key: 'totalValue',
      header: t('transactions.totalValue'),
      align: 'right',
      render: (tx) => formatMoneyWithCode(totalValue(tx), tx.currency),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (tx) => (
        <Row gap={0} justify="end">
          <Button variant="text" disabled={whyNotEditable(tx) != null} onClick={() => setEditing(tx)}>
            {t('common.edit')}
          </Button>
          <Button
            variant="text"
            tone="danger"
            disabled={tx.isSystemGenerated || remove.busy}
            onClick={() => void remove.ask(tx)}
          >
            {t('common.delete')}
          </Button>
        </Row>
      ),
    },
  ];

  return (
    <Col gap={3}>
      <Row justify="between" wrap>
        <Text variant="title">{t('transactions.title')}</Text>
        <Button variant="primary" onClick={onAdd}>
          {t('transactions.add')}
        </Button>
      </Row>

      {message && <Banner tone="error">{message}</Banner>}

      <Card>
        <Col gap={2}>
          <Row gap={2} responsive align="start">
            <Select
              label={t('common.account')}
              value={accountId}
              onChange={(v) => {
                setAccountId(v);
                setPage(1);
              }}
              options={[
                { value: '', label: t('transactions.allAccounts') },
                ...(accounts.data?.items ?? []).map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
            <Select
              label={t('transactions.kind')}
              value={assetClass}
              onChange={(v) => {
                setAssetClass(v);
                setPage(1);
              }}
              options={[
                { value: '', label: t('transactions.everything') },
                { value: 'STOCK', label: t('transactions.stocks') },
                { value: 'OPTION', label: t('transactions.options') },
              ]}
            />
            <Field
              label={t('common.symbol')}
              value={symbol}
              placeholder={t('transactions.allSymbols')}
              onChange={(v) => {
                setSymbol(v);
                setPage(1);
              }}
            />
          </Row>

          {transactions.isLoading ? (
            <Spinner label={t('transactions.loading')} />
          ) : (
            <DataTable
              caption={t('transactions.title')}
              columns={columns}
              rows={transactions.data?.items ?? []}
              rowKey={(tx) => tx.id}
              empty={t('transactions.empty')}
              sort={sort}
              onSortChange={(key) => {
                if (!SORT_KEYS.includes(key)) return;
                setSort((s) => nextSort(s, key as SortKey));
                setPage(1);
              }}
              pagination={{
                page,
                pageSize: transactions.data?.pageSize ?? 50,
                total: transactions.data?.total ?? 0,
                onPageChange: setPage,
              }}
            />
          )}
        </Col>
      </Card>

      <EditTransactionDialog
        key={editing?.id ?? 'none'}
        transaction={editing}
        accounts={accounts.data?.items ?? []}
        onClose={() => setEditing(null)}
      />

      <DeleteTransactionDialog {...remove.dialogProps} />
    </Col>
  );
}
