import { useTheme } from '@mui/material/styles';
import {
  AreaSeries,
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { currentLocale } from './i18n.js';
import { useT } from './messages.js';
import { Button, Col, Row, Text } from './primitives.js';
import { DataTable, type Column } from './DataTable.js';

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface ChartSeries {
  id: string;
  label: string;
  data: SeriesPoint[];
  kind?: 'area' | 'line';
  tone?: 'primary' | 'muted' | 'positive' | 'negative';
  dashed?: boolean;
}

export interface ChartMarkerInput {
  date: string;
  position: 'above' | 'below';
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  tone: 'positive' | 'negative' | 'neutral';
  text: string;
}

export interface ChartPriceLine {
  value: number;
  label: string;
  dashed?: boolean;
}

export interface TimeSeriesChartProps {
  series: ChartSeries[];
  markers?: ChartMarkerInput[];
  priceLines?: ChartPriceLine[];
  height?: number;
  format(value: number): string;
  caption: string;
  empty?: string;
}

const toTime = (date: string): UTCTimestamp => (Date.parse(`${date}T00:00:00Z`) / 1000) as UTCTimestamp;

export function TimeSeriesChart({
  series,
  markers = [],
  priceLines = [],
  height = 280,
  format,
  caption,
  empty,
}: TimeSeriesChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const t = useT();
  const theme = useTheme();
  const [showTable, setShowTable] = useState(false);
  const hasData = series.some((s) => s.data.length > 0);

  useEffect(() => {
    const element = container.current;
    if (!element || !hasData || showTable) return;

    const colors = {
      primary: theme.palette.primary.main,
      muted: theme.palette.text.secondary,
      positive: theme.palette.success.main,
      negative: theme.palette.error.main,
    };

    const chart: IChartApi = createChart(element, {
      height,
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: theme.palette.text.secondary,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: theme.palette.divider },
        horzLines: { color: theme.palette.divider },
      },
      rightPriceScale: { borderColor: theme.palette.divider },
      timeScale: { borderColor: theme.palette.divider, timeVisible: false },
      localization: { locale: currentLocale(), priceFormatter: format },
      crosshair: { mode: 1 },
    });

    const apis: ISeriesApi<'Area' | 'Line'>[] = [];
    for (const s of series) {
      const color = colors[s.tone ?? 'primary'];
      const api =
        s.kind === 'area'
          ? chart.addSeries(AreaSeries, {
              lineColor: color,
              topColor: `${color}55`,
              bottomColor: `${color}05`,
              lineWidth: 2,
              title: s.label,
            })
          : chart.addSeries(LineSeries, {
              color,
              lineWidth: 2,
              lineStyle: s.dashed ? 2 : 0,
              title: s.label,
            });
      api.setData(s.data.map((p) => ({ time: toTime(p.date), value: p.value })));
      apis.push(api);
    }

    const main = apis[0];
    if (main && markers.length > 0) {
      const markerColors = { positive: colors.positive, negative: colors.negative, neutral: colors.muted };
      createSeriesMarkers(
        main,
        markers
          .map((m): SeriesMarker<Time> => ({
            time: toTime(m.date),
            position: m.position === 'above' ? 'aboveBar' : 'belowBar',
            shape: m.shape,
            color: markerColors[m.tone],
            text: m.text,
          }))
          .toSorted((a, b) => (a.time as number) - (b.time as number)),
      );
    }
    if (main) {
      for (const line of priceLines) {
        main.createPriceLine({
          price: line.value,
          color: theme.palette.text.secondary,
          lineWidth: 1,
          lineStyle: line.dashed ? 2 : 0,
          axisLabelVisible: true,
          title: line.label,
        });
      }
    }

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series, markers, priceLines, height, format, theme, hasData, showTable]);

  if (!hasData) return <Text muted>{empty ?? t('chart.noDataForRange')}</Text>;

  const tableColumns: Column<SeriesPoint & { label: string }>[] = [
    { key: 'date', header: t('chart.date'), render: (r) => r.date },
    { key: 'series', header: t('chart.series'), render: (r) => r.label },
    { key: 'value', header: t('chart.value'), align: 'right', render: (r) => format(r.value) },
  ];
  const tableRows = series.flatMap((s) => s.data.map((p) => ({ ...p, label: s.label })));

  return (
    <Col gap={1}>
      <Row justify="between">
        <Row gap={2} wrap>
          {series.map((s) => (
            <Text key={s.id} variant="caption" muted>
              {s.label}
            </Text>
          ))}
        </Row>
        <Button variant="text" onClick={() => setShowTable(!showTable)}>
          {showTable ? t('chart.viewAsChart') : t('chart.viewAsTable')}
        </Button>
      </Row>
      {showTable ? (
        <DataTable
          caption={caption}
          columns={tableColumns}
          rows={tableRows.slice(-200)}
          rowKey={(r) => `${r.label}-${r.date}`}
        />
      ) : (
        <div ref={container} style={{ height }} role="img" aria-label={caption} />
      )}
    </Col>
  );
}
