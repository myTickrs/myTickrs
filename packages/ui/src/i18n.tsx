import { createInstance } from 'i18next';
import {
  createContext,
  Fragment,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';

export const LANGUAGES = ['en', 'fr', 'de', 'it', 'es', 'ja', 'ko', 'zh-CN', 'zh-TW'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface LanguageInfo {
  code: Language;
  name: string;
  locale: string;
  dir: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', name: 'English', locale: 'en-US', dir: 'ltr' },
  { code: 'fr', name: 'Français', locale: 'fr-FR', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE', dir: 'ltr' },
  { code: 'it', name: 'Italiano', locale: 'it-IT', dir: 'ltr' },
  { code: 'es', name: 'Español', locale: 'es-ES', dir: 'ltr' },
  { code: 'ja', name: '日本語', locale: 'ja-JP', dir: 'ltr' },
  { code: 'ko', name: '한국어', locale: 'ko-KR', dir: 'ltr' },
  { code: 'zh-CN', name: '简体中文', locale: 'zh-CN', dir: 'ltr' },
  { code: 'zh-TW', name: '繁體中文', locale: 'zh-TW', dir: 'ltr' },
];

const infoOf = (code: Language): LanguageInfo => SUPPORTED_LANGUAGES.find((l) => l.code === code)!;

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

export function matchLanguage(tag: string): Language | null {
  const parts = tag.toLowerCase().split(/[-_]/);
  const base = parts[0];
  if (base === 'zh') {
    if (parts.includes('hans')) return 'zh-CN';
    if (parts.includes('hant')) return 'zh-TW';
    return parts.some((p) => p === 'tw' || p === 'hk' || p === 'mo') ? 'zh-TW' : 'zh-CN';
  }
  return LANGUAGES.find((l) => l === base) ?? null;
}

export function detectLanguage(preferred: readonly string[] = browserLanguages()): Language {
  for (const tag of preferred) {
    const match = matchLanguage(tag);
    if (match) return match;
  }
  return 'en';
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function formatLocaleOf(language: Language): string {
  const tag = browserLanguages().find((t) => matchLanguage(t) === language);
  if (tag) {
    try {
      return Intl.getCanonicalLocales(tag)[0] ?? infoOf(language).locale;
    } catch {}
  }
  return infoOf(language).locale;
}

export interface Messages {
  [key: string]: string | Messages;
}

export type MessageLoader = () => Promise<unknown>;

export interface MessageCatalog {
  en: Messages;
  load: Partial<Record<Exclude<Language, 'en'>, MessageLoader>>;
}

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {},
  ns: [],
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false,
  react: { bindI18nStore: 'added' },
});

const catalogs = new Map<string, MessageCatalog>();

export function registerMessages(ns: string, catalog: MessageCatalog): void {
  if (catalogs.has(ns)) return;
  catalogs.set(ns, catalog);
  i18n.addResourceBundle('en', ns, catalog.en, true, true);
  const current = i18n.language;
  if (isLanguage(current) && current !== 'en') void loadNamespace(ns, current);
}

async function loadNamespace(ns: string, language: Language): Promise<void> {
  if (language === 'en' || i18n.hasResourceBundle(language, ns)) return;
  const loader = catalogs.get(ns)?.load[language];
  if (!loader) return;
  const loaded = (await loader()) as { default?: Messages } & Messages;
  const messages = (loaded.default ?? loaded) as Messages;
  i18n.addResourceBundle(language, ns, messages, true, true);
}

export async function loadLanguage(language: Language): Promise<void> {
  await Promise.all([...catalogs.keys()].map((ns) => loadNamespace(ns, language)));
}

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type StripPlural<K extends string> = K extends `${infer Base}_${PluralSuffix}` ? Base : K;

export type MessageKey<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${StripPlural<K>}`
    : MessageKey<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslateOptions = Record<string, unknown> & { count?: number; defaultValue?: string };

export type Translate<M> = (key: MessageKey<M>, options?: TranslateOptions) => string;

type RawT = (key: string, options?: Record<string, unknown>) => string;

export function makeTranslator<M>(ns: string): { t: Translate<M>; useT: () => Translate<M> } {
  const t: Translate<M> = (key, options) => (i18n.t as unknown as RawT)(key, { ...options, ns });
  function useT(): Translate<M> {
    const { t: bound } = useTranslation(ns, { i18n });
    return useCallback<Translate<M>>((key, options) => (bound as unknown as RawT)(key, options), [bound]);
  }
  return { t, useT };
}

const STORAGE_KEY = 'tickrs.language';

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {}
}

let formatLocale = 'en-US';
let direction: 'ltr' | 'rtl' = 'ltr';

export const currentLanguage = (): Language => {
  const language = i18n.language;
  return isLanguage(language) ? language : 'en';
};

export const currentLocale = (): string => formatLocale;

export const ltr = (text: string): string => (direction === 'rtl' ? `⁦${text}⁩` : text);

export async function changeLanguage(language: Language): Promise<void> {
  await applyLanguage(language);
}

async function applyLanguage(language: Language): Promise<void> {
  await loadLanguage(language);
  await i18n.changeLanguage(language);
  formatLocale = formatLocaleOf(language);
  direction = infoOf(language).dir;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }
}

interface LanguageControl {
  language: Language;
  setLanguage(language: Language): void;
  dir: 'ltr' | 'rtl';
  locale: string;
}

const LanguageContext = createContext<LanguageControl>({
  language: 'en',
  setLanguage: () => {},
  dir: 'ltr',
  locale: 'en-US',
});

export const useLanguage = (): LanguageControl => use(LanguageContext);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Language }) {
  const [requested, setRequested] = useState<Language>(
    () => initial ?? readStoredLanguage() ?? detectLanguage(),
  );
  const [active, setActive] = useState<Language | null>(() =>
    requested === 'en' || i18n.hasResourceBundle(requested, 'ui') ? requested : null,
  );

  useEffect(() => {
    let cancelled = false;
    void applyLanguage(requested).then(() => {
      if (!cancelled) setActive(requested);
    });
    return () => {
      cancelled = true;
    };
  }, [requested]);

  const setLanguage = useCallback((language: Language) => {
    storeLanguage(language);
    setRequested(language);
  }, []);

  const shown = active ?? 'en';
  const control = useMemo<LanguageControl>(
    () => ({ language: shown, setLanguage, dir: infoOf(shown).dir, locale: formatLocaleOf(shown) }),
    [shown, setLanguage],
  );

  if (active === null) return null;
  return (
    <LanguageContext value={control}>
      <Fragment key={shown}>{children}</Fragment>
    </LanguageContext>
  );
}

export async function resetLanguage(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  await applyLanguage('en');
}
