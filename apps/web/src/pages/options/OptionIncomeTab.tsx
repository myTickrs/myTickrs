import { BarChart, Card, Col, Row, StatTile, Text } from '@tickrs/ui';
import { useT } from '../../i18n.js';
import { formatMoney, formatPercent, formatSignedMoney, toneOf } from '../../lib/format.js';
import type { OptionIncome } from '../../lib/queries.js';

export function OptionIncomeTab({ income }: { income: OptionIncome }) {
  const t = useT();
  const base = income.baseCurrency;
  return (
    <Col gap={2}>
      <Row gap={2} wrap>
        <StatTile label={t('options.premiumAtRisk')} value={formatMoney(income.openPremium, base)} />
        {income.months.slice(-3).map((m) => (
          <StatTile
            key={m.month}
            label={m.month}
            value={formatSignedMoney(m.realized, base)}
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
          data={income.months.map((m, i) => ({
            label: m.month,
            value: Number(m.realized),
            cumulative: income.months
              .slice(0, i + 1)
              .reduce((total, month) => total + Number(month.realized), 0),
          }))}
          cumulativeLabel={t('options.cumulative')}
          format={(v) => formatMoney(String(v), base, 0)}
        />
      </Card>

      <Card title={t('options.byUnderlying')}>
        <Col gap={1}>
          {Object.entries(income.byUnderlying).map(([symbol, { realized, currency }]) => (
            <Row key={symbol} justify="between">
              <Text>{symbol}</Text>
              <Text tone={toneOf(realized)}>{formatSignedMoney(realized, currency)}</Text>
            </Row>
          ))}
          {Object.keys(income.byUnderlying).length === 0 && <Text muted>{t('options.noClosed')}</Text>}
        </Col>
      </Card>
    </Col>
  );
}
