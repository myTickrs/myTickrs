import { MAPPING_FIELDS, type Mapping, type MappingField } from '@tickrs/shared';

export const normalizeHeader = (header: string): string =>
  header
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();

const SYNONYMS: Record<MappingField, string[]> = {
  symbol: ['symbol', 'ticker', 'instrument', 'security', 'securitysymbol', 'stocksymbol'],
  quantity: ['quantity', 'qty', 'shares', 'numberofshares', 'contracts', 'units'],
  averagePrice: [
    'costbasisprice',
    'costbasispershare',
    'averageprice',
    'averageentryprice',
    'avgprice',
    'averagecost',
    'avgcost',
    'costpershare',
    'averagecostpershare',
    'unitcost',
    'costprice',
    'bookcostpershare',
    'avgcostbasis',
  ],
  costBasis: ['costbasis', 'costbasistotal', 'totalcost', 'bookvalue', 'bookcost', 'cost', 'costbasisvalue'],
  marketValue: ['marketvalue', 'currentvalue', 'value', 'mktval', 'marketval', 'positionvalue'],
  unrealizedPnl: [
    'unrealizedpnl',
    'unrealizedpl',
    'unrealizedgainloss',
    'unrealizedgain',
    'totalgainloss',
    'gainloss',
    'openpl',
    'openpnl',
    'unrealized',
  ],
  realizedPnl: ['realizedpnl', 'realizedpl', 'realizedgainloss', 'realizedgain', 'closedpl', 'realized'],
  currency: ['currency', 'ccy', 'curr', 'tradecurrency', 'currencyprimary'],
  description: ['description', 'name', 'securitydescription', 'details', 'notes', 'memo'],
  occSymbol: ['optionsymbol', 'occsymbol', 'osisymbol', 'contractsymbol', 'option'],
  underlying: ['underlying', 'underlyingsymbol', 'root'],
  expiration: ['expiration', 'expirationdate', 'expiry', 'expirydate', 'expdate'],
  strike: ['strike', 'strikeprice'],
  right: ['right', 'callput', 'putcall', 'optiontype', 'callorput'],
};

const EXACT_ONLY: Partial<Record<MappingField, string[]>> = {
  quantity: ['position'],
};

const NOT_CONTAINING: Partial<Record<MappingField, RegExp>> = {
  costBasis: /price|pershare|unit/,
  realizedPnl: /unrealized/,
};

export function guessFields(columns: readonly string[]): Mapping['fields'] {
  const normalized = columns.map((h) => ({ header: h, key: normalizeHeader(h) }));
  const fields: Mapping['fields'] = {};
  const taken = new Set<string>();

  for (const pass of ['exact', 'contains'] as const) {
    for (const field of MAPPING_FIELDS) {
      if (fields[field]) continue;
      const synonyms =
        pass === 'exact' ? [...SYNONYMS[field], ...(EXACT_ONLY[field] ?? [])] : SYNONYMS[field];
      for (const synonym of synonyms) {
        const hit = normalized.find(
          (h) =>
            !taken.has(h.header) &&
            h.key.length > 0 &&
            (pass === 'exact'
              ? h.key === synonym
              : h.key.includes(synonym) && !NOT_CONTAINING[field]?.test(h.key)),
        );
        if (hit) {
          fields[field] = hit.header;
          taken.add(hit.header);
          break;
        }
      }
    }
  }
  return fields;
}
