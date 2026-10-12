import type { ImportConfig } from '@tickrs/shared';
import { Banner, Button, Col, Dialog, Row, Text } from '@tickrs/ui';
import { useState } from 'react';
import { useT } from '../../i18n.js';
import { errorText } from '../../lib/api.js';
import { startImportSignIn, useImportSignOut } from '../../lib/queries.js';
import { openSignInWindow } from '../../lib/sign-in-window.js';

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', microsoft: 'Microsoft' };

export function AiStatus({
  ai,
  onWaitingForSignIn,
}: {
  ai: ImportConfig['ai'];
  onWaitingForSignIn(waiting: boolean): void;
}) {
  const t = useT();
  const signOut = useImportSignOut();
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (provider: string) => {
    setError(null);
    const popup = openSignInWindow();
    try {
      const { authorizeUrl } = await startImportSignIn(provider);
      if (popup) popup.location.href = authorizeUrl;
      setWaiting(true);
      onWaitingForSignIn(true);
    } catch (e) {
      popup?.close();
      setError(errorText(e, t('common.somethingWentWrong')));
    }
  };

  if (ai.status === 'unavailable') return <Text muted>{t('import.aiUnavailable')}</Text>;

  if (ai.status === 'sign-in') {
    return (
      <Col gap={1}>
        <Text>{t('import.aiSignIn')}</Text>
        {ai.noAccount && <Banner tone="warning">{t('import.aiNoAccount', { account: ai.noAccount })}</Banner>}
        <Row gap={1} wrap>
          {ai.providers.map((provider) => (
            <Button key={provider} onClick={() => void signIn(provider)}>
              {t('import.signInWith', { provider: PROVIDER_NAMES[provider] ?? provider })}
            </Button>
          ))}
        </Row>
        {waiting && <Banner tone="info">{t('import.waitingForSignIn')}</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
      </Col>
    );
  }

  const details = <Text muted>{t('import.aiReadBy', { processor: ai.processor.name })}</Text>;
  if (!ai.account) return details;
  return (
    <Col gap={1}>
      <Banner
        tone="success"
        action={
          <Button
            variant="text"
            onClick={() => {
              setWaiting(false);
              signOut.mutate();
            }}
            disabled={signOut.isPending}
          >
            {t('import.signOut')}
          </Button>
        }
      >
        {t('import.aiSignedInAs', { account: ai.account })}
      </Banner>
      {details}
    </Col>
  );
}

const NOTICE_KEY = 'mytickrs.import.aiNotice';

export const aiNoticeAccepted = (): boolean => {
  try {
    return localStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
};

export function AiNotice({
  open,
  processor,
  onSend,
  onCancel,
}: {
  open: boolean;
  processor: { name: string; privacyUrl: string };
  onSend(): void;
  onCancel(): void;
}) {
  const t = useT();
  return (
    <Dialog
      open={open}
      title={t('import.aiNoticeTitle', { processor: processor.name })}
      onClose={onCancel}
      actions={
        <>
          <Button variant="text" onClick={() => window.open(processor.privacyUrl, '_blank', 'noopener')}>
            {t('import.privacy')}
          </Button>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              try {
                localStorage.setItem(NOTICE_KEY, '1');
              } catch {}
              onSend();
            }}
          >
            {t('import.aiNoticeSend')}
          </Button>
        </>
      }
    >
      <Col gap={1}>
        <Text>{t('import.aiNoticeBody', { processor: processor.name })}</Text>
        <Text muted>{t('import.aiNoticeStructured')}</Text>
      </Col>
    </Dialog>
  );
}
