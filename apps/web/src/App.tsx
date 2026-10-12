import { corePlugin } from './core-plugin.js';
import { createApp } from './createApp.js';
import { desktopHeader } from './desktop-header.js';
import { desktopSync } from './desktop-sync.js';

export const App = createApp([corePlugin, desktopSync, desktopHeader]);
