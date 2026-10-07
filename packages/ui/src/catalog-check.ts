import type { Language, Messages } from './i18n.js';

export function catalogProblems(
  en: Messages,
  translated: Messages,
  language: Language,
  alternatives: Record<string, readonly string[]> = {},
): string[] {
  const problems: string[] = [];
  const source = flatten(en);
  const target = flatten(translated);
  const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories as string[];

  const plurals = new Map<string, string>();
  for (const [key, value] of source) {
    const match = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
    if (match && source.has(`${match[1]}_other`)) {
      if (match[2] === 'other') plurals.set(match[1]!, value);
    }
  }

  const expected = new Map<string, string>();
  for (const [key, value] of source) {
    const base = /^(.*)_(zero|one|two|few|many|other)$/.exec(key)?.[1];
    if (base !== undefined && plurals.has(base)) continue;
    expected.set(key, value);
  }
  for (const [base, other] of plurals) {
    for (const category of categories) expected.set(`${base}_${category}`, other);
  }

  for (const [key, english] of expected) {
    const value = target.get(key);
    if (value === undefined) {
      problems.push(`${language}: missing "${key}"`);
      continue;
    }
    if (value.trim() === '' && english.trim() !== '') problems.push(`${language}: "${key}" is empty`);
    const base = key.replace(/_(zero|one|two|few|many|other)$/, '');
    const swaps = alternatives[key] ?? alternatives[base] ?? [];
    const want = placeholders(english).filter((p) => !swaps.includes(p));
    const have = placeholders(value);
    for (const p of want) {
      if (!have.includes(p) && !(p === 'count' && plurals.has(base) && categories.length === 1)) {
        problems.push(`${language}: "${key}" lacks {{${p}}}`);
      }
    }
    if (swaps.length > 0 && !swaps.some((p) => have.includes(p))) {
      problems.push(`${language}: "${key}" needs one of ${swaps.map((p) => `{{${p}}}`).join(', ')}`);
    }
    for (const p of have) {
      if (!placeholders(english).includes(p) && !swaps.includes(p)) {
        problems.push(`${language}: "${key}" has {{${p}}}, which English does not`);
      }
    }
  }
  for (const key of target.keys()) {
    if (!expected.has(key)) problems.push(`${language}: unexpected "${key}"`);
  }
  return problems;
}

function flatten(messages: Messages, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === 'string') out.set(`${prefix}${key}`, value);
    else flatten(value, `${prefix}${key}.`, out);
  }
  return out;
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]!).toSorted();
