import { CloudSyncTab } from './features/CloudSyncTab.js';
import { t } from './i18n.js';
import type { Plugin } from './plugins.js';

export const desktopSync: Plugin = {
  name: 'desktop-sync',
  settingsTabs: [
    { value: 'sync', label: () => t('nav.sync'), feature: 'cloud-sync', render: () => <CloudSyncTab /> },
  ],
};
