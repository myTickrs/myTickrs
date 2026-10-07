import { DashboardPage } from './pages/Dashboard.js';
import { ImportPage } from './pages/Import.js';
import { OptionsPage } from './pages/Options.js';
import { SettingsPage } from './pages/Settings.js';
import { StockDetailPage } from './pages/StockDetail.js';
import { TransactionsPage } from './pages/Transactions.js';
import { t } from './i18n.js';
import type { Plugin } from './plugins.js';

export const corePlugin: Plugin = {
  name: 'core',
  routes: [
    { path: '/', render: () => <DashboardPage /> },
    { path: '/transactions', render: (shell) => <TransactionsPage onAdd={shell.openAddTransaction} /> },
    { path: '/stocks/:symbol', render: () => <StockDetailPage /> },
    { path: '/options', render: () => <OptionsPage /> },
    { path: '/import', render: () => <ImportPage /> },
    { path: '/settings', render: (shell) => <SettingsPage extraTabs={shell.settingsTabs} /> },
  ],
  nav: [
    { to: '/', label: () => t('nav.dashboard'), icon: 'dashboard', order: 10 },
    { to: '/transactions', label: () => t('nav.transactions'), icon: 'transactions', order: 20 },
    { to: '/options', label: () => t('nav.options'), icon: 'options', order: 30 },
    { to: '/import', label: () => t('nav.import'), icon: 'import', order: 40 },
    { to: '/settings', label: () => t('nav.settings'), icon: 'settings', order: 90 },
  ],
};
