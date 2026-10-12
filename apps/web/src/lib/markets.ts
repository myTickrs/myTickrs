import {
  catalogMarket,
  defaultOptionTerms,
  indexByAlias,
  MARKET_CATALOG,
  optionIndex,
  type OptionTerms,
} from '@tickrs/shared';
import type { MarketItem } from './api.js';

export function splitListing(markets: readonly MarketItem[], symbol: string) {
  const upper = symbol.toUpperCase();
  const dot = upper.lastIndexOf('.');
  const suffix = dot > 0 ? upper.slice(dot + 1) : '';
  const owner = suffix ? markets.find((m) => m.suffixes.some((s) => s.suffix === suffix)) : undefined;
  return owner
    ? { ticker: upper.slice(0, dot), suffix, market: owner }
    : { ticker: upper, suffix: null, market: markets.find((m) => m.isHome) };
}

export function listingIn(markets: readonly MarketItem[], ticker: string, code: string): string {
  const { ticker: bare, suffix, market } = splitListing(markets, ticker);
  if (suffix && market?.code === code) return `${bare}.${suffix}`;
  const own = markets.find((m) => m.code === code)?.suffixes[0]?.suffix;
  return own ? `${bare}.${own}` : bare;
}

export function marketOfSymbol(markets: readonly MarketItem[], symbol: string): MarketItem | undefined {
  const index = optionIndex(symbol);
  if (index) return markets.find((m) => m.country === index.country);
  return splitListing(markets, symbol).market;
}

export function optionUnderlying(
  markets: readonly MarketItem[],
  written: string,
  accountCurrency: string,
): string {
  const upper = written.trim().toUpperCase();
  if (!upper || optionIndex(upper)) return upper;
  const inCurrency = markets.filter((m) => m.currency === accountCurrency);
  const market = inCurrency.find((m) => m.isHome) ?? (inCurrency.length === 1 ? inCurrency[0] : undefined);
  const countries = market ? [market.country] : inCurrency.map((m) => m.country);
  const alias = countries.map((c) => indexByAlias(upper.replace(/^\^/, ''), c)).find(Boolean);
  if (alias) return alias.symbol;
  if (!market || splitListing(markets, upper).suffix) return upper;
  return listingIn(markets, upper, market.code);
}

export function optionTermsOf(markets: readonly MarketItem[], underlying: string): OptionTerms | undefined {
  return underlying
    ? defaultOptionTerms(underlying, marketOfSymbol(markets, underlying)?.country)
    : undefined;
}

export function utcOffset(
  timezone: string,
  language: string,
  at: Date = new Date(),
): { label: string; minutes: number } {
  try {
    const label =
      new Intl.DateTimeFormat(language, { timeZone: timezone, timeZoneName: 'shortOffset' })
        .formatToParts(at)
        .find((p) => p.type === 'timeZoneName')?.value ?? '';
    const local = new Date(at.toLocaleString('en-US', { timeZone: timezone }));
    const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
    return { label, minutes: Math.round((local.getTime() - utc.getTime()) / 60_000) };
  } catch {
    return { label: '', minutes: 0 };
  }
}

export function countryName(country: string, language: string): string {
  try {
    const style = country === 'HK' ? 'short' : 'long';
    return new Intl.DisplayNames([language], { type: 'region', style }).of(country) ?? country;
  } catch {
    return country;
  }
}

export function marketOptions(
  current: { country: string; timezone: string },
  language: string,
): { value: string; label: string }[] {
  const choices = MARKET_CATALOG.map((m) => ({
    value: m.country,
    offset: utcOffset(m.timezone, language),
    label: [countryName(m.country, language), m.exchanges],
  }));
  if (!catalogMarket(current.country) && current.timezone) {
    choices.push({
      value: '',
      offset: utcOffset(current.timezone, language),
      label: [current.timezone.replaceAll('_', ' ')],
    });
  }
  return choices
    .toSorted(
      (a, b) => a.offset.minutes - b.offset.minutes || a.label[0]!.localeCompare(b.label[0]!, language),
    )
    .map((c) => ({ value: c.value, label: [...c.label, c.offset.label].filter(Boolean).join(' · ') }));
}
