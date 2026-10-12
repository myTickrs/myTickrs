import type { Migration } from 'kysely/migration';
import * as m0001 from './0001_initial.js';
import * as m0002 from './0002_currencies.js';
import * as m0003 from './0003_fx_rate_places.js';

export const migrations: Record<string, Migration> = {
  '0001_initial': m0001,
  '0002_currencies': m0002,
  '0003_fx_rate_places': m0003,
};
