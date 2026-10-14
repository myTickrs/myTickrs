import { AppShell } from '@tickrs/ui';
import { version as APP_VERSION } from '../package.json';
import type { HeaderProps, Plugin } from './plugins.js';

function DesktopHeader(props: HeaderProps) {
  return <AppShell {...props} version={APP_VERSION} />;
}

export const desktopHeader: Plugin = {
  name: 'desktop-header',
  header: DesktopHeader,
};
