import { useState } from 'react';
import { useNavigate } from 'react-router';
import { type Column, DataTable, ExpandableTable } from '@tickrs/ui';
import {
  Badge,
  Banner,
  Button,
  Card,
  Col,
  IconMenu,
  MenuSelect,
  Row,
  Spinner,
  StatTile,
  Text,
} from '@tickrs/ui';
import { formatMoney, formatPercent, formatQuantity, formatSignedMoney, toneOf } from '../lib/format.js';
import { PortfolioChart } from '../features/PortfolioChart.js';
import { DayChange } from '../features/DayChange.js';
import { MarkWarning, PriceWarning } from '../features/PriceWarning.js';
import { t as translate, useT } from '../i18n.js';
import { useStoredChoice } from '../lib/preferences.js';
import {
  type PortfolioSummary,
  useHoldings,
  useHoldingsByAccount,
  useNeedsAction,
  useSummary,
  type AccountHolding,
  type HoldingsResponse,
} from '../lib/queries.js';

type StockRow = HoldingsResponse['stocks'][number];
type OptionRow = HoldingsResponse['options'][number];
type ClosedRow = HoldingsResponse['closedStocks'][number];

type HoldingRow =
  | { kind: 'stock'; stock: StockRow }
  | { kind: 'option'; option: OptionRow }
  | { kind: 'closed'; closed: ClosedRow };

const holdingKey = (r: HoldingRow) =>
  r.kind === 'stock'
    ? r.stock.symbol
    : r.kind === 'option'
      ? r.option.contractId
      : `closed:${r.closed.symbol}`;
const holdingHref = (r: HoldingRow) =>
  r.kind === 'stock'
    ? `/stocks/${r.stock.symbol}`
    : r.kind === 'closed'
      ? `/stocks/${r.closed.symbol}`
      : '/options';

type SortKey = 'symbol' | 'dayChange' | 'totalPl' | 'value' | 'unrealized' | 'weight';
type HoldingSort = { key: SortKey; direction: 'asc' | 'desc' };
const SORT_KEYS: readonly string[] = [
  'symbol',
  'dayChange',
  'totalPl',
  'value',
  'unrealized',
  'weight',
] satisfies SortKey[];

function nextSort(current: HoldingSort | undefined, key: SortKey): HoldingSort {
  if (current?.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: key === 'symbol' ? 'asc' : 'desc' };
}

function baseAmount(r: HoldingRow, key: Exclude<SortKey, 'symbol'>): number {
  if (r.kind === 'closed') return 0;
  if (key === 'weight') return Number(r.kind === 'stock' ? r.stock.weight : r.option.weight);
  if (r.kind === 'stock') {
    if (key === 'value') return Number(r.stock.marketValueBase);
    const amount =
      key === 'dayChange'
        ? r.stock.dayChange.amount
        : key === 'totalPl'
          ? r.stock.totalPl.amount
          : r.stock.unrealized;
    return Number(amount) * Number(r.stock.fxRate);
  }
  if (key === 'value') return Number(r.option.marketValueBase);
  const value = Number(r.option.marketValue);
  const rate = value === 0 ? 1 : Number(r.option.marketValueBase) / value;
  const amount =
    key === 'dayChange'
      ? r.option.dayChange.amount
      : key === 'totalPl'
        ? r.option.totalPl.amount
        : r.option.unrealized;
  return Number(amount) * rate;
}

function holdingRows(data: HoldingsResponse | undefined, sort?: HoldingSort): HoldingRow[] {
  if (!data) return [];
  return [...openHoldingRows(data, sort), ...closedHoldingRows(data, sort)];
}

function closedHoldingRows(data: HoldingsResponse, sort?: HoldingSort): HoldingRow[] {
  const sign = sort?.key === 'symbol' && sort.direction === 'desc' ? -1 : 1;
  return data.closedStocks
    .toSorted((a, b) => sign * a.symbol.localeCompare(b.symbol))
    .map((closed) => ({ kind: 'closed', closed }));
}

function openHoldingRows(data: HoldingsResponse, sort?: HoldingSort): HoldingRow[] {
  const groups = new Map<string, HoldingRow[]>();
  for (const stock of data.stocks) groups.set(stock.symbol, [{ kind: 'stock', stock }]);
  const unheld = new Map<string, HoldingRow[]>();
  for (const option of data.options) {
    const group = groups.get(option.underlying) ?? unheld.get(option.underlying) ?? [];
    if (group.length === 0) unheld.set(option.underlying, group);
    group.push({ kind: 'option', option });
  }
  const entries = [...groups, ...unheld];
  if (!sort) return entries.flatMap(([, rows]) => rows);

  const sign = sort.direction === 'asc' ? 1 : -1;
  if (sort.key === 'symbol') {
    return entries.toSorted(([a], [b]) => sign * a.localeCompare(b)).flatMap(([, rows]) => rows);
  }
  const key = sort.key;
  const byAmount = (a: HoldingRow, b: HoldingRow) => sign * (baseAmount(a, key) - baseAmount(b, key));
  const groupAmount = (rows: HoldingRow[]) =>
    rows[0]!.kind === 'stock'
      ? baseAmount(rows[0]!, key)
      : rows.reduce((sum, r) => sum + baseAmount(r, key), 0);
  return entries
    .map(([, rows]) =>
      rows[0]!.kind === 'stock' ? [rows[0]!, ...rows.slice(1).toSorted(byAmount)] : rows.toSorted(byAmount),
    )
    .toSorted((a, b) => sign * (groupAmount(a) - groupAmount(b)))
    .flat();
}

type GroupBy = 'symbol' | 'account';
type TotalReturnPeriod = keyof PortfolioSummary['totalReturn'];
const TOTAL_RETURN_KEY = 'tickrs.dashboard.totalReturnPeriod';
const TOTAL_RETURN_PERIODS: TotalReturnPeriod[] = ['allTime', 'year'];
const totalReturnOptions = (): { value: TotalReturnPeriod; label: string }[] => [
  { value: 'allTime', label: translate('dashboard.totalReturnAllTime') },
  { value: 'year', label: translate('dashboard.totalReturnYear') },
];

function TotalReturnTile({ summary: s }: { summary: PortfolioSummary }) {
  const t = useT();
  const [period, setPeriod] = useStoredChoice<TotalReturnPeriod>(
    TOTAL_RETURN_KEY,
    TOTAL_RETURN_PERIODS,
    'allTime',
  );
  const amount = s.totalReturn[period];
  return (
    <StatTile
      label={t('dashboard.totalReturn')}
      action={
        <MenuSelect<TotalReturnPeriod>
          label={t('dashboard.totalReturnPeriod')}
          value={period}
          options={totalReturnOptions()}
          onChange={setPeriod}
        />
      }
      value={formatSignedMoney(amount, s.baseCurrency)}
      tone={toneOf(amount)}
      sub={period === 'year' ? t('dashboard.totalReturnYearSub') : t('dashboard.totalReturnSub')}
    />
  );
}

type OptionPnlPeriod = keyof PortfolioSummary['optionPnl'];
const OPTION_PNL_KEY = 'tickrs.dashboard.optionPnlPeriod';
const OPTION_PNL_PERIODS: OptionPnlPeriod[] = ['allTime', 'year', 'month', 'open'];
const optionPnlOptions = (): { value: OptionPnlPeriod; label: string }[] => [
  { value: 'allTime', label: translate('dashboard.optionPnlAllTime') },
  { value: 'year', label: translate('dashboard.optionPnlYear') },
  { value: 'month', label: translate('dashboard.optionPnlMonth') },
  { value: 'open', label: translate('dashboard.optionPnlOpen') },
];

function OptionPnlTile({ summary: s }: { summary: PortfolioSummary }) {
  const t = useT();
  const [period, setPeriod] = useStoredChoice<OptionPnlPeriod>(OPTION_PNL_KEY, OPTION_PNL_PERIODS, 'month');
  const amount = s.optionPnl[period];
  return (
    <StatTile
      label={t('dashboard.optionPnl')}
      action={
        <MenuSelect<OptionPnlPeriod>
          label={t('dashboard.optionPnlPeriod')}
          value={period}
          options={optionPnlOptions()}
          onChange={setPeriod}
        />
      }
      value={formatSignedMoney(amount, s.baseCurrency)}
      tone={toneOf(amount)}
      sub={
        period === 'open'
          ? t('dashboard.openPositionsSub', { count: s.counts.options })
          : period === 'allTime'
            ? t('dashboard.optionPnlAllTimeSub')
            : t('dashboard.optionPnlRealizedSub')
      }
    />
  );
}

const GROUP_BY_KEY = 'tickrs.dashboard.holdingsGroupBy';
const GROUP_BY_VALUES: GroupBy[] = ['symbol', 'account'];
const groupByOptions = (): { value: GroupBy; label: string }[] => [
  { value: 'symbol', label: translate('dashboard.groupBySymbol') },
  { value: 'account', label: translate('dashboard.groupByAccount') },
];

const ESTIMATED_NOTICE_KEY = 'tickrs.dashboard.estimatedNotice';
const ESTIMATED_NOTICE_STATES = ['shown', 'dismissed'] as const;

function AccountHoldings({
  accountId,
  accountName,
  holdingColumns,
  sort,
  onSortChange,
}: {
  accountId: string;
  accountName: string;
  holdingColumns: Column<HoldingRow>[];
  sort: HoldingSort | undefined;
  onSortChange(key: string): void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const holdings = useHoldings(accountId);
  if (holdings.isLoading)
    return <Spinner label={t('dashboard.loadingHoldingsIn', { account: accountName })} />;
  if (holdings.error) return <Banner tone="error">{t('dashboard.holdingsLoadFailed')}</Banner>;
  return (
    <DataTable
      caption={t('dashboard.holdingsIn', { account: accountName })}
      columns={holdingColumns}
      rows={holdingRows(holdings.data, sort)}
      rowKey={holdingKey}
      empty={t('dashboard.noPositionsInAccount')}
      sort={sort}
      onSortChange={onSortChange}
      onRowClick={(r) => void navigate(holdingHref(r))}
      dense
    />
  );
}

function HoldingsCard({ holdingColumns }: { holdingColumns: Column<HoldingRow>[] }) {
  const t = useT();
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = useStoredChoice<GroupBy>(GROUP_BY_KEY, GROUP_BY_VALUES, 'symbol');
  const showAccounts = groupBy === 'account';
  const byAccount = useHoldingsByAccount(showAccounts);
  const holdings = useHoldings();
  const [sort, setSort] = useState<HoldingSort>();
  const changeSort = (key: string) => {
    if (SORT_KEYS.includes(key)) setSort((s) => nextSort(s, key as SortKey));
  };

  const accountColumns: Column<AccountHolding>[] = [
    { key: 'account', header: t('common.account'), render: (r) => r.accountName },
    {
      key: 'value',
      header: t('dashboard.totalValue'),
      align: 'right',
      render: (r) => formatMoney(r.positionsValue, r.currency),
    },
    {
      key: 'positions',
      header: t('dashboard.positions'),
      align: 'right',
      render: (r) => String(r.positionCount),
    },
    {
      key: 'weight',
      header: t('dashboard.percentOfPortfolio'),
      align: 'right',
      render: (r) => formatPercent(r.weight, 1),
    },
    {
      key: 'realized',
      header: t('common.realized'),
      align: 'right',
      render: (r) => (
        <Text inline tone={toneOf(r.realized)}>
          {formatSignedMoney(r.realized, r.currency)}
        </Text>
      ),
    },
    {
      key: 'unrealized',
      header: t('common.unrealized'),
      align: 'right',
      render: (r) => (
        <Text inline tone={toneOf(r.unrealized)}>
          {formatSignedMoney(r.unrealized, r.currency)}
        </Text>
      ),
    },
  ];

  const action = (
    <IconMenu<GroupBy>
      label={t('dashboard.groupHoldings')}
      icon="groupBy"
      value={groupBy}
      options={groupByOptions()}
      onChange={setGroupBy}
    />
  );

  const query = showAccounts ? byAccount : holdings;
  return (
    <Card title={t('dashboard.holdings')} action={action}>
      {query.isLoading ? (
        <Spinner label={t('dashboard.loadingHoldings')} />
      ) : query.error ? (
        <Banner tone="error">{t('dashboard.holdingsLoadFailed')}</Banner>
      ) : showAccounts ? (
        <ExpandableTable
          caption={t('dashboard.holdingsByAccount')}
          columns={accountColumns}
          rows={(byAccount.data?.accounts ?? []).filter((a) => a.positionCount > 0 || a.closedCount > 0)}
          rowKey={(r) => r.accountId}
          empty={t('dashboard.noOpenPositionsAnyAccount')}
          expandLabel={(r) => t('dashboard.holdingsIn', { account: r.accountName })}
          dense
          renderExpanded={(r) => (
            <AccountHoldings
              accountId={r.accountId}
              accountName={r.accountName}
              holdingColumns={holdingColumns}
              sort={sort}
              onSortChange={changeSort}
            />
          )}
        />
      ) : (
        <DataTable
          caption={t('dashboard.holdingsBySymbol')}
          columns={holdingColumns}
          rows={holdingRows(holdings.data, sort)}
          rowKey={holdingKey}
          empty={t('dashboard.noPositionsYet')}
          sort={sort}
          onSortChange={changeSort}
          onRowClick={(r) => void navigate(holdingHref(r))}
          dense
        />
      )}
    </Card>
  );
}

export function DashboardPage() {
  const t = useT();
  const [estimatedNotice, setEstimatedNotice] = useStoredChoice(
    ESTIMATED_NOTICE_KEY,
    ESTIMATED_NOTICE_STATES,
    'shown',
  );
  const navigate = useNavigate();
  const summary = useSummary();
  const holdings = useHoldings();
  const needsAction = useNeedsAction();

  if (summary.isLoading || holdings.isLoading) return <Spinner label={t('dashboard.loading')} />;
  if (summary.error || !summary.data || !holdings.data) {
    return <Banner tone="error">{t('dashboard.loadFailed')}</Banner>;
  }

  const s = summary.data;
  const base = s.baseCurrency;

  const holdingColumns: Column<HoldingRow>[] = [
    {
      key: 'symbol',
      header: t('common.symbol'),
      sortable: true,
      width: 110,
      render: (r) => {
        const currency =
          r.kind === 'stock' ? r.stock.currency : r.kind === 'option' ? r.option.currency : r.closed.currency;
        const badges = [
          r.kind === 'option' && <Badge key="option" label={t('dashboard.option')} tone="info" />,
          r.kind === 'stock' && r.stock.side === 'SHORT' && (
            <Badge key="short" label={t('stock.sideShort')} tone="warning" />
          ),
          r.kind === 'closed' && <Badge key="closed" label={t('dashboard.closed')} />,
          currency !== base && <Badge key="currency" label={currency} tone="secondary" />,
        ].filter(Boolean);
        return (
          <Col gap={0.5} align="start">
            <Text>
              {r.kind === 'stock'
                ? r.stock.symbol
                : r.kind === 'option'
                  ? r.option.description
                  : r.closed.symbol}
            </Text>
            {badges.length > 0 && <Row gap={1}>{badges}</Row>}
          </Col>
        );
      },
    },
    {
      key: 'quantity',
      header: t('common.quantity'),
      align: 'right',
      render: (r) =>
        r.kind === 'closed'
          ? formatQuantity('0')
          : r.kind === 'stock'
            ? formatQuantity(r.stock.quantity)
            : `${r.option.side === 'SHORT' ? '−' : '+'}${formatQuantity(r.option.contracts)}`,
    },
    {
      key: 'avg',
      header: t('dashboard.averagePrice'),
      align: 'right',
      render: (r) =>
        r.kind === 'closed'
          ? '—'
          : r.kind === 'stock'
            ? formatMoney(r.stock.averagePrice, r.stock.currency, 4)
            : formatMoney(r.option.averagePremium, r.option.currency, 4),
    },
    {
      key: 'price',
      header: t('common.price'),
      align: 'right',
      render: (r) => {
        if (r.kind === 'closed') return '—';
        const [price, currency] =
          r.kind === 'stock' ? [r.stock.price, r.stock.currency] : [r.option.mark, r.option.currency];
        return (
          <Row gap={1} justify="end">
            <Text inline>{formatMoney(price, currency)}</Text>
            {r.kind === 'stock'
              ? r.stock.priceEstimated && <PriceWarning asOf={r.stock.priceAsOf} />
              : r.option.markEstimated && <MarkWarning mark={r.option} />}
          </Row>
        );
      },
    },
    {
      key: 'dayChange',
      header: t('common.dayChange'),
      align: 'right',
      sortable: true,
      render: (r) =>
        r.kind === 'closed' ? (
          '—'
        ) : r.kind === 'stock' ? (
          <DayChange change={r.stock.dayChange} currency={r.stock.currency} />
        ) : (
          <DayChange change={r.option.dayChange} currency={r.option.currency} />
        ),
    },
    {
      key: 'totalPl',
      header: t('common.totalPl'),
      align: 'right',
      sortable: true,
      render: (r) =>
        r.kind === 'stock' ? (
          <DayChange change={r.stock.totalPl} currency={r.stock.currency} />
        ) : r.kind === 'option' ? (
          <DayChange change={r.option.totalPl} currency={r.option.currency} />
        ) : (
          <DayChange change={r.closed.totalPl} currency={r.closed.currency} />
        ),
    },
    {
      key: 'value',
      header: t('common.value'),
      align: 'right',
      sortable: true,
      render: (r) =>
        r.kind === 'closed'
          ? '—'
          : r.kind === 'stock'
            ? formatMoney(r.stock.marketValue, r.stock.currency)
            : formatMoney(r.option.marketValue, r.option.currency),
    },
    {
      key: 'unrealized',
      header: t('common.unrealized'),
      align: 'right',
      sortable: true,
      render: (r) => {
        if (r.kind === 'closed') return '—';
        const [unrealized, currency] =
          r.kind === 'stock'
            ? [r.stock.unrealized, r.stock.currency]
            : [r.option.unrealized, r.option.currency];
        return (
          <Text inline tone={toneOf(unrealized)}>
            {formatSignedMoney(unrealized, currency)}
          </Text>
        );
      },
    },
    {
      key: 'realized',
      header: t('common.realized'),
      align: 'right',
      render: (r) => {
        const [realized, currency] =
          r.kind === 'stock'
            ? [r.stock.realized, r.stock.currency]
            : r.kind === 'option'
              ? [r.option.realized, r.option.currency]
              : [r.closed.realized, r.closed.currency];
        return (
          <Text inline tone={toneOf(realized)}>
            {formatSignedMoney(realized, currency)}
          </Text>
        );
      },
    },
    {
      key: 'weight',
      header: t('dashboard.weight'),
      align: 'right',
      sortable: true,
      render: (r) =>
        r.kind === 'closed' ? '—' : formatPercent(r.kind === 'stock' ? r.stock.weight : r.option.weight, 1),
    },
  ];

  return (
    <Col gap={3}>
      <Text variant="title">{t('dashboard.title')}</Text>

      {s.counts.accounts === 0 && (
        <Banner
          tone="warning"
          title={t('dashboard.noAccountsTitle')}
          action={
            <Button variant="text" onClick={() => void navigate('/settings?tab=accounts')}>
              {t('dashboard.noAccountsAction')}
            </Button>
          }
        >
          {t('dashboard.noAccountsText')}
        </Banner>
      )}

      {needsAction.data && needsAction.data.items.length > 0 && (
        <Banner
          tone="warning"
          title={t('dashboard.needsActionTitle')}
          action={
            <Button variant="text" onClick={() => void navigate('/options')}>
              {t('dashboard.needsActionReview')}
            </Button>
          }
        >
          {t('dashboard.needsActionText', { count: needsAction.data.items.length })}
        </Banner>
      )}

      {s.hasEstimatedValues && estimatedNotice === 'shown' && (
        <Banner tone="info" onClose={() => setEstimatedNotice('dismissed')}>
          {t('dashboard.estimatedValues')}
        </Banner>
      )}

      <Row gap={2} wrap>
        <StatTile
          label={t('dashboard.portfolioValue')}
          value={formatMoney(s.positionsValue, base)}
          sub={t('dashboard.portfolioValueSub', { date: s.asOf })}
        />
        <StatTile
          label={t('dashboard.dayChange')}
          value={
            s.dayChange.percent == null
              ? formatSignedMoney(s.dayChange.amount, base)
              : t('common.changeWithPercent', {
                  change: formatSignedMoney(s.dayChange.amount, base),
                  percent: formatPercent(s.dayChange.percent),
                })
          }
          tone={toneOf(s.dayChange.amount)}
          sub={t('dashboard.dayChangeSub')}
        />
        <TotalReturnTile summary={s} />
        <OptionPnlTile summary={s} />
      </Row>

      <PortfolioChart />

      <HoldingsCard holdingColumns={holdingColumns} />
    </Col>
  );
}
