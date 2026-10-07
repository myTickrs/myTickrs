import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Banner,
  Button,
  Card,
  Col,
  DataTable,
  Dialog,
  Field,
  Row,
  Select,
  Spinner,
  StatusIcon,
  Text,
  Toggle,
  useLanguage,
  type Column,
} from '@tickrs/ui';
import { NO_MARKET_PROVIDERS } from '@tickrs/shared';
import { useT } from '../i18n.js';
import {
  api,
  errorText,
  serverWording,
  type MarketProviderRow,
  type ProviderKey,
  type ProviderSetting,
  type ProvidersResponse,
} from '../lib/api.js';
import { keys, useProviders } from '../lib/queries.js';

type Draft = Omit<MarketProviderRow, 'market'> & { priorityText: string };
type Capability = keyof NonNullable<ProviderSetting['capabilities']>;

const validPriority = (text: string) => /^[1-9]\d{0,8}$/.test(text.trim());

function effectiveRows(
  data: ProvidersResponse,
  market: string,
): { rows: MarketProviderRow[]; customized: boolean } {
  const own = data.associations.user.filter((r) => r.market === market);
  const rows = own.length > 0 ? own : data.associations.defaults.filter((r) => r.market === market);
  return {
    rows: rows
      .filter((r) => r.provider !== data.baseProvider && r.provider !== NO_MARKET_PROVIDERS)
      .toSorted((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider)),
    customized: own.length > 0,
  };
}

export function DataProviderSettings({ onMessage }: { onMessage(message: string): void }) {
  const t = useT();
  const { language } = useLanguage();
  const client = useQueryClient();
  const providers = useProviders();
  const [editingKey, setEditingKey] = useState<{ market: string; provider: string } | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const openKeyDialog = (market: string, provider: string) => {
    setKeyInput('');
    setEditingKey({ market, provider });
  };
  const [drafts, setDrafts] = useState<Record<string, Draft[] | undefined>>({});
  const [adding, setAdding] = useState<Record<string, string>>({});

  const refresh = () => client.invalidateQueries({ queryKey: keys.providers });

  const saveKey = useMutation({
    mutationFn: ({ provider, market, apiKey }: { provider: string; market: string; apiKey: string }) =>
      api.put<{ status: string; message: string }>(`/settings/providers/${provider}/keys/${market}`, {
        apiKey,
      }),
    onSuccess: async (result) => {
      await refresh();
      setEditingKey(null);
      onMessage(
        result.status === 'VALID'
          ? t('settings.keyVerified')
          : serverWording(
              t('settings.keySavedBut', { message: result.message }),
              t('settings.keySavedUnverified'),
            ),
      );
    },
    onError: (e: unknown) => onMessage(errorText(e, t('settings.keyFailed'))),
  });

  const deleteKey = useMutation({
    mutationFn: ({ provider, market }: { provider: string; market: string }) =>
      api.delete(`/settings/providers/${provider}/keys/${market}`),
    onSuccess: async () => {
      await refresh();
      setEditingKey(null);
      onMessage(t('settings.keyRemoved'));
    },
  });

  const saveMarket = useMutation({
    mutationFn: ({ market, rows }: { market: string; rows: Omit<MarketProviderRow, 'market'>[] }) =>
      api.put<ProvidersResponse>(`/settings/market-providers/${market}`, { rows }),
    onSuccess: async (_r, { market }) => {
      await refresh();
      setDrafts((d) => ({ ...d, [market]: undefined }));
      onMessage(t('settings.marketSaved', { market: marketName(market) }));
    },
    onError: (e: unknown) => onMessage(errorText(e, t('settings.marketSaveFailed'))),
  });

  const resetMarket = useMutation({
    mutationFn: (market: string) => api.delete(`/settings/market-providers/${market}`),
    onSuccess: async (_r, market) => {
      await refresh();
      setDrafts((d) => ({ ...d, [market]: undefined }));
      onMessage(t('settings.marketReset', { market: marketName(market) }));
    },
    onError: (e: unknown) => onMessage(errorText(e, t('settings.marketSaveFailed'))),
  });

  if (providers.isLoading || !providers.data) return <Spinner label={t('settings.loading')} />;
  const data = providers.data;
  const byId = new Map(data.items.map((p) => [p.provider, p]));
  function marketName(code: string): string {
    return data.markets.find((m) => m.id === code)?.name ?? code;
  }
  const keyFor = (provider: string, market: string): ProviderKey | undefined =>
    data.keys.find((k) => k.provider === provider && k.market === market);
  const describe = (p: ProviderSetting) => p.description?.[language] ?? p.description?.en ?? '';
  const used = new Set(
    data.markets.flatMap((m) =>
      effectiveRows(data, m.id)
        .rows.filter((r) => r.enabled)
        .map((r) => r.provider),
    ),
  );
  if (data.baseProvider) used.add(data.baseProvider);
  const unused = data.items.filter((p) => p.installed && !used.has(p.provider));
  const base = data.baseProvider ? byId.get(data.baseProvider) : undefined;

  const capabilityName: Record<Capability, string> = {
    search: t('settings.capSearch'),
    quotes: t('settings.capQuotes'),
    history: t('settings.capHistory'),
    corporateActions: t('settings.capCorporateActions'),
  };

  const rowStatus = (market: string, row: Draft): { ok: boolean; label: string } => {
    const p = byId.get(row.provider);
    const key = keyFor(row.provider, market);
    const missing = (Object.keys(capabilityName) as Capability[]).filter(
      (c) => c !== 'search' && p?.capabilities && !p.capabilities[c],
    );
    const cantDo =
      missing.length > 0
        ? t('settings.statusCantDo', { what: missing.map((c) => capabilityName[c]).join(', ') })
        : null;
    const reason = !p?.installed
      ? t('settings.statusSkippedNotInstalled')
      : !row.enabled
        ? t('settings.statusSkippedOff')
        : p.auth === 'apiKey' && !key
          ? t('settings.statusSkippedNoKey')
          : p.auth === 'apiKey' && key?.status === 'INVALID'
            ? t('settings.statusSkippedInvalidKey')
            : null;
    const label = reason ?? t('settings.statusInUse');
    return { ok: reason == null, label: cantDo ? `${label} · ${cantDo}` : label };
  };

  const draftOf = (market: string): Draft[] =>
    drafts[market] ??
    effectiveRows(data, market).rows.map((r) => ({
      provider: r.provider,
      priority: r.priority,
      enabled: r.enabled,
      priorityText: String(r.priority),
    }));
  const edit = (market: string, change: (rows: Draft[]) => Draft[]) =>
    setDrafts((d) => ({ ...d, [market]: change(draftOf(market)) }));

  const addToMarket = (market: string, provider: string) =>
    edit(market, (rows) => {
      const next = Math.max(0, ...rows.map((r) => r.priority)) + 1;
      return [...rows, { provider, priority: next, enabled: true, priorityText: String(next) }];
    });

  const keyStatusLabel = (key: ProviderKey, name: string, where: string) => {
    const hint = key.keyHint;
    return key.status === 'VALID'
      ? t('settings.keyOkHint', { provider: name, market: where, hint })
      : key.status === 'INVALID'
        ? t('settings.keyRejectedHint', { provider: name, market: where, hint })
        : t('settings.keyUncheckedHint', { provider: name, market: where, hint });
  };

  const keyCell = (market: string, provider: string) => {
    const p = byId.get(provider);
    const name = p?.name ?? provider;
    const where = marketName(market);
    if (p?.auth === 'none') return <StatusIcon ok label={t('settings.providerNoKeyNeeded')} />;
    const key = keyFor(provider, market);
    if (!key) {
      return (
        <Button
          variant="text"
          aria-label={t('settings.setKeyFor', { provider: name, market: where })}
          onClick={() => openKeyDialog(market, provider)}
        >
          {t('settings.setKey')}
        </Button>
      );
    }
    return (
      <StatusIcon
        ok={key.status !== 'INVALID'}
        label={keyStatusLabel(key, name, where)}
        onClick={() => openKeyDialog(market, provider)}
      />
    );
  };

  const keyDialog = () => {
    if (!editingKey) return null;
    const { market, provider } = editingKey;
    const name = byId.get(provider)?.name ?? provider;
    const where = marketName(market);
    const key = keyFor(provider, market);
    const save = () => {
      if (keyInput && !saveKey.isPending) saveKey.mutate({ provider, market, apiKey: keyInput });
    };
    return (
      <Dialog
        open
        title={t('settings.setKeyFor', { provider: name, market: where })}
        onClose={() => setEditingKey(null)}
        onSubmit={save}
        actions={
          <>
            {key && (
              <Button
                variant="text"
                tone="danger"
                aria-label={t('settings.removeKeyFor', { provider: name, market: where })}
                disabled={deleteKey.isPending}
                onClick={() => deleteKey.mutate({ provider, market })}
              >
                {t('common.remove')}
              </Button>
            )}
            <Button variant="text" onClick={() => setEditingKey(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={!keyInput || saveKey.isPending}>
              {t('settings.saveKey')}
            </Button>
          </>
        }
      >
        <Field
          label={t('settings.apiKeyFor', { provider: name, market: where })}
          value={keyInput}
          onChange={setKeyInput}
          autoFocus
        />
      </Dialog>
    );
  };

  return (
    <Col gap={3}>
      <Card>
        <Col gap={2}>
          <Col gap={1}>
            <Text variant="section">{t('settings.marketsTitle')}</Text>
            <Text muted>{t('settings.marketsIntro')}</Text>
            <Text variant="caption" muted>
              {t('settings.providersIntro')}
            </Text>
          </Col>
          {data.loadErrors.map((e) => (
            <Banner key={e.folder} tone="warning">
              {t('settings.providerLoadFailed', { folder: e.folder, error: e.error })}
            </Banner>
          ))}
          {data.items.length === 0 && (
            <Banner tone="info">
              {data.pluginsDir
                ? t('settings.providersEmpty', { dir: data.pluginsDir })
                : t('settings.providersEmptyHosted')}
            </Banner>
          )}
          {base && (
            <Text variant="caption" muted>
              {t('settings.baseProviderNote', { provider: base.name })}
            </Text>
          )}
          {unused.length > 0 && (
            <Text variant="caption" muted>
              {t('settings.providersUnused', { providers: unused.map((p) => p.name).join(', ') })}
            </Text>
          )}
        </Col>
      </Card>

      {data.markets.map((m) => {
        const rows = draftOf(m.id);
        const dirty = drafts[m.id] !== undefined;
        const { customized } = effectiveRows(data, m.id);
        const invalid = rows.some((r) => !validPriority(r.priorityText));
        const priorities = rows.map((r) => r.priority);
        const tie = priorities.some((p, i) => priorities.indexOf(p) !== i);
        const available = [...byId.values()].filter(
          (p) =>
            p.installed && p.provider !== data.baseProvider && !rows.some((r) => r.provider === p.provider),
        );
        const choice =
          adding[m.id] && available.some((p) => p.provider === adding[m.id]) ? adding[m.id]! : '';
        const noneEnabled = !rows.some((r) => r.enabled && byId.get(r.provider)?.installed);

        const columns: Column<Draft>[] = [
          {
            key: 'provider',
            header: t('settings.colProvider'),
            render: (r) => {
              const p = byId.get(r.provider);
              const usedToday = keyFor(r.provider, m.id)?.usedToday ?? 0;
              return (
                <Col gap={0}>
                  <Row gap={1}>
                    <Text variant="label">{p?.name ?? r.provider}</Text>
                    {p?.version && <Badge label={t('settings.providerVersion', { version: p.version })} />}
                    {p?.limitPerDay != null && (
                      <Badge
                        label={t('settings.usageToday', { used: usedToday, limit: p.limitPerDay })}
                        tone={usedToday > p.limitPerDay * 0.9 ? 'warning' : 'default'}
                      />
                    )}
                  </Row>
                  {p && (describe(p) || p.signupUrl) && (
                    <Text variant="caption" muted>
                      {p.signupUrl
                        ? t('settings.providerSignup', { purpose: describe(p), url: p.signupUrl })
                        : describe(p)}
                    </Text>
                  )}
                </Col>
              );
            },
          },
          {
            key: 'priority',
            header: t('settings.colPriority'),
            render: (r) => (
              <Field
                label={t('settings.priorityFor', { provider: byId.get(r.provider)?.name ?? r.provider })}
                type="number"
                value={r.priorityText}
                error={validPriority(r.priorityText) ? undefined : t('settings.priorityRange')}
                onChange={(v) =>
                  edit(m.id, (all) =>
                    all.map((x) =>
                      x.provider === r.provider
                        ? { ...x, priorityText: v, priority: validPriority(v) ? Number(v) : x.priority }
                        : x,
                    ),
                  )
                }
              />
            ),
          },
          {
            key: 'enabled',
            header: t('settings.colEnabled'),
            render: (r) => (
              <Toggle
                label={t('settings.colEnabled')}
                checked={r.enabled}
                onChange={(on) =>
                  edit(m.id, (all) => all.map((x) => (x.provider === r.provider ? { ...x, enabled: on } : x)))
                }
              />
            ),
          },
          {
            key: 'key',
            header: t('settings.colKey'),
            render: (r) => keyCell(m.id, r.provider),
          },
          {
            key: 'status',
            header: t('settings.colStatus'),
            render: (r) => {
              const status = rowStatus(m.id, r);
              return <StatusIcon ok={status.ok} label={status.label} />;
            },
          },
          {
            key: 'remove',
            header: '',
            render: (r) => (
              <Button
                variant="text"
                tone="danger"
                aria-label={t('settings.removeFromMarket', {
                  provider: byId.get(r.provider)?.name ?? r.provider,
                })}
                onClick={() => edit(m.id, (all) => all.filter((x) => x.provider !== r.provider))}
              >
                {t('common.remove')}
              </Button>
            ),
          },
        ];

        return (
          <Card key={m.id}>
            <Col gap={1}>
              <Row gap={1}>
                <Text variant="label">
                  {m.name} · {m.id}
                </Text>
                <Badge
                  label={customized ? t('settings.marketCustomized') : t('settings.marketDefault')}
                  tone={customized ? 'info' : 'default'}
                />
              </Row>
              <DataTable
                caption={t('settings.marketTableCaption', { market: m.name })}
                columns={columns}
                rows={rows.toSorted(
                  (a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider),
                )}
                rowKey={(r) => r.provider}
                empty={t('settings.marketNoProviders')}
              />
              {noneEnabled && rows.length > 0 && (
                <Text variant="caption" muted>
                  {t('settings.marketNoProviders')}
                </Text>
              )}
              {tie && (
                <Text variant="caption" muted>
                  {t('settings.priorityTie')}
                </Text>
              )}
              <Row gap={1} responsive>
                {available.length > 0 && (
                  <>
                    <Select
                      label={t('settings.addProvider')}
                      value={choice}
                      onChange={(v) => setAdding({ ...adding, [m.id]: v })}
                      options={available.map((p) => ({ value: p.provider, label: p.name }))}
                    />
                    <Button
                      variant="secondary"
                      disabled={!choice}
                      onClick={() => {
                        addToMarket(m.id, choice);
                        setAdding({ ...adding, [m.id]: '' });
                      }}
                    >
                      {t('settings.addToMarket', { market: m.name })}
                    </Button>
                  </>
                )}
                <Button
                  variant="primary"
                  aria-label={t('settings.saveMarket', { market: m.name })}
                  disabled={!dirty || invalid || saveMarket.isPending}
                  onClick={() =>
                    saveMarket.mutate({
                      market: m.id,
                      rows: rows.map(({ provider, priority, enabled }) => ({ provider, priority, enabled })),
                    })
                  }
                >
                  {t('common.save')}
                </Button>
                {dirty && (
                  <Button variant="text" onClick={() => setDrafts({ ...drafts, [m.id]: undefined })}>
                    {t('common.cancel')}
                  </Button>
                )}
                {customized && !dirty && (
                  <Button
                    variant="text"
                    onClick={() => resetMarket.mutate(m.id)}
                    disabled={resetMarket.isPending}
                  >
                    {t('settings.resetMarket')}
                  </Button>
                )}
              </Row>
            </Col>
          </Card>
        );
      })}
      {keyDialog()}
    </Col>
  );
}
