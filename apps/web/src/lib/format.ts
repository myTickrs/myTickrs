import type { BackupCounts } from '@tickrs/shared';
import { currentLocale, ltr } from '@tickrs/ui';
import { t } from '../i18n.js';

const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = currentLocale();
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}

function moneyFormatter(currency: string, maximumFractionDigits = 2): Intl.NumberFormat {
  return numberFormat({
    style: 'currency',
    currency,
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  });
}

export function formatMoney(value: string | null | undefined, currency = 'USD', digits = 2): string {
  if (value == null || value === '') return '—';
  return ltr(moneyFormatter(currency, digits).format(Number(value)));
}

export function formatMoneyWithCode(value: string | null | undefined, currency = 'USD'): string {
  if (value == null || value === '') return '—';
  return ltr(numberFormat({ style: 'currency', currency, currencyDisplay: 'code' }).format(Number(value)));
}

export function formatSignedMoney(value: string | null | undefined, currency = 'USD'): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  const formatted = moneyFormatter(currency).format(Math.abs(n));
  if (n === 0) return ltr(formatted);
  return ltr(`${n > 0 ? '+' : '−'}${formatted}`);
}

export function formatQuantity(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return ltr(numberFormat({ maximumFractionDigits: 8 }).format(Number(value)));
}

export function formatPercent(fraction: string | null | undefined, digits = 2): string {
  if (fraction == null || fraction === '') return '—';
  return ltr(
    numberFormat({
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: 'exceptZero',
    }).format(Number(fraction)),
  );
}

export function formatFxRate(rate: string): string {
  const formatter = numberFormat({
    maximumFractionDigits: 4,
    maximumSignificantDigits: 4,
    roundingPriority: 'morePrecision',
    useGrouping: false,
  });
  return ltr(formatter.format(Number(rate)));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return ltr(
    new Intl.DateTimeFormat(currentLocale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, d))),
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return ltr(
    new Intl.DateTimeFormat(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(at),
  );
}

export function toneOf(value: string | null | undefined): 'positive' | 'negative' | 'default' {
  if (value == null || value === '') return 'default';
  const n = Number(value);
  return n > 0 ? 'positive' : n < 0 ? 'negative' : 'default';
}

const pad = (n: number) => String(n).padStart(2, '0');

export const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const TX_TYPES = [
  'BUY',
  'SELL',
  'DIV_CASH',
  'DIV_REINVEST',
  'SPLIT',
  'SELL_SHORT',
  'BUY_TO_COVER',
  'DIV_PAID',
  'BORROW_FEE',
  'BTO',
  'STO',
  'BTC',
  'STC',
  'EXP',
  'ASN',
  'EXR',
] as const;
type TxType = (typeof TX_TYPES)[number];
const isTxType = (type: string): type is TxType => (TX_TYPES as readonly string[]).includes(type);

export const typeLabel = (type: string): string => (isTxType(type) ? t(`txType.${type}`) : type);

export const rightLabel = (right: 'CALL' | 'PUT'): string =>
  t(right === 'CALL' ? 'common.call' : 'common.put');

export const joinList = (items: readonly string[]): string => items.join(t('common.listSeparator'));

export function describeCounts(c: BackupCounts): string {
  return joinList(
    [
      t('counts.account', { count: c.accounts }),
      t('counts.transaction', { count: c.transactions }),
      c.feeSchedules > 0 && t('counts.feeSchedule', { count: c.feeSchedules }),
      c.strategyGroups > 0 && t('counts.strategyGroup', { count: c.strategyGroups }),
      c.manualMarks > 0 && t('counts.manualMark', { count: c.manualMarks }),
      c.contractAdjustments > 0 && t('counts.contractAdjustment', { count: c.contractAdjustments }),
    ].filter((part): part is string => Boolean(part)),
  );
}

export function toDecimalInput(text: string): string {
  const value = text.trim();
  const decimalMark = numberFormat({})
    .formatToParts(1.5)
    .find((p) => p.type === 'decimal')?.value;
  if (decimalMark !== ',' || !value.includes(',')) return value;
  const normalized = value.replace(/[.\s']/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : value;
}
