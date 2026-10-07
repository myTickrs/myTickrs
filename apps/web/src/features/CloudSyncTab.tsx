import type { CloudSyncSession, SignInProvider, SyncComparison, SyncDirection } from '@tickrs/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, Col, Dialog, Row, Spinner, Text } from '@tickrs/ui';
import { t as translate, useT } from '../i18n.js';
import { errorText, serverText } from '../lib/api.js';
import { describeCounts, formatDateTime } from '../lib/format.js';
import {
  useCancelCloudSync,
  useCloudSyncSession,
  useCloudSyncSettings,
  useConfirmCloudSync,
  useStartCloudSync,
} from '../lib/queries.js';
import { openSignInTab } from '../lib/sign-in-tab.js';

const PROVIDER_NAMES: Record<SignInProvider, string> = { google: 'Google', microsoft: 'Microsoft' };

const WARNINGS: Record<
  SyncDirection,
  { title: () => string; text: (cloud: string) => string; button: () => string }
> = {
  'to-cloud': {
    title: () => translate('sync.toCloudTitle'),
    text: (cloud) => translate('sync.toCloudText', { cloud }),
    button: () => translate('sync.toCloud'),
  },
  'from-cloud': {
    title: () => translate('sync.fromCloudTitle'),
    text: (cloud) => translate('sync.fromCloudText', { cloud }),
    button: () => translate('sync.fromCloud'),
  },
};

const UNDER_WAY = new Set<CloudSyncSession['status']>([
  'awaiting-sign-in',
  'comparing',
  'awaiting-confirm',
  'running',
]);

export function CloudSyncTab() {
  const t = useT();
  const settings = useCloudSyncSettings();
  const start = useStartCloudSync();
  const cancel = useCancelCloudSync();
  const confirm = useConfirmCloudSync();
  const [choosingProvider, setChoosingProvider] = useState(false);
  const [warning, setWarning] = useState<SyncDirection | null>(null);
  const [sessionId, setSessionId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const session = useCloudSyncSession(sessionId).data;
  const client = useQueryClient();
  const done = session?.status === 'done';
  const replacedHere = session?.direction === 'from-cloud' && done;
  const justSignedIn = session?.account != null && session.status === 'awaiting-confirm';

  useEffect(() => {
    if (replacedHere) void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'cloud-sync' });
  }, [replacedHere, client]);
  useEffect(() => {
    if (done) void client.invalidateQueries({ queryKey: ['cloud-sync'], exact: true });
  }, [done, client]);
  const busy = start.isPending || (session != null && UNDER_WAY.has(session.status));

  const signIn = (provider: SignInProvider) => {
    setChoosingProvider(false);
    setActionError(undefined);
    const tab = openSignInTab();
    start.mutate(
      { provider },
      {
        onSuccess: (started) => {
          setSessionId(started.id);
          if (tab && started.authorizeUrl) tab.location.href = started.authorizeUrl;
        },
        onError: (error) => {
          tab?.close();
          setActionError(errorText(error, t('sync.startFailed')));
        },
      },
    );
  };

  const run = (direction: SyncDirection) => {
    setWarning(null);
    setActionError(undefined);
    if (!session) return;
    confirm.mutate(
      { id: session.id, direction },
      { onError: (error) => setActionError(errorText(error, t('sync.startFailed'))) },
    );
  };
  const choose = (direction: SyncDirection) =>
    session?.comparison?.suggested === direction ? run(direction) : setWarning(direction);

  if (settings.isLoading) return <Spinner />;
  if (settings.isError || !settings.data) {
    return <Banner tone="error">{t('sync.notAvailable')}</Banner>;
  }
  const { cloudUrl, providers, unset, lastSync } = settings.data;
  const unsetWarning = unset.length > 0 && (
    <Banner tone="warning">{t('sync.unset', { names: unset.join(t('common.listSeparator')) })}</Banner>
  );
  if (!cloudUrl) return <Card title={t('sync.title')}>{unsetWarning}</Card>;

  return (
    <Card title={t('sync.title')}>
      <Col gap={2}>
        {unsetWarning}
        <Text muted>{t('sync.intro', { cloudUrl })}</Text>
        <Text muted>
          {t('sync.privacyNote')}{' '}
          <a
            href={`${cloudUrl}/privacy`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit' }}
          >
            {t('sync.privacyLink')}
          </a>
        </Text>
        {lastSync && (
          <Text variant="caption">
            {t('sync.lastSynced', { date: formatDateTime(lastSync.at), email: lastSync.account })}
          </Text>
        )}
        <Text variant="caption" muted>
          {t('sync.keepCopy')}
        </Text>

        {actionError && <Banner tone="error">{actionError}</Banner>}
        {justSignedIn && (
          <Banner tone="success">{t('sync.signedIn', { email: session.account?.email })}</Banner>
        )}
        {session?.status === 'awaiting-confirm' && session.comparison ? (
          <Comparison
            session={session}
            comparison={session.comparison}
            pending={confirm.isPending}
            onChoose={choose}
            onCancel={() => cancel.mutate(session.id)}
          />
        ) : (
          session && <SessionStatus session={session} onCancel={() => cancel.mutate(session.id)} />
        )}

        <Row gap={2} wrap>
          <Button variant="primary" disabled={busy} onClick={() => setChoosingProvider(true)}>
            {t('sync.check')}
          </Button>
        </Row>
      </Col>

      <Dialog open={choosingProvider} title={t('sync.check')} onClose={() => setChoosingProvider(false)}>
        <Col gap={2}>
          <Text>{t('sync.signInToContinue')}</Text>
          <Row gap={1} justify="end" wrap>
            <Button onClick={() => setChoosingProvider(false)}>{t('common.cancel')}</Button>
            {providers.map((provider) => (
              <Button key={provider} variant="primary" onClick={() => signIn(provider)}>
                {t('sync.continueWith', { provider: PROVIDER_NAMES[provider] })}
              </Button>
            ))}
          </Row>
        </Col>
      </Dialog>

      <Dialog
        open={warning != null}
        title={warning ? WARNINGS[warning].title() : ''}
        onClose={() => setWarning(null)}
      >
        {warning && (
          <Col gap={2}>
            <Banner tone="warning">{WARNINGS[warning].text(cloudUrl)}</Banner>
            <Row gap={1} justify="end" wrap>
              <Button onClick={() => setWarning(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" tone="danger" onClick={() => run(warning)}>
                {WARNINGS[warning].button()}
              </Button>
            </Row>
          </Col>
        )}
      </Dialog>
    </Card>
  );
}

function headline(comparison: SyncComparison): {
  tone: 'info' | 'warning' | 'error' | 'success';
  text: string;
} {
  const date = formatDateTime(comparison.lastSyncedAt);
  switch (comparison.state) {
    case 'in-sync':
      return { tone: 'success', text: translate('sync.state.inSync', { date }) };
    case 'local-changed':
      return { tone: 'info', text: translate('sync.state.localChanged') };
    case 'cloud-changed':
      return { tone: 'info', text: translate('sync.state.cloudChanged') };
    case 'both-changed':
      return { tone: 'error', text: translate('sync.state.bothChanged', { date }) };
    case 'first-sync':
      return { tone: 'warning', text: translate('sync.state.firstSync') };
  }
}

function Comparison({
  session,
  comparison,
  pending,
  onChoose,
  onCancel,
}: {
  session: CloudSyncSession;
  comparison: SyncComparison;
  pending: boolean;
  onChoose(direction: SyncDirection): void;
  onCancel(): void;
}) {
  const t = useT();
  const { tone, text } = headline(comparison);
  const localChanged = comparison.state === 'local-changed' || comparison.state === 'both-changed';
  const cloudChanged = comparison.state === 'cloud-changed' || comparison.state === 'both-changed';
  const directions: SyncDirection[] =
    comparison.suggested === 'from-cloud' ? ['from-cloud', 'to-cloud'] : ['to-cloud', 'from-cloud'];

  return (
    <Col gap={2}>
      <Banner tone={tone}>{text}</Banner>
      <Row gap={2} wrap>
        <Side
          title={t('sync.thisComputer')}
          changed={localChanged}
          lines={[
            describeCounts(comparison.local.counts),
            comparison.local.lastChangedAt &&
              t('sync.lastChanged', { date: formatDateTime(comparison.local.lastChangedAt) }),
          ]}
        />
        <Side
          title={t('sync.cloudSide', { email: session.account?.email })}
          changed={cloudChanged}
          lines={
            comparison.cloud.exists && comparison.cloud.counts
              ? [
                  describeCounts(comparison.cloud.counts),
                  comparison.cloud.lastChangedAt &&
                    t('sync.lastChanged', { date: formatDateTime(comparison.cloud.lastChangedAt) }),
                ]
              : [t('sync.cloudEmpty')]
          }
        />
      </Row>
      <Row gap={1} wrap>
        {directions.map((direction) => (
          <Button
            key={direction}
            variant={comparison.suggested === direction ? 'primary' : 'secondary'}
            disabled={pending || (direction === 'from-cloud' && !comparison.cloud.exists)}
            onClick={() => onChoose(direction)}
          >
            {WARNINGS[direction].button()}
          </Button>
        ))}
        <Button variant="text" disabled={pending} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </Row>
    </Col>
  );
}

function Side({
  title,
  changed,
  lines,
}: {
  title: string;
  changed: boolean;
  lines: (string | false | undefined)[];
}) {
  const t = useT();
  return (
    <Col gap={1} grow minWidth={220}>
      <Row gap={1} wrap>
        <Text variant="label">{title}</Text>
        {changed && <Badge tone="warning" label={t('sync.changedBadge')} />}
      </Row>
      {lines
        .filter((line): line is string => Boolean(line))
        .map((line) => (
          <Text key={line} variant="caption" muted>
            {line}
          </Text>
        ))}
    </Col>
  );
}

function SessionStatus({ session, onCancel }: { session: CloudSyncSession; onCancel(): void }) {
  const t = useT();
  const provider = PROVIDER_NAMES[session.provider];
  switch (session.status) {
    case 'awaiting-sign-in':
      return (
        <Banner
          tone="info"
          action={
            <Row gap={1}>
              {session.authorizeUrl && (
                <Button onClick={() => openSignInTab(session.authorizeUrl)}>{t('sync.openSignIn')}</Button>
              )}
              <Button onClick={onCancel}>{t('common.cancel')}</Button>
            </Row>
          }
        >
          {t('sync.waiting', { provider })}
        </Banner>
      );
    case 'comparing':
    case 'awaiting-confirm':
      return <Banner tone="info">{t('sync.comparing', { email: session.account?.email })}</Banner>;
    case 'running':
      return <Banner tone="info">{t('sync.running', { email: session.account?.email })}</Banner>;
    case 'done': {
      const email = session.account?.email;
      const from = session.direction === 'from-cloud';
      return (
        <Banner tone="success">
          {session.result
            ? t(from ? 'sync.doneFromWithCounts' : 'sync.doneToWithCounts', {
                email,
                counts: describeCounts(session.result.now),
              })
            : t(from ? 'sync.doneFrom' : 'sync.doneTo', { email })}
        </Banner>
      );
    }
    case 'failed':
      return (
        <Banner tone="error">
          {session.error ? serverText(session.error.code, session.error.message) : t('sync.failed')}
        </Banner>
      );
    case 'expired':
      return <Banner tone="warning">{t(session.comparison ? 'sync.confirmExpired' : 'sync.expired')}</Banner>;
    case 'cancelled':
      return null;
  }
}
