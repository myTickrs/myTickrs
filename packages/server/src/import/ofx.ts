import { parseOptionSymbol, type SourceRow } from '@tickrs/shared';
import { AppError } from '../errors.js';
import { instrumentDraft, sourceRow } from './rows.js';
import { parseNumber } from './values.js';

interface Node {
  name: string;
  value?: string;
  children: Node[];
}

export const isOfx = (text: string): boolean => /OFXHEADER|<OFX>/i.test(text.slice(0, 4000));

export function parseOfxTree(text: string): Node {
  const start = text.search(/<OFX>/i);
  if (start < 0) throw new AppError('IMPORT_UNREADABLE', 422, 'This OFX file has no <OFX> section');
  const root: Node = { name: 'ROOT', children: [] };
  const stack: Node[] = [root];
  const tag = /<(\/?)([A-Za-z0-9._]+)[^>]*>([^<]*)/g;
  let match: RegExpExecArray | null;
  tag.lastIndex = start;
  while ((match = tag.exec(text))) {
    const [, closing, rawName, rawText] = match;
    const name = rawName!.toUpperCase();
    const value = rawText!.trim();
    if (closing) {
      const index = stack.map((n) => n.name).lastIndexOf(name);
      if (index > 0) stack.length = index;
      continue;
    }
    const parent = stack.at(-1)!;
    if (value !== '') {
      parent.children.push({ name, value: decodeEntities(value), children: [] });
    } else {
      const node: Node = { name, children: [] };
      parent.children.push(node);
      stack.push(node);
    }
  }
  return root;
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const child = (node: Node | undefined, name: string): Node | undefined =>
  node?.children.find((c) => c.name === name);
const value = (node: Node | undefined, ...path: string[]): string | undefined => {
  let current = node;
  for (const name of path) current = child(current, name);
  return current?.value;
};
function* all(node: Node, name: string): Generator<Node> {
  for (const c of node.children) {
    if (c.name === name) yield c;
    yield* all(c, name);
  }
}

const ofxDate = (raw: string | undefined): string | null => {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

interface Security {
  ticker: string | null;
  name: string | null;
  option?: {
    underlying: string | null;
    expiration: string | null;
    strike: string | null;
    right: 'CALL' | 'PUT' | null;
  };
}

const secKey = (secid: Node | undefined) =>
  `${value(secid, 'UNIQUEIDTYPE') ?? ''}:${value(secid, 'UNIQUEID') ?? ''}`;

function readSecurities(root: Node): Map<string, Security> {
  const securities = new Map<string, Security>();
  const list = [...all(root, 'SECLIST')][0];
  if (!list) return securities;
  for (const info of list.children) {
    const secinfo = child(info, 'SECINFO');
    if (!secinfo) continue;
    securities.set(secKey(child(secinfo, 'SECID')), {
      ticker: value(secinfo, 'TICKER')?.toUpperCase() ?? null,
      name: value(secinfo, 'SECNAME') ?? null,
    });
  }
  for (const info of list.children) {
    if (info.name !== 'OPTINFO') continue;
    const secinfo = child(info, 'SECINFO');
    const security = securities.get(secKey(child(secinfo, 'SECID')));
    if (!security) continue;
    const underlying = securities.get(secKey(child(info, 'SECID')))?.ticker ?? null;
    const type = value(info, 'OPTTYPE')?.toUpperCase();
    security.option = {
      underlying,
      expiration: ofxDate(value(info, 'DTEXPIRE')),
      strike: parseNumber(value(info, 'STRIKEPRICE')),
      right: type === 'CALL' ? 'CALL' : type === 'PUT' ? 'PUT' : null,
    };
  }
  return securities;
}

export function readOfx(text: string, file: string): { rows: SourceRow[]; currency: string | null } {
  const root = parseOfxTree(text);
  const securities = readSecurities(root);
  const statement = [...all(root, 'INVSTMTRS')][0];
  const currency = value(statement, 'CURDEF')?.toUpperCase() ?? null;
  const list = child(statement, 'INVPOSLIST');
  const rows: SourceRow[] = [];
  if (!list) return { rows, currency };

  let record = 0;
  for (const entry of list.children) {
    const pos = child(entry, 'INVPOS');
    if (!pos) continue;
    record += 1;
    const security = securities.get(secKey(child(pos, 'SECID')));
    const { isOption: _isOption, ...instrument } = security?.option
      ? instrumentDraft({
          occSymbol: security.ticker && parseOptionSymbol(security.ticker) ? security.ticker : null,
          underlying: security.option.underlying,
          expiration: security.option.expiration,
          strike: security.option.strike,
          right: security.option.right,
        })
      : instrumentDraft({ symbol: security?.ticker ?? null });
    const units = parseNumber(value(pos, 'UNITS'))?.replace(/^-/, '') ?? null;
    const short = value(pos, 'POSTYPE')?.toUpperCase() === 'SHORT';
    rows.push(
      sourceRow(
        `${file}#${record}`,
        { file, kind: 'xml', record },
        {
          description: `${entry.name} ${security?.ticker ?? security?.name ?? ''}`.trim(),
          draft: {
            ...instrument,
            quantity: units && short ? `-${units}` : units,
            marketValue: parseNumber(value(pos, 'MKTVAL')),
            currency: value(pos, 'CURRENCY', 'CURSYM')?.toUpperCase() ?? currency,
          },
        },
      ),
    );
  }
  return { rows, currency };
}
