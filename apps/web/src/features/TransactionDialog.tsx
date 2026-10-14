import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calculateFee, type FeeInput } from '@tickrs/core';
import { AutocompleteField, Banner, Button, Col, Field, Row, Select, Text } from '@tickrs/ui';
import { Dialog } from '@tickrs/ui';
import {
  type AssignmentExerciseType,
  type CreateTransactionRequest,
  type FeeScheduleResponse,
  isAssignmentOrExercise,
  isCashAmount,
  isFeeCharged,
  isOptionLifecycle,
  isPriced,
  nonNegativeDecimal,
  OPTION_TRANSACTION_TYPES,
  type OptionTradeType,
  positiveDecimal,
  type StockTradeType,
} from '@tickrs/shared';
import { t as translate, useT } from '../i18n.js';
import { accountNameFor } from './AccountDialog.js';
import {
  ApiError,
  errorText,
  fieldErrorsOf,
  isConfirmationRequired,
  type Account,
  type OptionPosition,
  type Transaction,
} from '../lib/api.js';
import { formatMoney, toDecimalInput, todayIso, typeLabel } from '../lib/format.js';
import { listingIn, marketOfSymbol, optionTermsOf, optionUnderlying, splitListing } from '../lib/markets.js';
import {
  addAccounts,
  createTransaction,
  keys,
  lookupContractTerms,
  useFeeSchedule,
  useLedgerMutation,
  useMarkets,
  useSecuritySearch,
} from '../lib/queries.js';

type Kind = 'STOCK' | 'OPTION';

export function feeFor(
  schedule: FeeScheduleResponse | undefined,
  input: Omit<FeeInput, 'type' | 'multiplier'> & { type: string; multiplier?: string },
): string | null {
  if (schedule === undefined || !isFeeCharged(input.type)) return null;
  if (!positiveDecimal.safeParse(input.quantity).success) return null;
  if (!nonNegativeDecimal.safeParse(input.price).success) return null;
  const multiplier =
    input.multiplier && positiveDecimal.safeParse(input.multiplier).success ? input.multiplier : undefined;
  return calculateFee(schedule ?? {}, { ...input, type: input.type, multiplier }).total;
}

const stockTypes = () => [
  { value: 'BUY', label: typeLabel('BUY') },
  { value: 'SELL', label: typeLabel('SELL') },
  { value: 'SELL_SHORT', label: typeLabel('SELL_SHORT') },
  { value: 'BUY_TO_COVER', label: typeLabel('BUY_TO_COVER') },
  { value: 'DIV_CASH', label: translate('transactionDialog.dividendCash') },
  { value: 'DIV_REINVEST', label: translate('transactionDialog.dividendReinvested') },
  { value: 'DIV_PAID', label: translate('transactionDialog.dividendPaid') },
  { value: 'BORROW_FEE', label: typeLabel('BORROW_FEE') },
  { value: 'SPLIT', label: typeLabel('SPLIT') },
];
const optionTypes = () => OPTION_TRANSACTION_TYPES.map((value) => ({ value, label: typeLabel(value) }));

export interface TransactionDialogProps {
  open: boolean;
  onClose(): void;
  accounts: Account[];
  defaultAccountId?: string;
  defaultSymbol?: string;
  defaultType?: string;
  onSaved?(created: Transaction[]): void;
  mode?: 'transaction' | 'option';
  closing?: OptionPosition | null;
}

export interface TransactionDraft {
  type: string;
  chosenAccountId: string;
  tradeDate: string;
  symbol: string;
  quantity: string;
  price: string;
  amount: string;
  fee: string;
  splitFrom: string;
  splitTo: string;
  expiration: string;
  strike: string;
  right: 'CALL' | 'PUT';
  multiplier: string;
  sizeTyped: boolean;
  notes: string;
  chosenMarket: string;
}

export function transactionBody(
  draft: TransactionDraft,
  form: {
    kind: Kind;
    accountId: string;
    listing: string;
    listingCurrency?: string;
    size: string;
    cashSettled: boolean;
    confirmNegativeStock: boolean;
  },
): CreateTransactionRequest {
  const { type } = draft;
  const common = {
    accountId: form.accountId,
    tradeDate: draft.tradeDate,
    ...(draft.notes ? { notes: draft.notes } : {}),
  };
  const fee = { fee: draft.fee.trim() !== '' ? toDecimalInput(draft.fee) : '0' };
  const [quantity, price] = [toDecimalInput(draft.quantity), toDecimalInput(draft.price)];

  if (form.kind === 'STOCK') {
    const stock = {
      ...common,
      assetClass: 'STOCK' as const,
      symbol: form.listing,
      ...(form.listingCurrency ? { currency: form.listingCurrency } : {}),
    };
    if (type === 'SPLIT') {
      return {
        ...stock,
        type,
        splitFrom: toDecimalInput(draft.splitFrom),
        splitTo: toDecimalInput(draft.splitTo),
      };
    }
    if (type === 'BORROW_FEE') return { ...stock, type, amount: toDecimalInput(draft.amount) };
    if (type === 'DIV_CASH' || type === 'DIV_PAID') {
      return { ...stock, ...fee, type, amount: toDecimalInput(draft.amount) };
    }
    if (type === 'DIV_REINVEST') return { ...stock, ...fee, type, quantity, price };
    return { ...stock, ...fee, type: type as StockTradeType, quantity, price };
  }

  const option = {
    ...common,
    ...fee,
    assetClass: 'OPTION' as const,
    contract: {
      underlying: draft.symbol,
      expiration: draft.expiration,
      strike: toDecimalInput(draft.strike),
      right: draft.right,
      ...(form.size.trim() ? { multiplier: toDecimalInput(form.size) } : {}),
    },
    ...(form.confirmNegativeStock ? { confirmNegativeStock: true } : {}),
  };
  if (isPriced(type)) return { ...option, type: type as OptionTradeType, quantity, price };
  if (type === 'EXP') return { ...option, type, ...(draft.quantity.trim() ? { quantity } : {}) };
  return {
    ...option,
    type: type as AssignmentExerciseType,
    quantity,
    ...(isAssignmentOrExercise(type) && form.cashSettled ? { price } : {}),
  };
}

export function TransactionDialog({
  open,
  onClose,
  accounts,
  defaultAccountId,
  defaultSymbol = '',
  defaultType = 'BUY',
  onSaved,
  mode = 'transaction',
  closing = null,
}: TransactionDialogProps) {
  const t = useT();
  const kind: Kind = mode === 'option' ? 'OPTION' : 'STOCK';
  const [draft, setDraft] = useState<TransactionDraft>(() => ({
    type: closing ? (closing.side === 'SHORT' ? 'BTC' : 'STC') : mode === 'option' ? 'STO' : defaultType,
    chosenAccountId: closing?.accounts[0]?.id ?? '',
    tradeDate: todayIso(),
    symbol: closing?.underlying ?? defaultSymbol,
    quantity: closing?.contracts ?? '',
    price: '',
    amount: '',
    fee: '',
    splitFrom: '1',
    splitTo: '2',
    expiration: closing?.expiration ?? '',
    strike: closing?.strike ?? '',
    right: closing?.right ?? 'CALL',
    multiplier: '',
    sizeTyped: false,
    notes: '',
    chosenMarket: '',
  }));
  const update = (patch: Partial<TransactionDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const { type, tradeDate, symbol, quantity, price, amount, fee, splitFrom, splitTo } = draft;
  const { expiration, strike, right, multiplier, sizeTyped, notes } = draft;
  const accountId = draft.chosenAccountId || defaultAccountId || accounts[0]?.id || '';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmNegativeStock, setConfirmNegativeStock] = useState(false);
  const [mismatchCurrency, setMismatchCurrency] = useState<string | null>(null);
  const [addingPortfolio, setAddingPortfolio] = useState(false);
  const client = useQueryClient();

  const accountCurrency = accounts.find((a) => a.id === accountId)?.currency ?? 'USD';
  const currency = accountCurrency;

  const search = useSecuritySearch(symbol, open);
  const markets = useMarkets(open);
  const marketList = Array.isArray(markets.data?.items) ? markets.data.items : [];
  const typed = symbol.trim().toUpperCase();
  const known = (search.data?.items ?? []).some((s) => s.symbol === typed);
  const needsMarket =
    kind === 'STOCK' &&
    marketList.length > 1 &&
    typed !== '' &&
    !known &&
    !splitListing(marketList, typed).suffix;
  const market =
    draft.chosenMarket ||
    marketList.find((m) => m.currency === accountCurrency)?.code ||
    marketList.find((m) => m.isHome)?.code ||
    '';
  const listing = needsMarket ? listingIn(marketList, typed, market) : symbol;

  const underlying = kind === 'OPTION' ? optionUnderlying(marketList, typed, accountCurrency) : '';
  const feeSchedule = useFeeSchedule(open ? accountId : undefined);

  const knownTerms = useQuery({
    enabled: open && kind === 'OPTION' && !closing && typed !== '',
    queryKey: keys.contractTerms(typed, expiration, strike, right, accountCurrency),
    queryFn: () =>
      lookupContractTerms({
        underlying: typed,
        currency: accountCurrency,
        expiration,
        strike: strike.trim() ? toDecimalInput(strike) : undefined,
        right,
      }),
    retry: false,
  });
  const recorded =
    knownTerms.data?.source === 'CONTRACT' || knownTerms.data?.source === 'UNDERLYING'
      ? knownTerms.data
      : null;
  const terms = closing
    ? { multiplier: closing.multiplier, style: closing.style, settlement: closing.settlement }
    : recorded?.multiplier && recorded.style && recorded.settlement
      ? { multiplier: recorded.multiplier, style: recorded.style, settlement: recorded.settlement }
      : optionTermsOf(marketList, underlying);
  const unsupported = kind === 'OPTION' && marketList.length > 0 && underlying !== '' && !terms;
  const size = terms?.multiplier ?? (marketList.length === 0 ? '100' : null);
  const sizeValue = sizeTyped ? multiplier : (recorded?.multiplier ?? size ?? '');
  const quotedSymbol = (kind === 'OPTION' ? underlying : listing).trim().toUpperCase();
  const feeAuto = feeFor(feeSchedule.data, {
    type,
    quantity: toDecimalInput(quantity) || '1',
    price: toDecimalInput(price) || '0',
    multiplier: kind === 'OPTION' ? toDecimalInput(sizeValue) : undefined,
    usListing:
      !quotedSymbol || marketList.length === 0 || marketOfSymbol(marketList, quotedSymbol)?.country === 'US',
  });
  const isIndex = underlying.startsWith('^');
  const cashSettled = terms?.settlement === 'CASH';
  const settles = isAssignmentOrExercise(type);
  const earlyExercise =
    terms?.style === 'EUROPEAN' && settles && expiration !== '' && tradeDate !== expiration;

  const suggestions = (search.data?.items ?? []).map((s) => ({
    value: s.symbol,
    label: s.symbol,
    detail: [s.name, s.exchange, s.currency].filter(Boolean).join(' · '),
    currency: s.currency,
  }));

  const save = useLedgerMutation(() =>
    createTransaction(
      transactionBody(draft, {
        kind,
        accountId,
        listing,
        listingCurrency: search.data?.items?.find((s) => s.symbol === listing.trim().toUpperCase())?.currency,
        size: sizeValue,
        cashSettled,
        confirmNegativeStock,
      }),
    ),
  );

  const submit = () => {
    setErrors({});
    setFormError(null);
    setMismatchCurrency(null);
    save.mutate(undefined as never, {
      onSuccess: (data) => {
        onSaved?.(data.items);
        update({ quantity: '', price: '', amount: '', fee: '' });
        onClose();
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError) {
          setErrors(fieldErrorsOf(error));
          setFormError(errorText(error, t('transactionDialog.saveFailed')));
          if (isConfirmationRequired(error)) setConfirmNegativeStock(true);
          const refused = (error.details as { currency?: unknown } | undefined)?.currency;
          if (error.code === 'CURRENCY_MISMATCH' && typeof refused === 'string') setMismatchCurrency(refused);
        } else {
          setFormError(t('transactionDialog.saveFailed'));
        }
      },
    });
  };

  const addPortfolio = async (code: string) => {
    const name = accountNameFor(t('import.newAccountName'), code);
    setAddingPortfolio(true);
    try {
      const existing = accounts.find((a) => a.name === name && a.currency === code);
      const id = existing?.id ?? (await addAccounts([{ name, broker: null, currency: code }])).items[0]?.id;
      await client.invalidateQueries({ queryKey: keys.accounts });
      if (id) update({ chosenAccountId: id });
      setMismatchCurrency(null);
      setFormError(null);
    } catch (error: unknown) {
      setFormError(errorText(error, t('transactionDialog.addPortfolioFailed')));
    } finally {
      setAddingPortfolio(false);
    }
  };

  const types = kind === 'STOCK' ? stockTypes() : optionTypes();
  const showsQuantity = isPriced(type) || (kind === 'OPTION' && isOptionLifecycle(type));
  const sizeField = kind === 'OPTION' && !closing && (
    <Field
      label={t('transactionDialog.contractSize')}
      value={sizeValue}
      onChange={(v) => update({ sizeTyped: true, multiplier: v })}
      error={errors.multiplier}
      placeholder={size ?? ''}
      hint={t('transactionDialog.contractSizeShares')}
      required
      requiredMessage={t('transactionDialog.contractSizeRequired')}
    />
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        closing
          ? t('transactionDialog.closeOption')
          : mode === 'option'
            ? t('transactionDialog.addOption')
            : t('transactionDialog.addTransaction')
      }
      onSubmit={submit}
      actions={
        <>
          <Button onClick={onClose} variant="text">
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {confirmNegativeStock ? t('transactionDialog.confirmAndSave') : t('common.save')}
          </Button>
        </>
      }
    >
      <Col gap={2}>
        {formError && (
          <Banner
            tone={confirmNegativeStock ? 'warning' : 'error'}
            title={confirmNegativeStock ? t('transactionDialog.confirm') : undefined}
            action={
              mismatchCurrency && (
                <Button
                  variant="text"
                  disabled={addingPortfolio}
                  onClick={() => void addPortfolio(mismatchCurrency)}
                >
                  {t('transactionDialog.addPortfolio')}
                </Button>
              )
            }
          >
            {formError}
          </Banner>
        )}

        <Row gap={2} responsive align="start">
          <Select
            label={t('common.account')}
            value={accountId}
            onChange={(v) => update({ chosenAccountId: v })}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
          <Select
            label={t('common.type')}
            value={type}
            onChange={(v) => update({ type: v })}
            options={types}
          />
          <Field
            label={t('common.date')}
            type="date"
            value={tradeDate}
            onChange={(v) => update({ tradeDate: v })}
            error={errors.tradeDate}
          />
        </Row>

        <Row gap={2} responsive align="start">
          <AutocompleteField
            label={kind === 'OPTION' ? t('transactionDialog.underlying') : t('transactionDialog.ticker')}
            value={symbol}
            onChange={(v) => update({ symbol: v.toUpperCase(), sizeTyped: false, multiplier: '' })}
            suggestions={suggestions}
            loading={search.isFetching}
            error={errors.symbol}
            hint={
              kind === 'STOCK'
                ? t('transactionDialog.tickerHint', { currency: accountCurrency })
                : unsupported
                  ? t('transactionDialog.optionsNotSupported', { symbol: underlying })
                  : underlying !== '' && underlying !== typed
                    ? t('transactionDialog.recordedAs', { symbol: underlying })
                    : t('transactionDialog.underlyingHint')
            }
            required
          />
          {needsMarket && (
            <Select
              label={t('transactionDialog.market')}
              value={market}
              onChange={(v) => update({ chosenMarket: v })}
              options={marketList.map((m) => ({ value: m.code, label: `${m.name} (${m.currency})` }))}
              hint={t('transactionDialog.marketHint', { symbol: listing })}
            />
          )}
        </Row>

        {kind === 'OPTION' && (
          <Row gap={2} responsive align="start">
            <Field
              label={t('common.expiration')}
              type="date"
              value={expiration}
              onChange={(v) => update({ expiration: v })}
              required
            />
            <Field
              label={t('common.strike')}
              value={strike}
              onChange={(v) => update({ strike: v })}
              required
            />
            <Select
              label={t('transactionDialog.callPut')}
              value={right}
              onChange={(v) => update({ right: v === 'PUT' ? 'PUT' : 'CALL' })}
              options={[
                { value: 'CALL', label: t('common.call') },
                { value: 'PUT', label: t('common.put') },
              ]}
            />
          </Row>
        )}

        {kind === 'STOCK' && type === 'SPLIT' && (
          <Row gap={2} align="start">
            <Field
              label={t('transactionDialog.splitFrom')}
              value={splitFrom}
              onChange={(v) => update({ splitFrom: v })}
            />
            <Field
              label={t('transactionDialog.splitTo')}
              value={splitTo}
              onChange={(v) => update({ splitTo: v })}
              hint={t('transactionDialog.splitHint')}
            />
          </Row>
        )}

        {showsQuantity && (
          <Row gap={2} responsive align="start">
            {sizeField}
            <Field
              label={kind === 'OPTION' ? t('transactionDialog.contracts') : t('common.quantity')}
              value={quantity}
              onChange={(v) => update({ quantity: v })}
              error={errors.quantity}
              hint={
                kind !== 'OPTION'
                  ? undefined
                  : type === 'EXP'
                    ? t('transactionDialog.contractsHintExpire')
                    : isIndex
                      ? t('transactionDialog.contractsHintIndex', { size: size ?? '', currency })
                      : t('transactionDialog.contractsHint', { size: size ?? '100' })
              }
              required={type !== 'EXP'}
            />
            {isPriced(type) && (
              <Field
                label={
                  kind === 'OPTION'
                    ? t('transactionDialog.premiumPerShare')
                    : t('transactionDialog.pricePerShare')
                }
                value={price}
                onChange={(v) => update({ price: v })}
                error={errors.price}
                hint={
                  kind === 'OPTION' ? t('transactionDialog.premiumHint', { size: size ?? '100' }) : undefined
                }
                required
              />
            )}
            {kind === 'OPTION' && settles && cashSettled && (
              <Field
                label={t('transactionDialog.settlementPrice')}
                value={price}
                onChange={(v) => update({ price: v })}
                error={errors.price}
                hint={t('transactionDialog.settlementPriceHint')}
                required
              />
            )}
          </Row>
        )}

        {kind === 'STOCK' && isCashAmount(type) && (
          <Row gap={2} responsive align="start">
            <Field
              label={t('common.amount')}
              value={amount}
              onChange={(v) => update({ amount: v })}
              error={errors.amount}
              hint={
                type === 'DIV_PAID'
                  ? t('transactionDialog.dividendPaidHint')
                  : type === 'BORROW_FEE'
                    ? t('transactionDialog.borrowFeeHint')
                    : undefined
              }
              required
            />
          </Row>
        )}

        {type !== 'SPLIT' && type !== 'BORROW_FEE' && (
          <Row gap={2} responsive>
            <Field
              label={t('common.fee')}
              value={fee}
              onChange={(v) => update({ fee: v })}
              error={errors.fee}
              hint={
                feeAuto
                  ? t('transactionDialog.feeFromSchedule', { fee: formatMoney(feeAuto, currency) })
                  : undefined
              }
              placeholder="0"
            />
          </Row>
        )}

        <Field label={t('common.notes')} value={notes} onChange={(v) => update({ notes: v })} />
        {earlyExercise && (
          <Banner tone="warning">{t('transactionDialog.europeanStyle', { date: expiration })}</Banner>
        )}
        {kind === 'OPTION' && (
          <Text variant="caption" muted>
            {cashSettled ? t('transactionDialog.lifecycleNoteCash') : t('transactionDialog.lifecycleNote')}
          </Text>
        )}
      </Col>
    </Dialog>
  );
}
