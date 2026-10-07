import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  Col,
  Dialog,
  Field,
  IconButton,
  Row,
  Select,
  Spinner,
  Text,
  useLanguage,
} from '@tickrs/ui';
import { catalogMarket, type MarketDef } from '@tickrs/shared';
import { t as translate, useT } from '../i18n.js';
import { api, ApiError, fieldErrorsOf, serverText, type MarketItem } from '../lib/api.js';
import { joinList } from '../lib/format.js';
import { countryName, marketOptions } from '../lib/markets.js';
import { keys, useCurrencies, useMarkets } from '../lib/queries.js';

export function MarketSettings({ onMessage }: { onMessage(message: string): void }) {
  const t = useT();
  const client = useQueryClient();
  const markets = useMarkets();
  const { language } = useLanguage();
  const [editing, setEditing] = useState<{ market: MarketItem | null } | null>(null);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.markets }),
      client.invalidateQueries({ queryKey: keys.providers }),
      client.invalidateQueries({ queryKey: keys.currencies }),
    ]);

  const save = useMutation({
    mutationFn: ({ code, market }: { code: string | null; market: MarketDef }) =>
      code
        ? api.put<MarketDef>(`/settings/markets/${code}`, market)
        : api.post<MarketDef>('/settings/markets', market),
    onSuccess: async (saved, { code }) => {
      await refresh();
      setEditing(null);
      onMessage(code ? t('markets.saved', { name: saved.name }) : t('markets.added', { name: saved.name }));
    },
  });

  const remove = useMutation({
    mutationFn: (code: string) => api.delete(`/settings/markets/${code}`),
    onSuccess: async (_r, code) => {
      await refresh();
      onMessage(t('markets.removed', { code }));
    },
    onError: (e: unknown) => onMessage(messageOf(e, t('markets.removeFailed'))),
  });

  if (markets.isLoading || !markets.data) return <Spinner label={t('markets.loading')} />;
  const list = markets.data.items.toSorted((a, b) => a.name.localeCompare(b.name, language));

  return (
    <Card
      title={t('markets.title')}
      action={
        <Button
          variant="primary"
          onClick={() => {
            save.reset();
            setEditing({ market: null });
          }}
        >
          {t('markets.add')}
        </Button>
      }
    >
      <Col gap={2}>
        <Text variant="caption" muted>
          {t('markets.intro')}
        </Text>
        {list.map((m) => (
          <Row key={m.code} gap={1} justify="between" align="start">
            <Col gap={0}>
              <Row gap={1}>
                <Text variant="label">
                  {m.name} · {m.code}
                </Text>
                <Badge
                  label={m.openNow ? t('markets.openNow') : t('markets.closedNow')}
                  tone={m.openNow ? 'positive' : 'default'}
                />
                {m.isHome && <Badge label={t('markets.home')} tone="info" />}
              </Row>
              <Text variant="caption" muted>
                {[
                  m.currency,
                  hoursText(m),
                  m.suffixes.length > 0
                    ? joinList(m.suffixes.map((s) => `.${s.suffix} (${s.exchange})`))
                    : t('markets.bareTickers'),
                  m.symbols > 0 ? translate('markets.symbolCount', { count: m.symbols }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Col>
            <Row gap={1}>
              <Button
                variant="text"
                aria-label={t('markets.editFor', { name: m.name })}
                onClick={() => {
                  save.reset();
                  setEditing({ market: m });
                }}
              >
                {t('common.edit')}
              </Button>
              <Button
                variant="text"
                tone="danger"
                aria-label={t('markets.removeFor', { name: m.name })}
                disabled={m.isHome || m.symbols > 0 || remove.isPending}
                onClick={() => remove.mutate(m.code)}
              >
                {t('common.remove')}
              </Button>
            </Row>
          </Row>
        ))}
        <Text variant="caption" muted>
          {t('markets.removeNote')}
        </Text>
      </Col>
      {editing && (
        <MarketDialog
          market={editing.market}
          markets={list}
          busy={save.isPending}
          error={save.error ? messageOf(save.error, translate('common.somethingWentWrong')) : null}
          onCancel={() => setEditing(null)}
          onSave={(market) => save.mutate({ code: editing.market?.code ?? null, market })}
        />
      )}
    </Card>
  );
}

function hoursText(m: MarketDef): string {
  return `${m.sessions.map((s) => `${s.open}–${s.close}`).join(', ')} ${m.timezone}`;
}

function messageOf(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  const first = Object.values(fieldErrorsOf(e))[0];
  return first ?? serverText(e.code, e.message);
}

const WEEK = [1, 2, 3, 4, 5, 6, 0];

interface FormState {
  code: string;
  name: string;
  country: string;
  timezone: string;
  currency: string;
  testSymbol: string;
  sessions: { open: string; close: string }[];
  weekdays: number[];
  closedDays: string;
  holidaysThrough: number | null;
  suffixes: { suffix: string; exchange: string; mic: string }[];
}

function toForm(m: MarketDef): FormState {
  return {
    code: m.code,
    name: m.name,
    country: m.country ?? '',
    timezone: m.timezone,
    currency: m.currency,
    testSymbol: m.testSymbol,
    sessions: m.sessions.map((s) => ({ ...s })),
    weekdays: [...m.weekdays],
    closedDays: m.closedDays.join(', '),
    holidaysThrough: m.holidaysThrough,
    suffixes: m.suffixes.map((s) => ({ ...s, mic: s.mic ?? '' })),
  };
}

function blankForm(template: MarketDef): FormState {
  return {
    ...toForm(template),
    code: '',
    name: '',
    country: '',
    timezone: '',
    currency: '',
    testSymbol: '',
    closedDays: '',
    holidaysThrough: null,
    suffixes: [],
  };
}

function fromCatalog(form: FormState, country: string, language: string): FormState {
  const c = catalogMarket(country);
  if (!c) return form;
  return {
    ...form,
    code: c.country,
    name: countryName(c.country, language),
    country: c.country,
    timezone: c.timezone,
    currency: c.currency,
    testSymbol: c.testSymbol,
    sessions: c.sessions.map((s) => ({ ...s })),
    weekdays: [...c.weekdays],
    closedDays: '',
    holidaysThrough: null,
    suffixes: c.suffixes.map((s) => ({ ...s })),
  };
}

const parseDates = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((d) => d.trim())
    .filter(Boolean);

function withHolidays(form: FormState, dates: readonly string[], years: readonly number[]): FormState {
  const covered = years.filter((y) => dates.some((d) => d.startsWith(`${y}-`)));
  const trading = dates.filter((d) => form.weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay()));
  return {
    ...form,
    closedDays: [...new Set([...parseDates(form.closedDays), ...trading])].toSorted().join(', '),
    holidaysThrough:
      covered.length > 0 ? Math.max(form.holidaysThrough ?? 0, ...covered) : form.holidaysThrough,
  };
}

function fromForm(f: FormState): MarketDef {
  return {
    code: f.code.trim().toUpperCase(),
    name: f.name.trim(),
    country: f.country || null,
    timezone: f.timezone.trim(),
    currency: f.currency,
    testSymbol: f.testSymbol.trim().toUpperCase(),
    sessions: f.sessions,
    weekdays: f.weekdays,
    closedDays: parseDates(f.closedDays),
    holidaysThrough: f.holidaysThrough,
    suffixes: f.suffixes.map((s) => ({
      suffix: s.suffix.trim().toUpperCase(),
      exchange: s.exchange.trim(),
      mic: s.mic.trim() ? s.mic.trim().toUpperCase() : null,
    })),
  };
}

function MarketDialog({
  market,
  markets,
  busy,
  error,
  onCancel,
  onSave,
}: {
  market: MarketItem | null;
  markets: readonly MarketItem[];
  busy: boolean;
  error: string | null;
  onCancel(): void;
  onSave(market: MarketDef): void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const currencies = useCurrencies();
  const adding = market == null;
  const template = markets.find((m) => !m.isHome) ?? markets[0]!;
  const [form, setForm] = useState<FormState>(() => (market ? toForm(market) : blankForm(template)));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });
  const [holidays, setHolidays] = useState<{ busy: boolean; note: string | null; failed: boolean }>({
    busy: false,
    note: null,
    failed: false,
  });

  const getHolidays = async (country: string) => {
    const year = new Date().getFullYear();
    const years = [year, year + 1];
    setHolidays({ busy: true, note: null, failed: false });
    try {
      const found = await api.get<{ items: { date: string; name: string }[] }>(
        `/settings/markets/holidays/${country}?years=${years.join(',')}`,
      );
      const dates = found.items.map((h) => h.date);
      setForm((f) => (f.country === country ? withHolidays(f, dates, years) : f));
      setHolidays({
        busy: false,
        note: translate('markets.holidaysAdded', { count: dates.length, from: years[0], to: years[1] }),
        failed: false,
      });
    } catch (e) {
      setHolidays({ busy: false, note: messageOf(e, translate('markets.holidaysFailed')), failed: true });
    }
  };

  const pickMarket = (country: string) => {
    if (!catalogMarket(country) || country === form.country) return;
    setForm(fromCatalog(form, country, language));
    void getHolidays(country);
  };

  const weekdayName = (day: number) =>
    new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(1970, 0, 4 + day)),
    );
  const currencyOptions = (currencies.data?.items ?? []).map((c) => ({ value: c.code, label: c.code }));
  if (form.currency && !currencyOptions.some((c) => c.value === form.currency)) {
    currencyOptions.push({ value: form.currency, label: form.currency });
  }

  return (
    <Dialog
      open
      maxWidth="md"
      title={adding ? t('markets.addTitle') : t('markets.editTitle', { name: market.name })}
      onClose={onCancel}
      onSubmit={() => onSave(fromForm(form))}
      actions={
        <>
          <Button variant="text" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={busy || !form.timezone}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Col gap={2}>
        {error && <Banner tone="error">{error}</Banner>}
        {adding ? (
          <Select
            label={t('markets.market')}
            value={form.country}
            onChange={pickMarket}
            options={marketOptions(form, language)}
            hint={t('markets.marketHint')}
          />
        ) : (
          <Field
            label={t('markets.market')}
            value={marketOptions(form, language).find((o) => o.value === form.country)?.label ?? ''}
            onChange={() => {}}
            disabled
          />
        )}
        <Row gap={2} responsive align="start">
          <Field
            label={t('markets.code')}
            value={form.code}
            onChange={(v) => set('code', v.toUpperCase().slice(0, 8))}
            disabled={!adding}
            placeholder="HK"
            required
          />
          <Field label={t('markets.name')} value={form.name} onChange={(v) => set('name', v)} required />
          <Select
            label={t('markets.currency')}
            value={form.currency}
            onChange={(v) => set('currency', v)}
            options={currencyOptions}
            hint={t('markets.currencyHint')}
          />
        </Row>

        <Text variant="label">{t('markets.hours')}</Text>
        {form.timezone && (
          <Text variant="caption" muted>
            {t('markets.hoursIn', { timezone: form.timezone.replaceAll('_', ' ') })}
          </Text>
        )}
        {form.sessions.map((s, i) => (
          <Row key={i} gap={1} align="start">
            <Field
              label={t('markets.opens')}
              value={s.open}
              onChange={(v) => set('sessions', form.sessions.with(i, { ...s, open: v }))}
              placeholder="09:30"
            />
            <Field
              label={t('markets.closes')}
              value={s.close}
              onChange={(v) => set('sessions', form.sessions.with(i, { ...s, close: v }))}
              placeholder="16:00"
            />
            {form.sessions.length > 1 && (
              <IconButton
                label={t('markets.removeSession')}
                onClick={() =>
                  set(
                    'sessions',
                    form.sessions.filter((_, j) => j !== i),
                  )
                }
              >
                ✕
              </IconButton>
            )}
          </Row>
        ))}
        <Row gap={1}>
          <Button
            variant="text"
            disabled={form.sessions.length >= 4}
            onClick={() => set('sessions', [...form.sessions, { open: '', close: '' }])}
          >
            {t('markets.addSession')}
          </Button>
        </Row>
        <Row gap={0} wrap>
          {WEEK.map((day) => (
            <Checkbox
              key={day}
              label={weekdayName(day)}
              checked={form.weekdays.includes(day)}
              onChange={(on) =>
                set('weekdays', on ? [...form.weekdays, day] : form.weekdays.filter((d) => d !== day))
              }
            />
          ))}
        </Row>
        <Field
          label={t('markets.closedDays')}
          value={form.closedDays}
          onChange={(v) => set('closedDays', v)}
          placeholder="2026-10-01, 2026-12-24"
          hint={t('markets.closedDaysHint')}
          rows={2}
        />
        <Row gap={1} align="center" wrap>
          <Button
            variant="text"
            disabled={!catalogMarket(form.country) || holidays.busy}
            onClick={() => void getHolidays(form.country)}
          >
            {t('markets.getHolidays')}
          </Button>
          {holidays.busy && <Spinner />}
          {holidays.note && (
            <Text variant="caption" muted={!holidays.failed} tone={holidays.failed ? 'negative' : 'default'}>
              {holidays.note}
            </Text>
          )}
        </Row>

        <Text variant="label">{t('markets.listings')}</Text>
        <Text variant="caption" muted>
          {t('markets.suffixHint')}
        </Text>
        {form.suffixes.map((s, i) => (
          <Row key={i} gap={1} align="start">
            <Field
              label={t('markets.suffix')}
              value={s.suffix}
              onChange={(v) =>
                set('suffixes', form.suffixes.with(i, { ...s, suffix: v.toUpperCase().slice(0, 4) }))
              }
              placeholder="HK"
            />
            <Field
              label={t('markets.exchange')}
              value={s.exchange}
              onChange={(v) => set('suffixes', form.suffixes.with(i, { ...s, exchange: v }))}
              placeholder="HKEX"
            />
            <Field
              label={t('markets.mic')}
              value={s.mic}
              onChange={(v) =>
                set('suffixes', form.suffixes.with(i, { ...s, mic: v.toUpperCase().slice(0, 4) }))
              }
              placeholder="XHKG"
            />
            <IconButton
              label={t('markets.removeSuffix')}
              onClick={() =>
                set(
                  'suffixes',
                  form.suffixes.filter((_, j) => j !== i),
                )
              }
            >
              ✕
            </IconButton>
          </Row>
        ))}
        <Row gap={1}>
          <Button
            variant="text"
            onClick={() => set('suffixes', [...form.suffixes, { suffix: '', exchange: '', mic: '' }])}
          >
            {t('markets.addSuffix')}
          </Button>
        </Row>
        <Field
          label={t('markets.testSymbol')}
          value={form.testSymbol}
          onChange={(v) => set('testSymbol', v.toUpperCase())}
          placeholder="0700.HK"
          hint={t('markets.testSymbolHint')}
          required
        />
      </Col>
    </Dialog>
  );
}
