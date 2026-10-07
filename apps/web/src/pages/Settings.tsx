import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Banner,
  Button,
  Card,
  Field,
  Select,
  Spinner,
  Col,
  Row,
  Tabs,
  Text,
  Toggle,
  SUPPORTED_LANGUAGES,
  THEME_COLORS,
  useLanguage,
  useThemeMode,
  type Language,
  type ThemeColor,
} from '@tickrs/ui';
import { AccountDialog, DeleteAccountDialog, type AccountValues } from '../features/AccountDialog.js';
import { CurrencySettings } from '../features/CurrencySettings.js';
import { DataProviderSettings } from '../features/DataProviderSettings.js';
import { MarketSettings } from '../features/MarketSettings.js';
import { t as translate, useT } from '../i18n.js';
import { api, errorText, type Account, type Settings } from '../lib/api.js';
import { formatMoney, toDecimalInput } from '../lib/format.js';
import type { SettingsTab } from '../plugins.js';
import { addAccounts, keys, useAccounts, useFeeSchedule, useSettings } from '../lib/queries.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const settingsTabs = () => [
  { value: 'general', label: translate('settings.tabGeneral') },
  { value: 'accounts', label: translate('settings.tabAccounts') },
  { value: 'currencies', label: translate('settings.tabCurrencies') },
  { value: 'fees', label: translate('settings.tabFees') },
  { value: 'markets', label: translate('settings.tabMarkets') },
  { value: 'providers', label: translate('settings.tabProviders') },
];

function LanguagePicker() {
  const t = useT();
  const { language, setLanguage } = useLanguage();
  return (
    <Select<Language>
      label={t('settings.language')}
      value={language}
      onChange={setLanguage}
      options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
    />
  );
}

function ColorPicker() {
  const t = useT();
  const { color, setColor } = useThemeMode();
  const labels: Record<ThemeColor, string> = {
    blue: t('settings.colorBlue'),
    green: t('settings.colorGreen'),
  };
  return (
    <Select<ThemeColor>
      label={t('settings.color')}
      value={color}
      onChange={setColor}
      options={THEME_COLORS.map((c) => ({ value: c, label: labels[c] }))}
    />
  );
}

function tabOf(search: URLSearchParams, tabs: readonly { value: string }[]): string {
  const wanted = search.get('tab');
  return tabs.find((t) => t.value === wanted)?.value ?? 'general';
}

export function SettingsPage({ extraTabs = [] }: { extraTabs?: readonly SettingsTab[] }) {
  const t = useT();
  const client = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const tabs = [...settingsTabs(), ...extraTabs.map(({ value, label }) => ({ value, label }))];
  const tab = tabOf(search, tabs);
  const extraTab = extraTabs.find((extra) => extra.value === tab);
  const settings = useSettings();
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState('');
  const accountList = accounts.data?.items ?? [];
  const selectedAccount = accountList.some((a) => a.id === accountId)
    ? accountId
    : (accountList[0]?.id ?? '');
  const feeSchedule = useFeeSchedule(selectedAccount);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ account: Account | null } | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  const saveAccount = useMutation({
    mutationFn: async (
      change: { id: string; values: AccountValues } | { id?: undefined; values: AccountValues[] },
    ) => {
      if (change.id !== undefined) return api.patch<unknown>(`/accounts/${change.id}`, change.values);
      return addAccounts(change.values);
    },
    onSuccess: async (_saved, { id, values }) => {
      await client.invalidateQueries();
      setEditing(null);
      const added = Array.isArray(values) ? values.length : 0;
      setMessage(
        id
          ? t('settings.accountSaved')
          : added > 1
            ? t('settings.accountsAdded', { count: added })
            : t('settings.accountAdded'),
      );
    },
  });

  const deleteAccount = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}?confirm=true`),
    onSuccess: async () => {
      await client.invalidateQueries();
      setDeleting(null);
      setMessage(t('settings.accountDeleted'));
    },
  });

  const saveSettings = useMutation({
    mutationFn: (patch: Partial<Settings>) => api.patch<Settings>('/settings', patch),
    onSuccess: async () => {
      await client.invalidateQueries();
      setMessage(t('settings.saved'));
    },
  });

  const saveFees = useMutation({
    mutationFn: (body: Record<string, string | null>) =>
      api.put(`/accounts/${selectedAccount}/fee-schedule`, body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.feeSchedule(selectedAccount) });
      setMessage(t('settings.feesSaved'));
    },
  });

  if (settings.isLoading || !settings.data) return <Spinner label={t('settings.loading')} />;
  const s = settings.data;

  return (
    <Col gap={3}>
      <Text variant="title">{t('settings.title')}</Text>
      {message && <Banner tone="info">{message}</Banner>}

      <Tabs
        value={tab}
        onChange={(v) => {
          setMessage(null);
          setSearch(v === 'general' ? {} : { tab: v }, { replace: true });
        }}
        tabs={tabs}
      />

      {tab === 'general' && (
        <Card>
          <Col gap={2}>
            <Row gap={2} responsive align="start">
              <LanguagePicker />
              <ColorPicker />
            </Row>
            <Row gap={2} responsive align="start">
              <Select
                label={t('settings.averagePrice')}
                value={s.averagePriceScope}
                onChange={(v) => saveSettings.mutate({ averagePriceScope: v })}
                options={[
                  { value: 'LIFETIME', label: t('settings.averagePriceLifetime') },
                  { value: 'CURRENT', label: t('settings.averagePriceCurrent') },
                ]}
                hint={t('settings.averagePriceHint')}
              />
              <Select
                label={t('settings.premiumOnAssignment')}
                value={s.optionPremiumTreatment}
                onChange={(v) => saveSettings.mutate({ optionPremiumTreatment: v })}
                options={[
                  { value: 'ROLL_INTO_STOCK', label: t('settings.premiumRollIntoStock') },
                  { value: 'SEPARATE', label: t('settings.premiumSeparate') },
                ]}
                hint={t('settings.premiumHint')}
              />
            </Row>
            <Row gap={2} responsive align="start">
              <Select
                label={t('settings.shortBuy')}
                value={s.shortBuyHandling}
                onChange={(v) => saveSettings.mutate({ shortBuyHandling: v })}
                options={[
                  { value: 'BLOCK', label: t('settings.shortBuyBlock') },
                  { value: 'COVER', label: t('settings.shortBuyCover') },
                ]}
                hint={t('settings.shortBuyHint')}
              />
              <Select
                label={t('settings.borrowFees')}
                value={s.borrowFeeTreatment}
                onChange={(v) => saveSettings.mutate({ borrowFeeTreatment: v })}
                options={[
                  { value: 'REALIZED', label: t('settings.borrowFeesRealized') },
                  { value: 'SEPARATE', label: t('settings.borrowFeesSeparate') },
                ]}
                hint={t('settings.premiumHint')}
              />
            </Row>
            <Toggle
              label={t('settings.autoExpire')}
              checked={s.autoExpireOtm}
              onChange={(v) => saveSettings.mutate({ autoExpireOtm: v })}
            />
          </Col>
        </Card>
      )}
      {tab === 'accounts' && (
        <Card
          title={t('settings.brokerageAccounts')}
          action={
            <Button
              variant="primary"
              onClick={() => {
                saveAccount.reset();
                setEditing({ account: null });
              }}
            >
              {t('settings.addAccount')}
            </Button>
          }
        >
          <Col gap={1}>
            {accountList.length === 0 && <Text muted>{t('settings.noAccounts')}</Text>}
            {accountList.map((a) => (
              <Row key={a.id} gap={1} justify="between">
                <Col gap={0}>
                  <Text variant="label">{a.name}</Text>
                  <Text variant="caption" muted>
                    {[a.broker, a.currency].filter(Boolean).join(' · ')}
                  </Text>
                </Col>
                <Row gap={1}>
                  <Button
                    variant="text"
                    aria-label={t('settings.editName', { name: a.name })}
                    onClick={() => {
                      saveAccount.reset();
                      setEditing({ account: a });
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="text"
                    tone="danger"
                    aria-label={t('settings.deleteName', { name: a.name })}
                    disabled={accountList.length === 1}
                    onClick={() => {
                      deleteAccount.reset();
                      setDeleting(a);
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </Row>
              </Row>
            ))}
            {accountList.length === 1 && (
              <Text variant="caption" muted>
                {t('settings.lastAccount')}
              </Text>
            )}
          </Col>
        </Card>
      )}
      {tab === 'currencies' && <CurrencySettings onMessage={setMessage} />}
      {tab === 'fees' && (
        <Card>
          <Col gap={2}>
            <Select
              label={t('common.account')}
              value={selectedAccount}
              onChange={setAccountId}
              options={accountList.map((a) => ({ value: a.id, label: a.name }))}
            />
            <FeeScheduleForm
              key={selectedAccount}
              current={feeSchedule.data ?? null}
              onSave={(body) => saveFees.mutate(body)}
              saving={saveFees.isPending}
            />
          </Col>
        </Card>
      )}
      {tab === 'markets' && <MarketSettings onMessage={setMessage} />}
      {tab === 'providers' && <DataProviderSettings onMessage={setMessage} />}
      {extraTab?.render()}

      <AccountDialog
        open={editing != null}
        account={editing?.account ?? null}
        busy={saveAccount.isPending}
        error={failureText(saveAccount.error)}
        onCancel={() => setEditing(null)}
        onSave={(values) => editing?.account && saveAccount.mutate({ id: editing.account.id, values })}
        onAdd={(values) => saveAccount.mutate({ values })}
      />
      <DeleteAccountDialog
        account={deleting}
        busy={deleteAccount.isPending}
        error={failureText(deleteAccount.error)}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteAccount.mutate(deleting.id)}
      />
    </Col>
  );
}

function failureText(error: unknown): string | null {
  if (!error) return null;
  return errorText(error, translate('common.somethingWentWrong'));
}

const FEE_KEYS = [
  'stockPerOrder',
  'stockPerShare',
  'stockMinPerOrder',
  'stockMaxPctOfValue',
  'optionPerOrder',
  'optionPerContract',
  'assignmentFee',
  'exerciseFee',
  'secFeeRate',
  'tafPerShare',
  'tafPerContract',
  'orfPerContract',
] as const;
type FeeKey = (typeof FEE_KEYS)[number];
type FeeLabelKey = `fee${Capitalize<FeeKey>}`;

const feeFields = (): { key: FeeKey; label: string; hint?: string }[] =>
  FEE_KEYS.map((key) => {
    const name = `fee${key[0]!.toUpperCase()}${key.slice(1)}` as FeeLabelKey;
    return {
      key,
      label: translate(`settings.${name}`),
      hint:
        key === 'stockMaxPctOfValue'
          ? translate('settings.feeStockMaxPctOfValueHint')
          : key === 'secFeeRate'
            ? translate('settings.feeSecFeeRateHint')
            : undefined,
    };
  });

function FeeScheduleForm({
  current,
  onSave,
  saving,
}: {
  current: Record<string, string | null> | null;
  onSave(body: Record<string, string | null>): void;
  saving: boolean;
}) {
  const t = useT();
  const FEE_FIELDS = feeFields();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FEE_FIELDS.map((f) => [f.key, (current?.[f.key] as string | undefined) ?? ''])),
  );
  const [name, setName] = useState(
    (current?.name as string | undefined) ?? translate('settings.defaultScheduleName'),
  );

  return (
    <Col gap={2}>
      <Field label={t('settings.scheduleName')} value={name} onChange={setName} />
      <Row gap={2} wrap align="start">
        {FEE_FIELDS.map((f) => (
          <Col key={f.key} minWidth={200} grow>
            <Field
              label={f.label}
              value={values[f.key] ?? ''}
              onChange={(v) => setValues({ ...values, [f.key]: v })}
              hint={f.hint}
              placeholder="0"
            />
          </Col>
        ))}
      </Row>
      <Text variant="caption" muted>
        {t('settings.feeNote', { amount: formatMoney('1.30') })}
      </Text>
      <Row gap={1}>
        <Button
          variant="primary"
          disabled={saving}
          onClick={() =>
            onSave({
              name,
              ...Object.fromEntries(
                FEE_FIELDS.map((f) => [f.key, values[f.key] === '' ? null : toDecimalInput(values[f.key]!)]),
              ),
            })
          }
        >
          {t('settings.saveFees')}
        </Button>
      </Row>
    </Col>
  );
}
