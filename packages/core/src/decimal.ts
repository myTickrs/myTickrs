import { Decimal } from 'decimal.js';

export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
export type Dec = InstanceType<typeof Dec>;

export type DecimalInput = string | Dec;

const DECIMAL_STRING = /^-?(?:\d+)(?:\.\d+)?$/;

export function isDecimalString(s: string): boolean {
  return DECIMAL_STRING.test(s);
}

export function dec(value: DecimalInput): Dec {
  if (typeof value === 'string') {
    if (!isDecimalString(value)) throw new TypeError(`Not a decimal string: "${value}"`);
    return new Dec(value);
  }
  return value;
}

export function sum(values: Iterable<DecimalInput>): Dec {
  let total = new Dec(0);
  for (const v of values) total = total.plus(dec(v));
  return total;
}

export function toDecimalString(value: DecimalInput): string {
  const d = dec(value);
  return d.isZero() ? '0' : d.toFixed();
}

export function toMoneyString(value: DecimalInput, places = 2): string {
  return dec(value).toFixed(places, Dec.ROUND_HALF_EVEN);
}

export const FX_RATE_PLACES = 8;

export function toFxRateString(value: DecimalInput): string {
  return toDecimalString(dec(value).toDecimalPlaces(FX_RATE_PLACES, Dec.ROUND_HALF_UP));
}

export function decEquals(a: DecimalInput, b: DecimalInput): boolean {
  return dec(a).equals(dec(b));
}
