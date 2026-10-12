import { MenuSelect, Row, StatTile } from '@tickrs/ui';
import { t as translate, useT } from '../../i18n.js';
import { formatMoney, formatPercent, formatSignedMoney, toneOf } from '../../lib/format.js';
import { useStoredChoice } from '../../lib/preferences.js';
import type { PortfolioSummary } from '../../lib/queries.js';

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

export function SummaryTiles({ summary: s }: { summary: PortfolioSummary }) {
  const t = useT();
  const base = s.baseCurrency;
  return (
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
  );
}
