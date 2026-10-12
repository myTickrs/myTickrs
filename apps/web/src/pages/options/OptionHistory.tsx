import {
  Badge,
  Button,
  Card,
  Col,
  DataTable,
  ExpandableTable,
  Row,
  Select,
  Spinner,
  Text,
  type Column,
} from '@tickrs/ui';
import { whyNotEditable } from '../../features/EditTransactionDialog.js';
import { t as translate, useT } from '../../i18n.js';
import type { Transaction } from '../../lib/api.js';
import {
  formatDate,
  formatMoney,
  formatQuantity,
  formatSignedMoney,
  rightLabel,
  toneOf,
  typeLabel,
} from '../../lib/format.js';
import type { OptionHistoryItem } from '../../lib/queries.js';

export type Outcome = OptionHistoryItem['outcome'];
const OUTCOMES: readonly Outcome[] = ['CLOSED', 'ROLLED', 'EXPIRED', 'ASSIGNED', 'EXERCISED'];
const outcomeLabel = (outcome: Outcome): string => translate(`options.outcome${outcome}`);
const PAGE_SIZE = 25;

export interface TradeActions {
  edit(trade: Transaction): void;
  remove(trade: Transaction): void;
  removing: boolean;
}

export function OptionHistory({
  items,
  loading,
  outcome,
  onOutcomeChange,
  page,
  onPageChange,
  actions,
}: {
  items: OptionHistoryItem[];
  loading: boolean;
  outcome: Outcome | 'ALL';
  onOutcomeChange(outcome: Outcome | 'ALL'): void;
  page: number;
  onPageChange(page: number): void;
  actions: TradeActions;
}) {
  const t = useT();

  const columns: Column<OptionHistoryItem>[] = [
    { key: 'date', header: t('common.date'), nowrap: true, render: (h) => formatDate(h.date) },
    {
      key: 'contract',
      header: t('options.contract'),
      nowrap: true,
      render: (h) => (
        <Col gap={0.25}>
          <Text variant="label">
            {h.underlying} {h.strike} {rightLabel(h.right)}
          </Text>
          <Text variant="caption" muted>
            {formatDate(h.expiration)}
          </Text>
        </Col>
      ),
      text: (h) => h.contract,
    },
    { key: 'account', header: t('common.account'), render: (h) => h.account?.name ?? '' },
    {
      key: 'side',
      header: t('options.position'),
      align: 'right',
      render: (h) => (h.side && h.contracts ? `${h.side === 'SHORT' ? '−' : '+'}${h.contracts}` : ''),
    },
    {
      key: 'outcome',
      header: t('options.outcome'),
      render: (h) => <Badge label={outcomeLabel(h.outcome)} />,
      text: (h) => outcomeLabel(h.outcome),
    },
    {
      key: 'realized',
      header: t('options.realizedPnl'),
      align: 'right',
      render: (h) =>
        h.rolledIntoStock ? (
          <Text inline muted>
            {t('options.inStockBasis')}
          </Text>
        ) : (
          <Text inline tone={toneOf(h.amount)}>
            {formatSignedMoney(h.amount, h.currency)}
          </Text>
        ),
    },
  ];

  const tradeColumns: Column<Transaction>[] = [
    { key: 'date', header: t('common.date'), nowrap: true, render: (tx) => formatDate(tx.tradeDate) },
    {
      key: 'type',
      header: t('common.type'),
      render: (tx) => (
        <Row gap={1}>
          <Text inline>
            {typeLabel(tx.type)}
            {tx.symbol && !tx.optionContract ? ` ${tx.symbol}` : ''}
          </Text>
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
    { key: 'fee', header: t('common.fee'), align: 'right', render: (tx) => formatMoney(tx.fee, tx.currency) },
    {
      key: 'cash',
      header: t('options.cashEffect'),
      align: 'right',
      render: (tx) => (
        <Text inline tone={toneOf(tx.cashEffect)}>
          {formatSignedMoney(tx.cashEffect, tx.currency)}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      nowrap: true,
      render: (tx) => (
        <Row gap={0} justify="end">
          <Button
            variant="text"
            disabled={whyNotEditable(tx) != null}
            onClick={() => actions.edit(tx)}
            aria-label={t('options.editTrade', { type: typeLabel(tx.type), date: formatDate(tx.tradeDate) })}
          >
            {t('common.edit')}
          </Button>
          <Button
            variant="text"
            tone="danger"
            disabled={tx.isSystemGenerated || actions.removing}
            onClick={() => actions.remove(tx)}
            aria-label={t('options.deleteTrade', {
              type: typeLabel(tx.type),
              date: formatDate(tx.tradeDate),
            })}
          >
            {t('common.delete')}
          </Button>
        </Row>
      ),
    },
  ];

  if (loading) return <Spinner label={t('options.loadingHistory')} />;
  const rows = items.filter((h) => outcome === 'ALL' || h.outcome === outcome);
  return (
    <Card>
      <Col gap={2}>
        <Row>
          <Select
            label={t('options.outcome')}
            value={outcome}
            onChange={(v) => {
              onOutcomeChange(v);
              onPageChange(1);
            }}
            options={[
              { value: 'ALL' as const, label: t('options.allOutcomes') },
              ...OUTCOMES.map((o) => ({ value: o, label: outcomeLabel(o) })),
            ]}
          />
        </Row>
        <ExpandableTable
          caption={t('options.historyCaption')}
          columns={columns}
          rows={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
          rowKey={(h) => h.txnId}
          empty={t('options.noClosed')}
          defaultExpanded={false}
          expandLabel={(h) => t('options.tradesFor', { description: h.contract })}
          renderExpanded={(h) => (
            <DataTable
              caption={t('options.tradesFor', { description: h.contract })}
              columns={tradeColumns}
              rows={h.transactions}
              rowKey={(tx) => tx.id}
            />
          )}
          pagination={
            rows.length > PAGE_SIZE
              ? { page, pageSize: PAGE_SIZE, total: rows.length, onPageChange }
              : undefined
          }
        />
      </Col>
    </Card>
  );
}
