import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import {
  Badge,
  Banner,
  Button,
  Card,
  Col,
  type Column,
  DataTable,
  Row,
  SegmentedControl,
  Spinner,
  StatTile,
  Text,
} from '@tickrs/ui';
import { TimeSeriesChart, type ChartMarkerInput, type ChartPriceLine } from '@tickrs/ui';
import {
  formatDate,
  formatMoney,
  formatMoneyWithCode,
  formatPercent,
  formatQuantity,
  formatSignedMoney,
  toneOf,
  typeLabel,
} from '../lib/format.js';
import { DeleteTransactionDialog, useDeleteTransaction } from '../features/DeleteTransactionDialog.js';
import { EditTransactionDialog, whyNotEditable } from '../features/EditTransactionDialog.js';
import { rangeOptions } from '../features/PortfolioChart.js';
import { PriceWarning } from '../features/PriceWarning.js';
import { TransactionDialog } from '../features/TransactionDialog.js';
import { useT } from '../i18n.js';
import { api, errorText, type Transaction } from '../lib/api.js';
import { useAccounts, useStockChart, type Range, type StockChartResponse } from '../lib/queries.js';

type TradeRow = StockChartResponse['markers'][number] & { key: string };

export function StockDetailPage() {
  const t = useT();
  const { symbol = '' } = useParams();
  const [range, setRange] = useState<Range>('1Y');
  const chart = useStockChart(symbol, range);
  const accounts = useAccounts();
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dateOrder, setDateOrder] = useState<'asc' | 'desc'>('desc');
  const remove = useDeleteTransaction(setMessage);

  const startEdit = async (id: string) => {
    setMessage(null);
    setLoading(id);
    try {
      setEditing(await api.get<Transaction>(`/transactions/${id}`));
    } catch (error) {
      setMessage(errorText(error, t('stock.loadTransactionFailed')));
    } finally {
      setLoading(null);
    }
  };

  const series = useMemo(
    () => [
      {
        id: 'close',
        label: t('stock.close', { symbol }),
        kind: 'line' as const,
        data: (chart.data?.bars ?? []).map((b) => ({ date: b.date, value: Number(b.close) })),
      },
    ],
    [chart.data, symbol, t],
  );

  const markers = useMemo<ChartMarkerInput[]>(
    () =>
      (chart.data?.markers ?? []).map((m) => ({
        date: m.date,
        position: m.kind === 'SELL' ? 'above' : 'below',
        shape: m.kind === 'BUY' ? 'arrowUp' : m.kind === 'SELL' ? 'arrowDown' : 'circle',
        tone: m.kind === 'BUY' ? 'positive' : m.kind === 'SELL' ? 'negative' : 'neutral',
        text: m.label,
      })),
    [chart.data],
  );

  const priceLines = useMemo<ChartPriceLine[]>(() => {
    const lines: ChartPriceLine[] = [];
    const position = chart.data?.position;
    if (position?.averagePrice) {
      lines.push({
        value: Number(position.averagePrice),
        label: t('stock.averagePriceLine'),
        dashed: true,
      });
    }
    for (const strike of chart.data?.strikes ?? []) {
      lines.push({
        value: Number(strike.price),
        label: t('stock.strikeLine', {
          side: strike.side === 'SHORT' ? t('stock.sideShort') : t('stock.sideLong'),
          price: strike.price,
          date: formatDate(strike.expiration),
        }),
        dashed: true,
      });
    }
    return lines;
  }, [chart.data, t]);

  if (chart.isLoading) return <Spinner label={t('stock.loading', { symbol })} />;
  if (chart.error || !chart.data) return <Banner tone="error">{t('stock.loadFailed', { symbol })}</Banner>;

  const { currency, position, quote } = chart.data;
  const format = (v: number) => formatMoney(String(v), currency);

  const tradeColumns: Column<TradeRow>[] = [
    {
      key: 'date',
      header: t('common.date'),
      nowrap: true,
      sortable: true,
      render: (m) => formatDate(m.date),
    },
    {
      key: 'action',
      header: t('stock.action'),
      render: (m) => (
        <Row gap={1}>
          {m.kind === 'OPTION' ? (
            <Text inline>{m.label}</Text>
          ) : (
            <Badge label={typeLabel(m.type)} tone={m.kind === 'BUY' ? 'positive' : 'negative'} />
          )}
          {m.isSystemGenerated && <Badge label={t('common.auto')} title={t('common.autoSystemTitle')} />}
        </Row>
      ),
    },
    { key: 'account', header: t('common.account'), render: (m) => m.accountName },
    { key: 'quantity', header: t('common.qty'), align: 'right', render: (m) => formatQuantity(m.quantity) },
    {
      key: 'price',
      header: t('common.price'),
      align: 'right',
      render: (m) => formatMoney(m.price, currency),
    },
    {
      key: 'value',
      header: t('stock.totalValue'),
      align: 'right',
      nowrap: true,
      render: (m) => formatMoneyWithCode(m.value, m.currency),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => (
        <Row gap={0} justify="end">
          <Button
            variant="text"
            disabled={whyNotEditable(m) != null || loading != null}
            onClick={() => void startEdit(m.transactionId)}
          >
            {t('common.edit')}
          </Button>
          <Button
            variant="text"
            tone="danger"
            disabled={m.isSystemGenerated || remove.busy}
            onClick={() => void remove.ask(m.transactionId)}
          >
            {t('common.delete')}
          </Button>
        </Row>
      ),
    },
  ];

  const session = (
    [
      [t('stock.open'), quote?.open],
      [t('stock.high'), quote?.high],
      [t('stock.low'), quote?.low],
      [t('stock.previousClose'), quote?.previousClose],
    ] as const
  ).filter((entry): entry is readonly [string, string] => entry[1] != null);

  return (
    <Col gap={3}>
      <Row justify="between" wrap>
        <Col gap={0}>
          <Row gap={2} align="baseline" wrap>
            <Text variant="title">{chart.data.symbol}</Text>
            {position?.side === 'SHORT' && <Badge label={t('stock.sideShort')} tone="warning" />}
            {quote && (
              <>
                <Text variant="title">{formatMoney(quote.price, currency)}</Text>
                {quote.change != null && (
                  <Text inline tone={toneOf(quote.change)}>
                    {t('common.changeWithPercent', {
                      change: formatSignedMoney(quote.change, currency),
                      percent: formatPercent(quote.changePct),
                    })}
                  </Text>
                )}
                {quote.estimated && <PriceWarning asOf={quote.date} />}
              </>
            )}
          </Row>
          <Text muted>
            {chart.data.name} · {currency}
          </Text>
          {session.length > 0 && (
            <Text muted>
              {session.map(([label, value]) => `${label} ${formatMoney(value, currency)}`).join(' · ')}
            </Text>
          )}
        </Col>
        <SegmentedControl
          label={t('common.range')}
          value={range}
          onChange={(v) => setRange(v as Range)}
          options={rangeOptions()}
        />
      </Row>

      {position && (
        <Row gap={2} wrap>
          <StatTile label={t('stock.shares')} value={formatQuantity(position.shares)} />
          {Number(position.shares) !== 0 && (
            <StatTile
              label={t('stock.dayChange')}
              value={formatSignedMoney(position.dayChange, currency)}
              tone={toneOf(position.dayChange)}
              sub={
                position.dayChange != null && quote?.change != null
                  ? t('stock.dayChangeSub', { change: formatSignedMoney(quote.change, currency) })
                  : t('stock.noPreviousClose')
              }
            />
          )}
          <StatTile label={t('stock.averagePrice')} value={formatMoney(position.averagePrice, currency, 4)} />
          <StatTile
            label={t('common.realized')}
            value={formatSignedMoney(position.realized, currency)}
            tone={toneOf(position.realized)}
          />
          <StatTile label={t('stock.dividends')} value={formatSignedMoney(position.dividends, currency)} />
          {Number(position.shortCosts) !== 0 && (
            <StatTile
              label={t('stock.shortCosts')}
              value={formatSignedMoney(position.shortCosts, currency)}
              tone={toneOf(position.shortCosts)}
            />
          )}
        </Row>
      )}

      {chart.data.pendingHistory && <Banner tone="info">{t('stock.pendingHistory')}</Banner>}

      <Card
        title={t('stock.priceAndTrades')}
        action={
          <Row gap={1} wrap>
            <Badge label={t('stock.legendBuy')} tone="positive" />
            <Badge label={t('stock.legendSell')} tone="negative" />
            <Badge label={t('stock.legendOption')} />
          </Row>
        }
      >
        <TimeSeriesChart
          caption={t('stock.chartCaption', { symbol })}
          series={series}
          markers={markers}
          priceLines={priceLines}
          format={format}
          height={340}
          empty={t('stock.noHistory')}
        />
      </Card>

      {message && <Banner tone="error">{message}</Banner>}

      <Card
        title={t('stock.tradesInRange')}
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t('transactions.add')}
          </Button>
        }
      >
        <DataTable
          caption={t('stock.tradesCaption', { symbol })}
          columns={tradeColumns}
          rows={chart.data.markers
            .map((m) => ({ ...m, key: m.transactionId }))
            .toSorted((a, b) => (dateOrder === 'asc' ? 1 : -1) * a.date.localeCompare(b.date))}
          rowKey={(m) => m.key}
          sort={{ key: 'date', direction: dateOrder }}
          onSortChange={() => setDateOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
          empty={t('stock.noTrades')}
        />
      </Card>

      <EditTransactionDialog
        key={editing?.id ?? 'none'}
        transaction={editing}
        accounts={accounts.data?.items ?? []}
        onClose={() => setEditing(null)}
      />

      <TransactionDialog
        key={`add-${chart.data.symbol}-${position?.side ?? 'flat'}`}
        open={adding}
        onClose={() => setAdding(false)}
        accounts={accounts.data?.items ?? []}
        defaultSymbol={chart.data.symbol}
        defaultType={position?.side === 'SHORT' ? 'BUY_TO_COVER' : 'BUY'}
      />

      <DeleteTransactionDialog {...remove.dialogProps} />
    </Col>
  );
}
