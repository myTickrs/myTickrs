import { EDITABLE_TYPE_FAMILIES, isOpeningTrade } from '@tickrs/shared';
import { Col, Field, Row, Select } from '@tickrs/ui';
import { t as translate, useT } from '../i18n.js';
import type { Account, Transaction } from '../lib/api.js';
import { toDecimalInput, typeLabel } from '../lib/format.js';

export type EditableField =
  | 'accountId'
  | 'type'
  | 'symbol'
  | 'underlying'
  | 'expiration'
  | 'strike'
  | 'right'
  | 'tradeDate'
  | 'quantity'
  | 'price'
  | 'fee'
  | 'amount'
  | 'splitFrom'
  | 'splitTo'
  | 'realizedBefore'
  | 'notes';

export type TransactionEdits = Partial<Record<EditableField, string>>;

const TRADES = new Set([
  'BUY',
  'SELL',
  'SELL_SHORT',
  'BUY_TO_COVER',
  'BTO',
  'STO',
  'BTC',
  'STC',
  'DIV_REINVEST',
]);
const LIFECYCLE = new Set(['EXP', 'ASN', 'EXR']);
const AMOUNTS = new Set(['DIV_CASH', 'DIV_PAID', 'BORROW_FEE']);
const CONTRACT_FIELDS = ['underlying', 'expiration', 'strike', 'right'] as const;
const DECIMAL_FIELDS = new Set<EditableField>([
  'strike',
  'quantity',
  'price',
  'fee',
  'amount',
  'splitFrom',
  'splitTo',
  'realizedBefore',
]);

export function typeChoices(tx: Pick<Transaction, 'type'>): readonly string[] | null {
  return EDITABLE_TYPE_FAMILIES.find((family) => family.includes(tx.type)) ?? null;
}

function detailFields(tx: Transaction): EditableField[] {
  const fields: EditableField[] =
    tx.assetClass === 'STOCK' ? ['symbol'] : tx.optionContract ? [...CONTRACT_FIELDS] : [];
  if (TRADES.has(tx.type)) fields.push('quantity', 'price', 'fee');
  else if (LIFECYCLE.has(tx.type)) fields.push('quantity', 'fee');
  else if (AMOUNTS.has(tx.type)) fields.push('amount');
  else if (tx.type === 'SPLIT') fields.push('splitFrom', 'splitTo');
  if (isOpeningTrade(tx.type) && tx.realizedBefore != null) fields.push('realizedBefore');
  fields.push('notes');
  return fields;
}

export function originalValue(tx: Transaction, field: EditableField): string {
  const contract = tx.optionContract;
  switch (field) {
    case 'accountId':
      return tx.accountId;
    case 'type':
      return tx.type;
    case 'underlying':
    case 'expiration':
    case 'right':
      return contract?.[field] ?? '';
    case 'strike':
      return contract ? (contract.issuedStrike ?? contract.strike) : '';
    default:
      return (tx[field] ?? '') as string;
  }
}

const sameNumber = (a: string, b: string) => a !== '' && b !== '' && Number(a) === Number(b);

function changed(tx: Transaction, edits: TransactionEdits, field: EditableField): boolean {
  const typed = edits[field];
  if (typed === undefined) return false;
  const next = DECIMAL_FIELDS.has(field) ? toDecimalInput(typed.trim()) : typed.trim();
  const before = originalValue(tx, field);
  return DECIMAL_FIELDS.has(field) ? next !== before && !sameNumber(next, before) : next !== before;
}

export const changesContract = (tx: Transaction, edits: TransactionEdits) =>
  CONTRACT_FIELDS.some((f) => changed(tx, edits, f));

export function transactionErrors(tx: Transaction, edits: TransactionEdits): TransactionEdits {
  const errors: TransactionEdits = {};
  for (const f of DECIMAL_FIELDS) {
    if (!changed(tx, edits, f)) continue;
    const value = toDecimalInput((edits[f] ?? '').trim());
    if ((f === 'fee' || f === 'realizedBefore') && value === '') continue;
    if (!/^-?\d+(\.\d+)?$/.test(value)) {
      errors[f] =
        f === 'price' ? translate('editTransaction.enterPrice') : translate('editTransaction.enterNumber');
    }
  }
  return errors;
}

export function transactionChanges(tx: Transaction, edits: TransactionEdits): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const current = (f: EditableField) => {
    const value = (edits[f] ?? originalValue(tx, f)).trim();
    return DECIMAL_FIELDS.has(f) ? toDecimalInput(value) : value;
  };
  if (changed(tx, edits, 'accountId')) out.accountId = current('accountId');
  if (changed(tx, edits, 'type')) out.type = current('type');
  if (changed(tx, edits, 'tradeDate')) out.tradeDate = current('tradeDate');
  if (changesContract(tx, edits)) {
    out.contract = {
      underlying: current('underlying').toUpperCase(),
      expiration: current('expiration'),
      strike: current('strike'),
      right: current('right'),
    };
  }
  for (const f of detailFields(tx)) {
    if ((CONTRACT_FIELDS as readonly string[]).includes(f) || !changed(tx, edits, f)) continue;
    const next = current(f);
    out[f] = f === 'notes' || f === 'realizedBefore' ? next || null : next;
  }
  return out;
}

const labelOf = (field: EditableField, option: boolean): string =>
  ({
    accountId: translate('common.account'),
    type: translate('common.type'),
    symbol: translate('common.symbol'),
    underlying: translate('transactionDialog.underlying'),
    expiration: translate('common.expiration'),
    strike: translate('common.strike'),
    right: translate('transactionDialog.callPut'),
    tradeDate: translate('editTransaction.tradeDate'),
    quantity: option ? translate('transactionDialog.contracts') : translate('common.quantity'),
    price: option ? translate('transactionDialog.premiumPerShare') : translate('common.price'),
    fee: translate('common.fee'),
    amount: translate('common.amount'),
    splitFrom: translate('editTransaction.splitFrom'),
    splitTo: translate('editTransaction.splitTo'),
    realizedBefore: translate('editTransaction.realizedBefore'),
    notes: translate('common.notes'),
  })[field];

const ROWS: EditableField[][] = [
  ['symbol'],
  ['underlying'],
  ['expiration', 'strike', 'right'],
  ['quantity', 'price'],
  ['amount'],
  ['splitFrom', 'splitTo'],
  ['fee'],
  ['realizedBefore'],
  ['notes'],
];

export function TransactionEditFields({
  transaction,
  accounts,
  edits,
  errors = {},
  onChange,
  types,
  disabled,
}: {
  transaction: Transaction;
  accounts: Account[];
  edits: TransactionEdits;
  errors?: TransactionEdits;
  onChange(edits: TransactionEdits): void;
  types?: readonly string[];
  disabled?: boolean;
}) {
  const t = useT();
  const tx = transaction;
  const option = tx.assetClass === 'OPTION';
  const value = (f: EditableField) => edits[f] ?? originalValue(tx, f);
  const set = (f: EditableField) => (v: string) =>
    onChange({ ...edits, [f]: f === 'symbol' || f === 'underlying' ? v.toUpperCase() : v });
  const fields = new Set(detailFields(tx));

  const accountOptions = accounts
    .filter((a) => a.id === tx.accountId || tx.assetClass !== 'STOCK' || a.currency === tx.currency)
    .map((a) => ({ value: a.id, label: a.name }));
  const choices = (types ?? typeChoices(tx))?.filter((type) => typeChoices(tx)?.includes(type));
  const moving = changed(tx, edits, 'accountId');
  const requoted = moving || changed(tx, edits, 'type') || changesContract(tx, edits);

  const box = (f: EditableField) => {
    if (f === 'right') {
      return (
        <Select
          key={f}
          label={labelOf(f, option)}
          value={value(f)}
          onChange={set(f)}
          disabled={disabled}
          options={[
            { value: 'CALL', label: t('common.call') },
            { value: 'PUT', label: t('common.put') },
          ]}
        />
      );
    }
    return (
      <Field
        key={f}
        label={labelOf(f, option)}
        type={f === 'expiration' ? 'date' : 'text'}
        value={value(f)}
        onChange={set(f)}
        disabled={disabled}
        error={errors[f]}
        hint={
          f === 'fee' && tx.feeSource === 'AUTO'
            ? requoted && edits.fee === undefined
              ? moving
                ? t('editTransaction.feeRecalculated')
                : t('editTransaction.feeRequoted')
              : t('editTransaction.feeAuto')
            : f === 'realizedBefore'
              ? t('editTransaction.realizedBeforeHint')
              : f === 'underlying'
                ? t('transactionDialog.underlyingHint')
                : option && f === 'quantity'
                  ? t('transactionDialog.contractsHint')
                  : option && f === 'price'
                    ? t('transactionDialog.premiumHint')
                    : undefined
        }
      />
    );
  };

  return (
    <Col gap={2}>
      <Row gap={2} responsive align="start">
        <Select
          label={t('common.account')}
          value={value('accountId')}
          onChange={set('accountId')}
          options={accountOptions}
          disabled={disabled}
        />
        {choices && choices.length > 1 && (
          <Select
            label={t('common.type')}
            value={value('type')}
            onChange={set('type')}
            options={choices.map((type) => ({ value: type, label: typeLabel(type) }))}
            disabled={disabled}
          />
        )}
        <Field
          label={labelOf('tradeDate', option)}
          type="date"
          value={value('tradeDate')}
          onChange={set('tradeDate')}
          disabled={disabled}
          error={errors.tradeDate}
        />
      </Row>
      {ROWS.map((row) => {
        const shown = row.filter((f) => fields.has(f));
        return shown.length === 0 ? null : (
          <Row key={row.join()} gap={2} responsive align="start">
            {shown.map(box)}
          </Row>
        );
      })}
    </Col>
  );
}
