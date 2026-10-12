import { lazy, Suspense } from 'react';
import { t } from './messages.js';
import { Spinner } from './primitives.js';
import type { BarChartProps } from './BarChart.js';
import type { TimeSeriesChartProps } from './TimeSeriesChart.js';

export type {
  ChartMarkerInput,
  ChartPriceLine,
  ChartSeries,
  SeriesPoint,
  TimeSeriesChartProps,
} from './TimeSeriesChart.js';
export type { BarPoint, BarChartProps } from './BarChart.js';

const LazyTimeSeries = lazy(async () => ({
  default: (await import('./TimeSeriesChart.js')).TimeSeriesChart,
}));

const LazyBar = lazy(async () => ({ default: (await import('./BarChart.js')).BarChart }));

export function TimeSeriesChart(props: TimeSeriesChartProps) {
  return (
    <Suspense fallback={<Spinner label={t('chart.drawing')} />}>
      <LazyTimeSeries {...props} />
    </Suspense>
  );
}

export function BarChart(props: BarChartProps) {
  return (
    <Suspense fallback={<Spinner label={t('chart.drawing')} />}>
      <LazyBar {...props} />
    </Suspense>
  );
}
