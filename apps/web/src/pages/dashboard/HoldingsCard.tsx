import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Badge,
  Banner,
  Card,
  Col,
  DataTable,
  ExpandableTable,
  IconMenu,
  Row,
  Spinner,
  Text,
  type Column,
} from '@tickrs/ui';
import { DayChange } from '../../features/DayChange.js';
import { MarkWarning, PriceWarning } from '../../features/PriceWarning.js';
import { t as translate, useT } from '../../i18n.js';
import { formatMoney, formatPercent, formatQuantity, formatSignedMoney, toneOf } from '../../lib/format.js';
import { useStoredChoice } from '../../lib/preferences.js';
import { type AccountHolding, useHoldings, useHoldingsByAccount } from '../../lib/queries.js';
import {
  holdingHref,
  holdingKey,
  holdingRows,
  type HoldingRow,
  type HoldingSort,
  nextSort,
  SORT_KEYS,
  type SortKey,
} from './holdings.js';

type GroupBy = 'symbol' | 'account';
const GROUP_BY_KEY = 'tickrs.dashboard.holdingsGroupBy';
const GROUP_BY_VALUES: GroupBy[] = ['symbol', 'account'];
const groupByOptions = (): { value: GroupBy; label: string }[] => [
  { value: 'symbol', label: translate('dashboard.groupBySymbol') },
  { value: 'account', label: translate('dashboard.groupByAccount') },
];

function useHoldingColumns(base: string): Column<HoldingRow>[] {
  const t = useT();
  return [
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
}

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

export function HoldingsCard({ baseCurrency }: { baseCurrency: string }) {
  const t = useT();
  const holdingColumns = useHoldingColumns(baseCurrency);
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = useStoredChoice<GroupBy>(GROUP_BY_KEY, GROUP_BY_VALUES, 'symbol');
  const cardRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useSearchParams();
  const requestedGroupBy = search.get('groupBy');
  useEffect(() => {
    if (!GROUP_BY_VALUES.includes(requestedGroupBy as GroupBy)) return;
    setGroupBy(requestedGroupBy as GroupBy);
    setSearch({}, { replace: true });
    cardRef.current?.scrollIntoView({ block: 'start' });
  }, [requestedGroupBy, setGroupBy, setSearch]);
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
    {
      key: 'totalPl',
      header: t('common.totalPl'),
      align: 'right',
      render: (r) => (
        <Text inline tone={toneOf(r.totalPl)}>
          {formatSignedMoney(r.totalPl, r.currency)}
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
    <div ref={cardRef}>
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
    </div>
  );
}
