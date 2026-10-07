import { makeTranslator, registerMessages } from '@tickrs/ui';
import en from './locales/en/core.json';

registerMessages('core', {
  en,
  load: {
    fr: () => import('./locales/fr/core.json'),
    de: () => import('./locales/de/core.json'),
    it: () => import('./locales/it/core.json'),
    es: () => import('./locales/es/core.json'),
    ja: () => import('./locales/ja/core.json'),
    ko: () => import('./locales/ko/core.json'),
    'zh-CN': () => import('./locales/zh-CN/core.json'),
    'zh-TW': () => import('./locales/zh-TW/core.json'),
  },
});

export const { t, useT } = makeTranslator<typeof en>('core');
