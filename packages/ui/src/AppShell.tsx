import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import MenuIcon from '@mui/icons-material/Menu';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SettingsIcon from '@mui/icons-material/Settings';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard';
import MuiAppBar from '@mui/material/AppBar';
import MuiBox from '@mui/material/Box';
import MuiContainer from '@mui/material/Container';
import MuiIconButton from '@mui/material/IconButton';
import MuiLink from '@mui/material/Link';
import MuiListItemIcon from '@mui/material/ListItemIcon';
import MuiListItemText from '@mui/material/ListItemText';
import MuiMenu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import MuiStack from '@mui/material/Stack';
import MuiTab from '@mui/material/Tab';
import MuiTabs from '@mui/material/Tabs';
import MuiToolbar from '@mui/material/Toolbar';
import MuiTypography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useId, useState, type ElementType, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { LanguageMenu } from './LanguageMenu.js';
import { Logo } from './Logo.js';
import { useT } from './messages.js';
import { IconButton } from './primitives.js';
import { useThemeMode } from './theme.js';

export const NAV_ICONS = {
  dashboard: SpaceDashboardIcon,
  transactions: ReceiptLongIcon,
  options: ShowChartIcon,
  cash: AccountBalanceWalletIcon,
  import: UploadFileIcon,
  settings: SettingsIcon,
} as const;
export type NavIcon = keyof typeof NAV_ICONS;

export interface NavItem {
  to: string;
  label: string;
  icon?: NavIcon;
}

function NavMenu({ nav, current }: { nav: readonly NavItem[]; current: string | false }) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const label = t('shell.menu');

  return (
    <>
      <MuiIconButton
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <MenuIcon />
      </MuiIconButton>
      <MuiMenu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {nav.map((n) => {
          const Icon = n.icon ? NAV_ICONS[n.icon] : null;
          return (
            <MuiMenuItem
              key={n.to}
              component={Link as ElementType}
              to={n.to}
              selected={n.to === current}
              onClick={() => setAnchor(null)}
            >
              {Icon && (
                <MuiListItemIcon>
                  <Icon fontSize="small" />
                </MuiListItemIcon>
              )}
              <MuiListItemText>{n.label}</MuiListItemText>
            </MuiMenuItem>
          );
        })}
      </MuiMenu>
    </>
  );
}

const CONTACT_EMAIL = 'admin@mytickrs.com';

export function Footer({ version }: { version?: string } = {}) {
  const t = useT();
  const [year] = useState(() => new Date().getFullYear());
  return (
    <MuiBox
      component="footer"
      sx={{ borderTop: 1, borderColor: 'divider', py: 2, px: 2, textAlign: 'center' }}
    >
      <MuiTypography variant="body2" color="text.secondary">
        © {year}{' '}
        <MuiLink href="https://mytickrs.com" color="inherit" target="_blank" rel="noopener noreferrer">
          mytickrs.com
        </MuiLink>
        {version && ` v${version}`}
        {' · '}
        <MuiLink href={`mailto:${CONTACT_EMAIL}`} color="inherit">
          {t('shell.contact')}
        </MuiLink>
      </MuiTypography>
    </MuiBox>
  );
}

export function AppShell({
  children,
  actions,
  end,
  nav,
  version,
}: {
  children: ReactNode;
  actions?: ReactNode;
  end?: ReactNode;
  nav: readonly NavItem[];
  version?: string;
}) {
  const { pathname } = useLocation();
  const { resolved, setMode } = useThemeMode();
  const t = useT();
  const match = nav.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)));
  const current = match?.to ?? false;
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'));

  return (
    <MuiBox sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <MuiAppBar
        position="static"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <MuiToolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          {phone && <NavMenu nav={nav} current={current} />}
          <MuiStack direction="row" spacing={1} sx={{ alignItems: 'center', marginInlineEnd: 2 }}>
            <Logo />
            <MuiTypography variant="h6">myTickrs</MuiTypography>
          </MuiStack>
          {phone ? (
            <MuiBox sx={{ flexGrow: 1 }} />
          ) : (
            <MuiTabs
              value={current}
              sx={{ flexGrow: 1, minHeight: 48 }}
              variant="scrollable"
              allowScrollButtonsMobile
            >
              {nav.map((n) => {
                const Icon = n.icon ? NAV_ICONS[n.icon] : null;
                return (
                  <MuiTab
                    key={n.to}
                    value={n.to}
                    label={n.label}
                    icon={Icon ? <Icon fontSize="small" /> : undefined}
                    iconPosition="start"
                    component={Link as ElementType}
                    to={n.to}
                    sx={{ minHeight: 48 }}
                  />
                );
              })}
            </MuiTabs>
          )}
          <MuiStack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {actions}
            <LanguageMenu />
            <IconButton
              label={resolved === 'dark' ? t('shell.switchToLight') : t('shell.switchToDark')}
              onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}
            >
              {resolved === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
            {end}
          </MuiStack>
        </MuiToolbar>
      </MuiAppBar>
      <MuiContainer maxWidth="xl" sx={{ py: 3, flexGrow: 1 }}>
        {children}
      </MuiContainer>
      <Footer version={version} />
    </MuiBox>
  );
}
