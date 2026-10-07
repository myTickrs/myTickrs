import { useMemo, useState } from 'react';
import { Badge, Banner, Card, Col, Row, SegmentedControl, Select, Spinner } from '@tickrs/ui';
import { TimeSeriesChart, type ChartSeries } from '@tickrs/ui';
import { formatMoney, formatPercent, joinList } from '../lib/format.js';
import { usePerformance, type Range } from '../lib/queries.js';
import { t as translate, useT } from '../i18n.js';

export const rangeOptions = (): { value: Range; label: string }[] =>
  (['1M', '3M', 'YTD', '1Y', '5Y', 'ALL'] as const).map((value) => ({
    value,
    label: translate(`ranges.${value}`),
  }));

const benchmarkOptions = () => [
  { value: '', label: translate('performance.noBenchmark') },
  { value: 'SPY', label: translate('performance.benchmarkSPY') },
  { value: 'QQQ', label: translate('performance.benchmarkQQQ') },
  { value: 'VTI', label: translate('performance.benchmarkVTI') },
];

export function PortfolioChart({ accountId }: { accountId?: string }) {
  const t = useT();
  const [range, setRange] = useState<Range>('1M');
  const [mode, setMode] = useState<'value' | 'return'>('value');
  const [benchmark, setBenchmark] = useState('');
  const performance = usePerformance({ range, accountId, benchmark: benchmark || undefined });

  const series = useMemo<ChartSeries[]>(() => {
    const points = performance.data?.points ?? [];
    if (mode === 'value') {
      return [
        {
          id: 'value',
          label: t('performance.portfolioValue'),
          kind: 'area',
          data: points.map((p) => ({ date: p.date, value: Number(p.positionsValue) })),
        },
      ];
    }
    const mine: ChartSeries = {
      id: 'twr',
      label: t('performance.myReturn'),
      kind: 'line',
      data: points.map((p) => ({ date: p.date, value: Number(p.twrIndex) - 1 })),
    };
    const comparison = performance.data?.benchmark;
    return comparison && comparison.points.length > 0
      ? [
          mine,
          {
            id: 'benchmark',
            label: comparison.symbol,
            kind: 'line',
            tone: 'muted',
            data: comparison.points.map((p) => ({ date: p.date, value: Number(p.return) })),
          },
        ]
      : [mine];
  }, [performance.data, mode, t]);

  const base = performance.data?.baseCurrency ?? 'USD';
  const format = useMemo(
    () =>
      mode === 'value'
        ? (v: number) => formatMoney(String(v), base, 0)
        : (v: number) => formatPercent(String(v), 1),
    [mode, base],
  );

  return (
    <Card
      title={t('performance.title')}
      action={
        <Row gap={1} wrap>
          <SegmentedControl
            label={t('performance.show')}
            value={mode}
            onChange={(v) => setMode(v === 'return' ? 'return' : 'value')}
            options={[
              { value: 'value', label: t('performance.value') },
              { value: 'return', label: t('performance.return') },
            ]}
          />
          <SegmentedControl
            label={t('common.range')}
            value={range}
            onChange={(v) => setRange(v as Range)}
            options={rangeOptions()}
          />
        </Row>
      }
    >
      <Col gap={1}>
        {mode === 'return' && (
          <Row gap={1} wrap>
            <Select
              label={t('performance.compareWith')}
              value={benchmark}
              onChange={setBenchmark}
              options={benchmarkOptions()}
            />
            {benchmark && performance.data?.benchmark?.points.length === 0 && (
              <Badge
                label={t('performance.noDataYet')}
                tone="warning"
                title={t('performance.noDataYetTitle')}
              />
            )}
          </Row>
        )}

        {performance.isLoading ? (
          <Spinner label={t('performance.building')} />
        ) : (
          <TimeSeriesChart
            caption={mode === 'value' ? t('performance.valueCaption') : t('performance.returnCaption')}
            series={series}
            format={format}
            empty={t('performance.empty')}
          />
        )}

        {(performance.data?.pendingSymbols?.length ?? 0) > 0 && (
          <Banner tone="info">
            {t('performance.pendingHistory', { symbols: joinList(performance.data?.pendingSymbols ?? []) })}
          </Banner>
        )}
      </Col>
    </Card>
  );
}
