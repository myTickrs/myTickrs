import type { Migration } from 'kysely/migration';
import * as m0001 from './0001_initial.js';
import * as m0002 from './0002_currencies.js';
import * as m0003 from './0003_fx_rate_places.js';
import * as m0004 from './0004_restate_values.js';
import * as m0005 from './0005_contract_key.js';
import * as m0006 from './0006_shared_option_quotes.js';

export const migrations: Record<string, Migration> = {
  '0001_initial': m0001,
  '0002_currencies': m0002,
  '0003_fx_rate_places': m0003,
  '0004_restate_values': m0004,
  '0005_contract_key': m0005,
  '0006_shared_option_quotes': m0006,
};
