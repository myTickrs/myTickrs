import {
  Badge,
  Banner,
  Button,
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
import { MarkWarning } from '../../features/PriceWarning.js';
import { t as translate, useT } from '../../i18n.js';
import type { OptionPosition } from '../../lib/api.js';
import {
  formatDate,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  joinList,
  rightLabel,
  toneOf,
} from '../../lib/format.js';
import { useStoredChoice } from '../../lib/preferences.js';
import { useOptionPositions } from '../../lib/queries.js';

const coverageLabel = (status: string): string =>
  status === 'COVERED' || status === 'NAKED' || status === 'PARTIAL'
    ? translate(`options.coverage${status}`)
    : status.toLowerCase();

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

export interface PositionActions {
  mark(position: OptionPosition): void;
  roll(position: OptionPosition): void;
  close(position: OptionPosition): void;
  edit(position: OptionPosition): void;
  remove(position: OptionPosition): void;
  removing: boolean;
}

export function OpenPositions({
  positions,
  loading,
  actions,
}: {
  positions: OptionPosition[];
  loading: boolean;
  actions: PositionActions;
}) {
  const t = useT();
  const [groupBy, setGroupBy] = useStoredChoice<GroupBy>(GROUP_BY_KEY, GROUP_BY_VALUES, 'contract');

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
              onClick={() => actions.mark(o)}
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
              onClick={() => actions.roll(o)}
              aria-label={t('options.rollFor', { description: o.description })}
            >
              {t('options.roll')}
            </Button>
            <Button
              variant="text"
              onClick={() => actions.close(o)}
              aria-label={t('options.closeFor', { description: o.description })}
            >
              {t('options.close')}
            </Button>
          </Row>
          <Row gap={0} justify="end">
            <Button
              variant="text"
              onClick={() => actions.edit(o)}
              aria-label={t('options.editFor', { description: o.description })}
            >
              {t('common.edit')}
            </Button>
            <Button
              variant="text"
              tone="danger"
              disabled={actions.removing}
              onClick={() => actions.remove(o)}
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

  if (loading) return <Spinner label={t('options.loadingPositions')} />;
  return (
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
          rows={accountRows(positions)}
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
          rows={positions}
          rowKey={(o) => o.contractId}
          empty={t('options.noOpenPositions')}
        />
      )}
    </Card>
  );
}
