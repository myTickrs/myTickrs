import type { IsoDate } from '@tickrs/core';
import { marketClock } from './calendar.js';
import { US_MARKET } from './markets.js';

const us = marketClock(US_MARKET);

export const newYorkDate = (at: Date = new Date()): IsoDate => us.date(at);

export const isMarketOpen = (at: Date = new Date()): boolean => us.isOpen(at);

export const quoteTtlMs = (at: Date = new Date()): number => us.quoteTtlMs(at);

export const isStale = (asOf: string, ttlMs: number, now: Date = new Date()): boolean =>
  now.getTime() - Date.parse(asOf) > ttlMs;

export const marketHolidays = (year: number): ReadonlySet<string> => us.holidays(year);

export const isMarketHoliday = (date: IsoDate): boolean => us.isHoliday(date);

export const isTradingDay = (date: IsoDate): boolean => us.isTradingDay(date);

export const lastTradingDay = (date: IsoDate): IsoDate => us.lastTradingDay(date);

export const lastCompletedTradingDay = (at: Date = new Date()): IsoDate => us.lastCompletedTradingDay(at);
