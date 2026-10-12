import { makeTranslator, registerMessages } from './i18n.js';
import en from './locales/en/ui.json';

registerMessages('ui', {
  en,
  load: {
    fr: () => import('./locales/fr/ui.json'),
    de: () => import('./locales/de/ui.json'),
    it: () => import('./locales/it/ui.json'),
    es: () => import('./locales/es/ui.json'),
    ja: () => import('./locales/ja/ui.json'),
    ko: () => import('./locales/ko/ui.json'),
    'zh-CN': () => import('./locales/zh-CN/ui.json'),
    'zh-TW': () => import('./locales/zh-TW/ui.json'),
  },
});

export const { t, useT } = makeTranslator<typeof en>('ui');
