import { useState } from 'react';
import { BarChart } from '@tickrs/ui';
import { type Column, DataTable, ExpandableTable } from '@tickrs/ui';
import {
  Badge,
  Banner,
  Button,
  Card,
  Col,
  Field,
  IconMenu,
  Row,
  Select,
  Spinner,
  StatTile,
  Tabs,
  Text,
} from '@tickrs/ui';
import { DayChange } from '../features/DayChange.js';
import { DeletePositionDialog, useDeletePosition } from '../features/DeletePositionDialog.js';
import { DeleteTransactionDialog, useDeleteTransaction } from '../features/DeleteTransactionDialog.js';
import { EditPositionDialog } from '../features/EditPositionDialog.js';
import { EditTransactionDialog, whyNotEditable } from '../features/EditTransactionDialog.js';
import { OptionMarkDialog } from '../features/OptionMarkDialog.js';
import { MarkWarning } from '../features/PriceWarning.js';
import { RollDialog } from '../features/RollDialog.js';
import { TransactionDialog } from '../features/TransactionDialog.js';
import { t as translate, useT } from '../i18n.js';
import { api, errorText, type NeedsActionItem, type OptionPosition, type Transaction } from '../lib/api.js';
import {
  formatDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatSignedMoney,
  joinList,
  rightLabel,
  toDecimalInput,
  toneOf,
  typeLabel,
} from '../lib/format.js';
import { useStoredChoice } from '../lib/preferences.js';
import {
  useAccounts,
  useLedgerMutation,
  useNeedsAction,
  type OptionHistoryItem,
  useOptionHistory,
  useOptionIncome,
  useOptionPositions,
} from '../lib/queries.js';

const coverageLabel = (status: string): string =>
  status === 'COVERED' || status === 'NAKED' || status === 'PARTIAL'
    ? translate(`options.coverage${status}`)
    : status.toLowerCase();

type Outcome = OptionHistoryItem['outcome'];
const OUTCOMES: readonly Outcome[] = ['CLOSED', 'ROLLED', 'EXPIRED', 'ASSIGNED', 'EXERCISED'];
const outcomeLabel = (outcome: Outcome): string => translate(`options.outcome${outcome}`);
const HISTORY_PAGE_SIZE = 25;

const coverageTone = (status: string | null) =>
  status === 'COVERED' ? 'positive' : status === 'NAKED' || status === 'PARTIAL' ? 'warning' : 'default';

type GroupBy = 'contract' | 'account';
const GROUP_BY_KEY = 'tickrs.options.positionsGroupBy';
const GROUP_BY_VALUES: GroupBy[] = ['contract', 'account'];
const groupByOptions = (): { value: GroupBy; label: string }[] => [
  { value: 'contract', label: translate('options.groupByContract') },
  { value: 'account', label: translate('options.groupByAccount') },
];

type AccountRow = { accountId: string; accountName: string };

function accountRows(positions: readonly OptionPosition[]): AccountRow[] {
  const rows = new Map<string, AccountRow>();
  for (const position of positions) {
    for (const account of position.accounts) {
      if (!rows.has(account.id)) rows.set(account.id, { accountId: account.id, accountName: account.name });
    }
  }
  return [...rows.values()];
}

function AccountUnrealized({ accountId }: { accountId: string }) {
  const positions = useOptionPositions(accountId);
  if (!positions.data) return null;
  const totals = new Map<string, number>();
  for (const o of positions.data.items) {
    totals.set(o.currency, (totals.get(o.currency) ?? 0) + Number(o.unrealized));
  }
  const amounts = [...totals].map(([currency, total]) => ({ currency, total: String(total) }));
  return (
    <Text inline tone={amounts.length === 1 ? toneOf(amounts[0]!.total) : undefined}>
      {joinList(amounts.map((a) => formatSignedMoney(a.total, a.currency)))}
    </Text>
  );
}

function AccountPositions({
  accountId,
  accountName,
  columns,
}: {
  accountId: string;
  accountName: string;
  columns: Column<OptionPosition>[];
}) {
  const t = useT();
  const positions = useOptionPositions(accountId);
  if (positions.isLoading)
    return <Spinner label={t('options.loadingPositionsIn', { account: accountName })} />;
  if (positions.error) return <Banner tone="error">{t('options.positionsLoadFailed')}</Banner>;
  return (
    <DataTable
      caption={t('options.positionsIn', { account: accountName })}
      columns={columns}
      rows={positions.data?.items ?? []}
      rowKey={(o) => o.contractId}
      empty={t('options.noOpenPositions')}
    />
  );
}

export function OptionsPage() {
  const t = useT();
  const [tab, setTab] = useState<'open' | 'history' | 'income'>('open');
  const positions = useOptionPositions();
  const needsAction = useNeedsAction();
  const income = useOptionIncome();
  const history = useOptionHistory(tab === 'history');
  const [outcomeFilter, setOutcomeFilter] = useState<Outcome | 'ALL'>('ALL');
  const [historyPage, setHistoryPage] = useState(1);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<OptionPosition | null>(null);
  const [editing, setEditing] = useState<OptionPosition | null>(null);
  const [rolling, setRolling] = useState<OptionPosition | null>(null);
  const [closing, setClosing] = useState<OptionPosition | null>(null);
  const [adding, setAdding] = useState(false);
  const [settlements, setSettlements] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useStoredChoice<GroupBy>(GROUP_BY_KEY, GROUP_BY_VALUES, 'contract');
  const accounts = useAccounts();
  const deletion = useDeletePosition(setError);
  const removeTxn = useDeleteTransaction(setError);

  const resolve = useLedgerMutation(
    (item: { contractId: string; accountId: string; outcome: string; price?: string }) =>
      api.post('/options/needs-action/resolve', { items: [item] }),
  );

  const columns: Column<OptionPosition>[] = [
    {
      key: 'description',
      header: t('options.contract'),
      nowrap: true,
      render: (o) => (
        <Col gap={0.25}>
          <Text variant="label">
            {o.underlying} {o.strike} {rightLabel(o.right)}
          </Text>
          <Row gap={1}>
            <Text variant="caption" muted>
              {formatDate(o.expiration)} · {t('options.daysLeft', { count: o.daysToExpiration })}
            </Text>
            {o.isAdjusted && (
              <Badge
                label={t('options.adjusted')}
                title={t('options.adjustedTitle', { description: o.description })}
              />
            )}
            {o.settlement === 'CASH' && (
              <Badge label={t('options.cashSettled')} title={t('options.cashSettledTitle')} />
            )}
            {o.style === 'EUROPEAN' && (
              <Badge label={t('options.european')} title={t('options.europeanTitle')} />
            )}
          </Row>
          {o.rollChain && (
            <Row>
              <Badge
                label={t('options.rolled', { count: o.rollChain.rolls })}
                tone={o.rollChain.netPremium.startsWith('-') ? 'negative' : 'positive'}
                title={t('options.rolledTitle', {
                  amount: formatSignedMoney(o.rollChain.netPremium, o.currency),
                })}
              />
            </Row>
          )}
        </Col>
      ),
      text: (o) => o.description,
    },
    {
      key: 'side',
      header: t('options.position'),
      align: 'right',
      render: (o) => `${o.side === 'SHORT' ? '−' : '+'}${o.contracts}`,
    },
    {
      key: 'premium',
      header: t('options.premium'),
      align: 'right',
      render: (o) => formatMoney(o.openAmount, o.currency),
    },
    {
      key: 'mark',
      header: t('common.price'),
      align: 'right',
      nowrap: true,
      render: (o) =>
        o.markEstimated ? (
          <Col gap={0} align="end">
            <Row gap={0.5} justify="end">
              <Text inline>{formatMoney(o.mark, o.currency)}</Text>
              <MarkWarning mark={o} />
            </Row>
            <Button
              variant="text"
              onClick={() => setMarking(o)}
              aria-label={t('options.setPriceFor', { description: o.description })}
            >
              {t('options.set')}
            </Button>
          </Col>
        ) : (
          formatMoney(o.mark, o.currency)
        ),
    },
    {
      key: 'dayChange',
      header: t('common.dayChange'),
      align: 'right',
      render: (o) => <DayChange change={o.dayChange} currency={o.currency} />,
    },
    {
      key: 'unrealized',
      header: t('common.unrealized'),
      align: 'right',
      render: (o) => (
        <Text inline tone={toneOf(o.unrealized)}>
          {formatSignedMoney(o.unrealized, o.currency)}
        </Text>
      ),
    },
    {
      key: 'breakEven',
      header: t('options.breakEven'),
      align: 'right',
      render: (o) => formatMoney(o.breakEven, o.currency),
    },
    {
      key: 'status',
      header: t('options.status'),
      render: (o) => (
        <Row gap={1} wrap>
          {o.moneyness && (
            <Badge
              label={
                o.moneyness === 'ITM'
                  ? t('options.moneynessITM')
                  : o.moneyness === 'OTM'
                    ? t('options.moneynessOTM')
                    : t('options.moneynessATM')
              }
              title={
                o.moneyness === 'ITM'
                  ? t('options.inTheMoney')
                  : o.moneyness === 'OTM'
                    ? t('options.outOfTheMoney')
                    : t('options.atTheMoney')
              }
            />
          )}
          {o.coverage && <Badge label={coverageLabel(o.coverage)} tone={coverageTone(o.coverage)} />}
          {o.returnOnRisk && (
            <Badge label={t('options.returnOnRisk', { value: formatPercent(o.returnOnRisk, 2) })} />
          )}
        </Row>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      nowrap: true,
      render: (o) => (
        <Col gap={0} align="end">
          <Row gap={0} justify="end">
            <Button
              variant="text"
              onClick={() => setRolling(o)}
              aria-label={t('options.rollFor', { description: o.description })}
            >
              {t('options.roll')}
            </Button>
            <Button
              variant="text"
              onClick={() => setClosing(o)}
              aria-label={t('options.closeFor', { description: o.description })}
            >
              {t('options.close')}
            </Button>
          </Row>
          <Row gap={0} justify="end">
            <Button
              variant="text"
              onClick={() => setEditing(o)}
              aria-label={t('options.editFor', { description: o.description })}
            >
              {t('common.edit')}
            </Button>
            <Button
              variant="text"
              tone="danger"
              disabled={deletion.busy}
              onClick={() => void deletion.ask(o)}
              aria-label={t('options.deleteFor', { description: o.description })}
            >
              {t('common.delete')}
            </Button>
          </Row>
        </Col>
      ),
    },
  ];

  const accountColumns: Column<AccountRow>[] = [
    { key: 'account', header: t('common.account'), render: (r) => r.accountName },
    {
      key: 'unrealized',
      header: t('common.unrealized'),
      align: 'right',
      render: (r) => <AccountUnrealized accountId={r.accountId} />,
    },
  ];

  const historyColumns: Column<OptionHistoryItem>[] = [
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
  const historyRows = (history.data?.items ?? []).filter(
    (h) => outcomeFilter === 'ALL' || h.outcome === outcomeFilter,
  );

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
            onClick={() => setEditingTxn(tx)}
            aria-label={t('options.editTrade', { type: typeLabel(tx.type), date: formatDate(tx.tradeDate) })}
          >
            {t('common.edit')}
          </Button>
          <Button
            variant="text"
            tone="danger"
            disabled={tx.isSystemGenerated || removeTxn.busy}
            onClick={() => void removeTxn.ask(tx)}
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

  const needsColumns: Column<NeedsActionItem>[] = [
    { key: 'description', header: t('options.contract'), render: (i) => i.description },
    { key: 'expiration', header: t('options.expired'), render: (i) => formatDate(i.expiration) },
    {
      key: 'side',
      header: t('options.position'),
      render: (i) => `${i.side === 'SHORT' ? '−' : '+'}${i.contracts}`,
    },
    {
      key: 'close',
      header: t('options.underlyingClose'),
      align: 'right',
      render: (i) =>
        i.settlement === 'CASH' ? (
          <Field
            label={t('options.settlementPrice')}
            value={settlements[i.contractId] ?? ''}
            onChange={(v) => setSettlements((s) => ({ ...s, [i.contractId]: v }))}
            placeholder={i.underlyingClose ?? ''}
          />
        ) : (
          formatMoney(i.underlyingClose)
        ),
    },
    { key: 'moneyness', header: t('options.moneyness'), render: (i) => i.moneyness ?? t('options.unknown') },
    {
      key: 'actions',
      header: t('options.resolveAs'),
      align: 'right',
      render: (i) => (
        <Row gap={1} justify="end">
          {(['EXP', i.side === 'SHORT' ? 'ASN' : 'EXR'] as const).map((outcome) => (
            <Button
              key={outcome}
              variant={i.suggestedOutcome === outcome ? 'primary' : 'secondary'}
              disabled={!i.accountId || resolve.isPending}
              onClick={() => {
                setError(null);
                const price = settlements[i.contractId]?.trim();
                resolve.mutate(
                  {
                    contractId: i.contractId,
                    accountId: i.accountId!,
                    outcome,
                    ...(outcome !== 'EXP' && i.settlement === 'CASH' && price
                      ? { price: toDecimalInput(price) }
                      : {}),
                  },
                  {
                    onError: (e: unknown) => setError(errorText(e, t('options.resolveFailed'))),
                  },
                );
              }}
            >
              {typeLabel(outcome)}
            </Button>
          ))}
        </Row>
      ),
    },
  ];

  return (
    <Col gap={3}>
      <Row justify="between" wrap>
        <Text variant="title">{t('options.title')}</Text>
        <Button variant="primary" onClick={() => setAdding(true)} data-testid="add-option">
          {t('options.add')}
        </Button>
      </Row>
      {error && <Banner tone="error">{error}</Banner>}

      {needsAction.data && needsAction.data.items.length > 0 && (
        <Card title={t('options.needsActionTitle')}>
          <Col gap={1}>
            <Text muted>{t('options.needsActionText')}</Text>
            <DataTable
              caption={t('options.needsActionCaption')}
              columns={needsColumns}
              rows={needsAction.data.items}
              rowKey={(i) => i.contractId}
            />
          </Col>
        </Card>
      )}

      <Tabs
        value={tab}
        onChange={(v) => setTab(v === 'history' || v === 'income' ? v : 'open')}
        tabs={[
          { value: 'open', label: t('options.openPositions') },
          { value: 'history', label: t('options.history') },
          { value: 'income', label: t('options.income') },
        ]}
      />

      {tab === 'open' &&
        (positions.isLoading ? (
          <Spinner label={t('options.loadingPositions')} />
        ) : (
          <Card
            action={
              <IconMenu<GroupBy>
                label={t('options.groupPositions')}
                icon="groupBy"
                value={groupBy}
                options={groupByOptions()}
                onChange={setGroupBy}
              />
            }
          >
            {groupBy === 'account' ? (
              <ExpandableTable
                caption={t('options.positionsByAccount')}
                columns={accountColumns}
                rows={accountRows(positions.data?.items ?? [])}
                rowKey={(r) => r.accountId}
                empty={t('options.noOpenPositions')}
                expandLabel={(r) => t('options.positionsIn', { account: r.accountName })}
                renderExpanded={(r) => (
                  <AccountPositions accountId={r.accountId} accountName={r.accountName} columns={columns} />
                )}
              />
            ) : (
              <DataTable
                caption={t('options.openCaption')}
                columns={columns}
                rows={positions.data?.items ?? []}
                rowKey={(o) => o.contractId}
                empty={t('options.noOpenPositions')}
              />
            )}
          </Card>
        ))}

      {tab === 'history' &&
        (history.isLoading ? (
          <Spinner label={t('options.loadingHistory')} />
        ) : (
          <Card>
            <Col gap={2}>
              <Row>
                <Select
                  label={t('options.outcome')}
                  value={outcomeFilter}
                  onChange={(v) => {
                    setOutcomeFilter(v);
                    setHistoryPage(1);
                  }}
                  options={[
                    { value: 'ALL' as const, label: t('options.allOutcomes') },
                    ...OUTCOMES.map((o) => ({ value: o, label: outcomeLabel(o) })),
                  ]}
                />
              </Row>
              <ExpandableTable
                caption={t('options.historyCaption')}
                columns={historyColumns}
                rows={historyRows.slice(
                  (historyPage - 1) * HISTORY_PAGE_SIZE,
                  historyPage * HISTORY_PAGE_SIZE,
                )}
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
                  historyRows.length > HISTORY_PAGE_SIZE
                    ? {
                        page: historyPage,
                        pageSize: HISTORY_PAGE_SIZE,
                        total: historyRows.length,
                        onPageChange: setHistoryPage,
                      }
                    : undefined
                }
              />
            </Col>
          </Card>
        ))}

      <EditPositionDialog
        key={`edit-${editing?.contractId ?? 'none'}`}
        position={editing}
        onClose={() => setEditing(null)}
      />

      <OptionMarkDialog
        key={marking?.contractId ?? 'none'}
        position={marking}
        onClose={() => setMarking(null)}
      />

      <TransactionDialog
        mode="option"
        open={adding}
        onClose={() => setAdding(false)}
        accounts={accounts.data?.items ?? []}
      />

      <TransactionDialog
        key={`close-${closing?.contractId ?? 'none'}`}
        mode="option"
        open={closing !== null}
        closing={closing}
        onClose={() => setClosing(null)}
        accounts={accounts.data?.items ?? []}
      />

      <DeletePositionDialog {...deletion.dialogProps} />

      <EditTransactionDialog
        key={`edit-txn-${editingTxn?.id ?? 'none'}`}
        transaction={editingTxn}
        accounts={accounts.data?.items ?? []}
        onClose={() => setEditingTxn(null)}
      />
      <DeleteTransactionDialog {...removeTxn.dialogProps} />

      <RollDialog
        key={`roll-${rolling?.contractId ?? 'none'}`}
        position={rolling}
        onClose={() => setRolling(null)}
      />

      {tab === 'income' && income.data && (
        <Col gap={2}>
          <Row gap={2} wrap>
            <StatTile
              label={t('options.premiumAtRisk')}
              value={formatMoney(income.data.openPremium, income.data.baseCurrency)}
            />
            {income.data.months.slice(-3).map((m) => (
              <StatTile
                key={m.month}
                label={m.month}
                value={formatSignedMoney(m.realized, income.data!.baseCurrency)}
                tone={toneOf(m.realized)}
                sub={t('options.monthSub', {
                  closed: m.closed,
                  rate: m.winRate ? formatPercent(m.winRate, 0) : '—',
                })}
              />
            ))}
          </Row>
          <Card title={t('options.realizedByMonth')}>
            <BarChart
              caption={t('options.realizedByMonth')}
              data={income.data.months.map((m, i) => ({
                label: m.month,
                value: Number(m.realized),
                cumulative: income
                  .data!.months.slice(0, i + 1)
                  .reduce((total, month) => total + Number(month.realized), 0),
              }))}
              cumulativeLabel={t('options.cumulative')}
              format={(v) => formatMoney(String(v), income.data!.baseCurrency, 0)}
            />
          </Card>

          <Card title={t('options.byUnderlying')}>
            <Col gap={1}>
              {Object.entries(income.data.byUnderlying).map(([symbol, { realized, currency }]) => (
                <Row key={symbol} justify="between">
                  <Text>{symbol}</Text>
                  <Text tone={toneOf(realized)}>{formatSignedMoney(realized, currency)}</Text>
                </Row>
              ))}
              {Object.keys(income.data.byUnderlying).length === 0 && (
                <Text muted>{t('options.noClosed')}</Text>
              )}
            </Col>
          </Card>
        </Col>
      )}
    </Col>
  );
}
