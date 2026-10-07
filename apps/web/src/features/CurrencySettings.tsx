import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Col, Field, Row, Spinner, Text } from '@tickrs/ui';
import { t as translate, useT } from '../i18n.js';
import { api, ApiError, fieldErrorsOf, serverText, type CurrencyItem } from '../lib/api.js';
import { formatFxRate, joinList } from '../lib/format.js';
import { syncFxRates } from '../lib/fx-rates.js';
import { keys, useCurrencies } from '../lib/queries.js';

export function CurrencySettings({ onMessage }: { onMessage(message: string): void }) {
  const t = useT();
  const client = useQueryClient();
  const currencies = useCurrencies();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<{ add?: string }>({});

  const refresh = () => client.invalidateQueries({ queryKey: keys.currencies });

  const add = useMutation({
    mutationFn: () =>
      api.post<{ code: string; name: string }>('/currencies', {
        code: code.trim().toUpperCase(),
        ...(name.trim() ? { name: name.trim() } : {}),
      }),
    onSuccess: async (added) => {
      await refresh();
      setCode('');
      setName('');
      setError({});
      onMessage(t('currencies.added', { name: added.name, code: added.code }));
    },
    onError: (e: unknown) => setError({ add: messageOf(e, t('currencies.addFailed')) }),
  });

  const remove = useMutation({
    mutationFn: (c: string) => api.delete(`/currencies/${c}`),
    onSuccess: async (_r, c) => {
      await refresh();
      onMessage(t('currencies.removed', { code: c }));
    },
    onError: (e: unknown) => onMessage(messageOf(e, t('currencies.removeFailed'))),
  });

  const makeBase = useMutation({
    mutationFn: (c: string) => api.patch<unknown>('/settings', { baseCurrency: c }),
    onSuccess: async (_r, c) => {
      await client.invalidateQueries();
      onMessage(t('currencies.nowBase', { code: c }));
    },
    onError: (e: unknown) => onMessage(messageOf(e, t('currencies.baseFailed'))),
  });

  const refreshRates = useMutation({
    mutationFn: () => syncFxRates(client),
    onSuccess: (r) => {
      onMessage(
        r.failed.length > 0
          ? t('currencies.ratesFailed', { codes: joinList(r.failed) })
          : r.updated.length > 0
            ? t('currencies.ratesUpdated', { codes: joinList(r.updated) })
            : t('currencies.noOthers'),
      );
    },
    onError: (e: unknown) => onMessage(messageOf(e, t('currencies.refreshFailed'))),
  });

  if (currencies.isLoading || !currencies.data) return <Spinner label={t('currencies.loading')} />;
  const list = currencies.data;

  return (
    <Col gap={3}>
      <Card
        title={t('currencies.title')}
        action={
          <Button onClick={() => refreshRates.mutate()} disabled={refreshRates.isPending}>
            {refreshRates.isPending ? t('currencies.refreshing') : t('currencies.refresh')}
          </Button>
        }
      >
        <Col gap={1}>
          {list.items.map((c) => (
            <Row key={c.code} gap={1} justify="between">
              <Col gap={0}>
                <Row gap={1}>
                  <Text variant="label">
                    {c.code} · {c.name}
                  </Text>
                  {c.isBase && <Badge label={t('currencies.base')} tone="info" />}
                </Row>
                <Text variant="caption" muted>
                  {[rateText(c, list.baseCurrency), usageText(c)].filter(Boolean).join(' · ')}
                </Text>
              </Col>
              <Row gap={1}>
                {!c.isBase && (
                  <Button
                    variant="text"
                    aria-label={t('currencies.makeBaseFor', { code: c.code })}
                    disabled={makeBase.isPending}
                    onClick={() => makeBase.mutate(c.code)}
                  >
                    {t('currencies.makeBase')}
                  </Button>
                )}
                <Button
                  variant="text"
                  tone="danger"
                  aria-label={t('currencies.removeFor', { code: c.code })}
                  disabled={!removable(c) || remove.isPending}
                  onClick={() => remove.mutate(c.code)}
                >
                  {t('common.remove')}
                </Button>
              </Row>
            </Row>
          ))}
          <Text variant="caption" muted>
            {t('currencies.baseNote')}
          </Text>
          <Text variant="caption" muted>
            {t('currencies.removeNote')}
          </Text>
          <Row gap={1} responsive align="start">
            <Field
              label={t('currencies.code')}
              value={code}
              onChange={(v) => setCode(v.toUpperCase().slice(0, 3))}
              placeholder="EUR"
              error={error.add}
              hint={t('currencies.codeHint')}
            />
            <Field
              label={t('currencies.name')}
              value={name}
              onChange={setName}
              placeholder={t('currencies.namePlaceholder')}
            />
            <Button
              variant="primary"
              disabled={code.trim().length !== 3 || add.isPending}
              onClick={() => add.mutate()}
            >
              {t('currencies.add')}
            </Button>
          </Row>
        </Col>
      </Card>
    </Col>
  );
}

const removable = (c: CurrencyItem) => !c.isBase && c.accounts === 0 && c.transactions === 0;

function rateText(c: CurrencyItem, base: string): string {
  if (c.isBase) return '';
  return c.rateToBase
    ? translate('currencies.rate', { code: c.code, rate: formatFxRate(c.rateToBase), base })
    : translate('currencies.noRate');
}

function usageText(c: CurrencyItem): string {
  const parts = [
    c.accounts > 0 ? translate('counts.account', { count: c.accounts }) : null,
    c.transactions > 0 ? translate('counts.transaction', { count: c.transactions }) : null,
  ].filter(Boolean);
  return parts.length > 0
    ? translate('currencies.usedBy', { parts: parts.join(translate('currencies.and')) })
    : translate('currencies.notUsed');
}

function messageOf(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  const first = Object.values(fieldErrorsOf(e))[0];
  return first ?? serverText(e.code, e.message);
}
