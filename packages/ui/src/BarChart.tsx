import { useTheme } from '@mui/material/styles';
import {
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useState } from 'react';
import { DataTable, type Column } from './DataTable.js';
import { useT } from './messages.js';
import { Button, Col, Row, Text } from './primitives.js';

export interface BarPoint {
  label: string;
  value: number;
  cumulative?: number;
}

export interface BarChartProps {
  data: BarPoint[];
  format(value: number): string;
  caption: string;
  height?: number;
  cumulativeLabel?: string;
  empty?: string;
}

export function BarChart({ data, format, caption, height = 260, cumulativeLabel, empty }: BarChartProps) {
  const theme = useTheme();
  const t = useT();
  const [showTable, setShowTable] = useState(false);
  if (data.length === 0) return <Text muted>{empty ?? t('chart.nothingToChart')}</Text>;

  const columns: Column<BarPoint>[] = [
    { key: 'label', header: t('chart.period'), render: (r) => r.label },
    { key: 'value', header: t('chart.amount'), align: 'right', render: (r) => format(r.value) },
    ...(cumulativeLabel
      ? [
          {
            key: 'cumulative',
            header: cumulativeLabel,
            align: 'right' as const,
            render: (r: BarPoint) => (r.cumulative == null ? '—' : format(r.cumulative)),
          },
        ]
      : []),
  ];

  return (
    <Col gap={1}>
      <Row justify="between">
        <Text variant="caption" muted>
          {caption}
        </Text>
        <Button variant="text" onClick={() => setShowTable(!showTable)}>
          {showTable ? t('chart.viewAsChart') : t('chart.viewAsTable')}
        </Button>
      </Row>
      {showTable ? (
        <DataTable caption={caption} columns={columns} rows={data} rowKey={(r) => r.label} />
      ) : (
        <div role="img" aria-label={caption} style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={theme.palette.divider} vertical={false} />
              <XAxis dataKey="label" stroke={theme.palette.text.secondary} fontSize={12} />
              <YAxis stroke={theme.palette.text.secondary} fontSize={12} tickFormatter={format} width={80} />
              <Tooltip
                formatter={(value) => format(Number(value ?? 0))}
                contentStyle={{
                  background: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 8,
                  color: theme.palette.text.primary,
                }}
              />
              <Legend />
              <Bar dataKey="value" name={t('chart.realized')} radius={[4, 4, 0, 0]}>
                {data.map((point) => (
                  <Cell
                    key={point.label}
                    fill={point.value >= 0 ? theme.palette.success.main : theme.palette.error.main}
                  />
                ))}
              </Bar>
              {cumulativeLabel && (
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  name={cumulativeLabel}
                  stroke={theme.palette.primary.main}
                  strokeWidth={2}
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Col>
  );
}
