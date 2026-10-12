import { useNavigate } from 'react-router';
import { Banner, Button, Col, Spinner, Text } from '@tickrs/ui';
import { PortfolioChart } from '../features/PortfolioChart.js';
import { useT } from '../i18n.js';
import { useStoredChoice } from '../lib/preferences.js';
import { useHoldings, useNeedsAction, useSummary } from '../lib/queries.js';
import { HoldingsCard } from './dashboard/HoldingsCard.js';
import { SummaryTiles } from './dashboard/SummaryTiles.js';

const ESTIMATED_NOTICE_KEY = 'tickrs.dashboard.estimatedNotice';
const ESTIMATED_NOTICE_STATES = ['shown', 'dismissed'] as const;

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

      <SummaryTiles summary={s} />

      <PortfolioChart />

      <HoldingsCard baseCurrency={base} />
    </Col>
  );
}
