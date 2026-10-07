import type { Entitlement } from '@tickrs/shared';
import { AppShell, AppTheme, Banner, I18nProvider, Spinner } from '@tickrs/ui';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { type ComponentType, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { TransactionDialog } from './features/TransactionDialog.js';
import { useT } from './i18n.js';
import { ApiError } from './lib/api.js';
import { useFxRateSync } from './lib/fx-rates.js';
import { useQuoteRefresh } from './lib/quotes.js';
import { useAccounts, useCapabilities } from './lib/queries.js';
import { compose, type HeaderProps, type Plugin, type ShellApi } from './plugins.js';

function defaultQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchInterval: 5 * 60_000,
        refetchIntervalInBackground: false,
        staleTime: 30_000,
        retry: (failures, error) => !isUnauthorized(error) && failures < 1,
      },
    },
  });
}

const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;

function signInUrl(signInPath: string, location: { pathname: string; search: string }) {
  return `${signInPath}?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
}

function Shell({
  plugins,
  signInPath,
  Header,
}: {
  plugins: readonly Plugin[];
  signInPath?: string;
  Header: ComponentType<HeaderProps>;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const capabilities = useCapabilities();
  const accounts = useAccounts();
  useFxRateSync();
  useQuoteRefresh();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const features = useMemo(
    () => new Set<Entitlement>(capabilities.data?.features ?? []),
    [capabilities.data],
  );
  const { routes, nav, settingsTabs } = useMemo(() => compose(plugins, features), [plugins, features]);
  const shell: ShellApi = useMemo(
    () => ({ openAddTransaction: () => setAdding(true), settingsTabs }),
    [settingsTabs],
  );

  useEffect(() => {
    if (!signInPath) return;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      if (!isUnauthorized(event.action.error)) return;
      if (window.location.pathname === signInPath) return;
      void navigate(signInUrl(signInPath, window.location), { replace: true });
    });
  }, [queryClient, navigate, signInPath]);

  if (capabilities.isLoading) return <Spinner label={t('app.starting')} />;
  if (capabilities.error) {
    if (signInPath && isUnauthorized(capabilities.error)) {
      return <Navigate to={signInUrl(signInPath, location)} replace />;
    }
    return <Banner tone="error">{t('app.serverUnreachable')}</Banner>;
  }

  return (
    <Header nav={nav}>
      <Routes>
        {routes.map((route) => (
          <Route key={route.path} path={route.path} element={route.render(shell)} />
        ))}
      </Routes>
      <TransactionDialog
        open={adding}
        onClose={() => setAdding(false)}
        accounts={accounts.data?.items ?? []}
      />
    </Header>
  );
}

function headerOf(plugins: readonly Plugin[]): ComponentType<HeaderProps> {
  const headers = plugins.filter((p) => p.header);
  if (headers.length > 1) {
    throw new Error(`Only one plugin may provide the header; got ${headers.map((p) => p.name).join(', ')}`);
  }
  return headers[0]?.header ?? AppShell;
}

export function createApp(
  plugins: readonly Plugin[],
  options: { queryClient?: QueryClient } = {},
): ComponentType {
  const Header = headerOf(plugins);
  const queryClient = options.queryClient ?? defaultQueryClient();
  const publicRoutes = plugins.flatMap((p) => p.publicRoutes ?? []);
  const signInPath = plugins.find((p) => p.signInPath)?.signInPath;
  return function App() {
    return (
      <I18nProvider>
        <AppTheme>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <Routes>
                {publicRoutes.map((route) => (
                  <Route key={route.path} path={route.path} element={route.render()} />
                ))}
                <Route
                  path="*"
                  element={<Shell plugins={plugins} signInPath={signInPath} Header={Header} />}
                />
              </Routes>
            </BrowserRouter>
          </QueryClientProvider>
        </AppTheme>
      </I18nProvider>
    );
  };
}
