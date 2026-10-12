import { useState } from 'react';
import { Banner, Button, Checkbox, Col, Dialog, Field, Row, Select, Text } from '@tickrs/ui';
import { useT } from '../i18n.js';
import type { Account } from '../lib/api.js';
import { joinList } from '../lib/format.js';
import { useCurrencies } from '../lib/queries.js';

export interface AccountValues {
  name: string;
  broker: string | null;
  currency: string;
}

export const accountNameFor = (name: string, currency: string) => `${name} - ${currency}`;

export const COMMON_ACCOUNT_CURRENCIES = ['USD', 'CAD', 'EUR', 'JPY'] as const;

export function AccountDialog({
  open,
  account,
  busy,
  error,
  onCancel,
  onSave,
  onAdd,
  currencies,
}: {
  open: boolean;
  account: Account | null;
  currencies?: string[];
  busy: boolean;
  error: string | null;
  onCancel(): void;
  onSave(values: AccountValues): void;
  onAdd(values: AccountValues[]): void;
}) {
  const t = useT();
  return (
    <Dialog
      open={open}
      title={account ? t('accountDialog.editTitle') : t('accountDialog.addTitle')}
      onClose={onCancel}
      maxWidth="xs"
    >
      {open && (
        <AccountForm
          key={account?.id ?? 'new'}
          account={account}
          currencies={currencies}
          busy={busy}
          error={error}
          onCancel={onCancel}
          onSave={onSave}
          onAdd={onAdd}
        />
      )}
    </Dialog>
  );
}

function AccountForm({
  account,
  currencies: initial,
  busy,
  error,
  onCancel,
  onSave,
  onAdd,
}: {
  account: Account | null;
  currencies?: string[];
  busy: boolean;
  error: string | null;
  onCancel(): void;
  onSave(values: AccountValues): void;
  onAdd(values: AccountValues[]): void;
}) {
  const t = useT();
  const [name, setName] = useState(account?.name ?? '');
  const [broker, setBroker] = useState(account?.broker ?? '');
  const currencies = useCurrencies();
  const [currency, setCurrency] = useState(account?.currency ?? currencies.data?.baseCurrency ?? 'USD');
  const [ticked, setTicked] = useState<string[]>(
    initial?.length ? initial : [currencies.data?.baseCurrency ?? 'USD'],
  );
  const trimmed = name.trim();
  const adding = account == null;
  const codes: string[] = [...COMMON_ACCOUNT_CURRENCIES];
  for (const code of [...(currencies.data?.items ?? []).map((c) => c.code), ...ticked])
    if (!codes.includes(code)) codes.push(code);
  const chosen = codes.filter((code) => ticked.includes(code));
  const valid = trimmed.length > 0 && (!adding || chosen.length > 0);
  const options = (currencies.data?.items ?? []).map((c) => ({
    value: c.code,
    label: `${c.name} (${c.code})`,
  }));
  if (!options.some((o) => o.value === currency)) options.push({ value: currency, label: currency });

  return (
    <Col gap={2}>
      {error && <Banner tone="error">{error}</Banner>}
      <Field label={t('accountDialog.name')} value={name} onChange={setName} required autoFocus />
      <Field
        label={t('accountDialog.broker')}
        value={broker}
        onChange={setBroker}
        placeholder={t('accountDialog.optional')}
      />
      {adding ? (
        <Col gap={0}>
          <Text variant="label">{t('accountDialog.currencies')}</Text>
          <Text variant="caption" muted>
            {t('accountDialog.currenciesHelp')}
          </Text>
          <Row gap={1} wrap>
            {codes.map((code) => (
              <Checkbox
                key={code}
                label={code}
                checked={ticked.includes(code)}
                onChange={(on) =>
                  setTicked((prev) => (on ? [...prev, code] : prev.filter((c) => c !== code)))
                }
              />
            ))}
          </Row>
          {trimmed && chosen.length > 0 && (
            <Text variant="caption" muted>
              {t('accountDialog.adds', {
                names: joinList(chosen.map((code) => accountNameFor(trimmed, code))),
              })}
            </Text>
          )}
        </Col>
      ) : (
        <Select
          label={t('common.currency')}
          value={currency}
          onChange={setCurrency}
          options={options}
          hint={t('accountDialog.currencyHint')}
        />
      )}
      <Row gap={1} justify="end">
        <Button onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={!valid || busy}
          onClick={() => {
            const shared = { broker: broker.trim() || null };
            if (!adding) onSave({ name: trimmed, ...shared, currency });
            else
              onAdd(
                chosen.map((code) => ({ name: accountNameFor(trimmed, code), ...shared, currency: code })),
              );
          }}
        >
          {busy
            ? t('common.saving')
            : !adding
              ? t('common.save')
              : chosen.length > 1
                ? t('accountDialog.addMany', { count: chosen.length })
                : t('accountDialog.addOne')}
        </Button>
      </Row>
    </Col>
  );
}

export function DeleteAccountDialog({
  account,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  account: Account | null;
  busy: boolean;
  error: string | null;
  onCancel(): void;
  onConfirm(): void;
}) {
  const t = useT();
  return (
    <Dialog open={account != null} title={t('accountDialog.deleteTitle')} onClose={onCancel} maxWidth="xs">
      <Col gap={2}>
        {error && <Banner tone="error">{error}</Banner>}
        {account && (
          <Col gap={0}>
            <Text variant="section">{account.name}</Text>
            <Text muted>{[account.broker, account.currency].filter(Boolean).join(' · ')}</Text>
          </Col>
        )}
        <Banner tone="warning">{t('accountDialog.deleteWarning')}</Banner>
        <Row gap={1} justify="end">
          <Button onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" tone="danger" onClick={onConfirm} disabled={busy}>
            {busy ? t('common.deleting') : t('accountDialog.deleteButton')}
          </Button>
        </Row>
      </Col>
    </Dialog>
  );
}
