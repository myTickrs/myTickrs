import {
  IMPORT_DEFAULT_MAX_LONG_EDGE,
  IMPORT_FILES_AT_A_TIME,
  importFileKind,
  type ExtractResponse,
  type ImportDraft,
  type ImportFile,
  type ImportFileKind,
  type ImportTotals,
  type Mapping,
  type ReviewResponse,
  type ReviewRow,
  type SourceRow,
} from '@tickrs/shared';
import {
  Badge,
  Banner,
  Button,
  StepCard,
  Col,
  FileDrop,
  IconButton,
  Row,
  Spinner,
  Text,
  currentLanguage,
  type PickedFile,
} from '@tickrs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AccountDialog, accountNameFor, type AccountValues } from '../features/AccountDialog.js';
import { t as translate, useT } from '../i18n.js';
import { api, ApiError, errorText, type Account } from '../lib/api.js';
import { prepareFile } from '../lib/prepare-file.js';
import {
  addAccounts,
  checkImport,
  extractImportFile,
  reviewImport,
  useAccounts,
  useCommitImport,
  useImportConfig,
  useSettings,
} from '../lib/queries.js';
import { AiNotice, AiStatus, aiNoticeAccepted } from './import/AiStatus.js';
import { CurrencySection } from './import/CurrencySection.js';
import { MappingStep } from './import/MappingStep.js';

interface FileEntry {
  key: string;
  name: string;
  kind: ImportFileKind | null;
  status: 'reading' | 'read' | 'mapping' | 'failed';
  error?: string;
  response?: ExtractResponse;
  prepared?: ImportFile;
  rows: SourceRow[];
}

const ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.csv,.json,.xml,.ofx,.qfx';
const PARALLEL = 3;

type ReadHow = { mapping: Mapping; save: boolean } | { readWithAi: true };

export function ImportPage() {
  const t = useT();
  const navigate = useNavigate();
  const accounts = useAccounts();
  const settings = useSettings();
  const [waitingForSignIn, setWaitingForSignIn] = useState(false);
  const config = useImportConfig(waitingForSignIn);
  const commit = useCommitImport();
  const client = useQueryClient();
  const [dialog, setDialog] = useState<{ currency: string; account: Account | null } | null>(null);
  const saveAccount = useMutation({
    mutationFn: async (
      change: { currency: string } & (
        { id: string; values: AccountValues } | { id?: undefined; values: AccountValues[] }
      ),
    ) => {
      if (change.id !== undefined) {
        await api.patch<unknown>(`/accounts/${change.id}`, change.values);
        return null;
      }
      return addAccounts(change.values);
    },
    onSuccess: async (response, change) => {
      await client.invalidateQueries();
      const added = response?.items.find((a) => a.currency === change.currency);
      if (added) setTargets((prev) => ({ ...prev, [change.currency]: added.id }));
      setDialog(null);
    },
  });

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [edits, setEdits] = useState<Record<string, ImportDraft>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [openingDates, setOpeningDates] = useState<Record<string, string>>({});
  const [reviews, setReviews] = useState<Record<string, { accountId: string; response: ReviewResponse }>>({});
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number } | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const importIds = useRef<Record<string, string>>({});
  const importIdFor = (id: string) => (importIds.current[id] ??= crypto.randomUUID());

  const ai = config.data?.ai;
  const aiFilesLeft =
    ai?.status === 'ready' && ai.usage.limit != null ? Math.max(0, ai.usage.limit - ai.usage.used) : null;
  useEffect(() => {
    if (waitingForSignIn && ai?.status === 'ready') setWaitingForSignIn(false);
  }, [waitingForSignIn, ai?.status]);

  const update = (key: string, patch: Partial<FileEntry>) =>
    setFiles((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const read = async (entry: FileEntry, prepared: ImportFile, how?: ReadHow) => {
    try {
      const response = await extractImportFile({
        file: prepared,
        locale: currentLanguage(),
        ...(!how ? {} : 'mapping' in how ? { mapping: how.mapping, saveMapping: how.save } : how),
      });
      update(entry.key, {
        status: response.status === 'NEEDS_MAPPING' ? 'mapping' : 'read',
        response,
        rows: response.rows,
        prepared: response.status === 'NEEDS_MAPPING' ? prepared : undefined,
      });
      return response;
    } catch (error) {
      update(entry.key, {
        status: how && 'readWithAi' in how && entry.response ? 'mapping' : 'failed',
        error: errorText(error, t('import.readFailed', { name: entry.name })),
      });
    } finally {
      if (how && 'readWithAi' in how) void config.refetch();
    }
    return null;
  };

  const addFiles = async (picked: PickedFile[]) => {
    setResult(null);
    setMessage(null);
    if (picked.length > IMPORT_FILES_AT_A_TIME) {
      setMessage(t('import.tooMany'));
      return;
    }
    const refused = picked.find((p) => !importFileKind(p.name, p.mediaType));
    if (refused) {
      setMessage(t('import.notImportable', { name: refused.name }));
      return;
    }
    const maxLongEdge = ai?.status === 'ready' ? ai.maxLongEdge : IMPORT_DEFAULT_MAX_LONG_EDGE;
    const entries: { entry: FileEntry; picked: PickedFile }[] = picked.map((p) => ({
      picked: p,
      entry: { key: crypto.randomUUID(), name: p.name, kind: null, status: 'reading', rows: [] },
    }));
    setFiles((list) => [...list, ...entries.map((e) => e.entry)]);

    const queue = [...entries];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { entry } = next;
        const prepared = await prepareFile(next.picked, maxLongEdge);
        if (!prepared) {
          update(entry.key, { status: 'failed', error: t('import.notImportable', { name: entry.name }) });
          continue;
        }
        update(entry.key, { kind: prepared.kind });
        if (prepared.kind === 'image' && ai?.status !== 'ready') {
          update(entry.key, { status: 'failed', error: t('import.aiNeeded', { name: entry.name }) });
          continue;
        }
        await read(entry, prepared.file);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
  };

  const onFiles = (picked: PickedFile[]) => {
    if (ai?.status === 'ready' && !aiNoticeAccepted()) setPending(() => () => void addFiles(picked));
    else void addFiles(picked);
  };

  const confirmMapping = (entry: FileEntry, mapping: Mapping, save: boolean) => {
    if (!entry.prepared) return;
    update(entry.key, { status: 'reading', error: undefined });
    void read(entry, entry.prepared, { mapping, save });
  };

  const readWithAi = (entry: FileEntry) => {
    const prepared = entry.prepared;
    if (!prepared) return;
    const send = () => {
      update(entry.key, { status: 'reading', error: undefined });
      void read(entry, prepared, { readWithAi: true });
    };
    if (aiNoticeAccepted()) send();
    else setPending(() => send);
  };

  const removeFile = (key: string) => setFiles((list) => list.filter((f) => f.key !== key));

  const sourceRows = files.flatMap((f) =>
    f.rows.map((row) => (edits[row.id] ? { ...row, draft: edits[row.id]!, optionSide: null } : row)),
  );
  const accountList = accounts.data?.items ?? [];
  const baseCurrency = settings.data?.baseCurrency ?? '';
  const currencyOf = (row: SourceRow) => row.draft.currency?.trim().toUpperCase() || baseCurrency;
  const sections = [...new Set(sourceRows.map(currencyOf))]
    .toSorted((a, b) => (a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b)))
    .map((currency) => {
      const choices = accountList.filter((a) => a.currency === currency);
      const chosen = targets[currency];
      const target = choices.some((a) => a.id === chosen) ? chosen! : (choices[0]?.id ?? '');
      return { currency, rows: sourceRows.filter((r) => currencyOf(r) === currency), choices, target };
    });
  const [created, setCreated] = useState<Record<string, string>>({});
  const creating = useRef(new Set<string>());
  const missingKey = accounts.data
    ? sections
        .filter((s) => s.choices.length === 0)
        .map((s) => s.currency)
        .join(',')
    : '';
  useEffect(() => {
    const missing = missingKey.split(',').filter((c) => c && !creating.current.has(c));
    if (missing.length === 0) return;
    for (const c of missing) creating.current.add(c);
    addAccounts(
      missing.map((currency) => ({
        name: accountNameFor(t('import.newAccountName'), currency),
        broker: null,
        currency,
      })),
    )
      .then(async (added) => {
        await client.invalidateQueries();
        const ids = Object.fromEntries(added.items.map((a) => [a.currency, a.id]));
        setCreated((prev) => ({ ...prev, ...ids }));
        setTargets((prev) => ({ ...prev, ...ids }));
      })
      .catch((error: unknown) => {
        for (const c of missing) creating.current.delete(c);
        setMessage(errorText(error, t('import.failed')));
      });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  const reviewKey = JSON.stringify(
    sections.map((s) => [s.currency, s.target, openingDates[s.currency], s.rows.map((r) => [r.id, r.draft])]),
  );
  const version = useRef(0);
  useEffect(() => {
    if (sections.length === 0) {
      setReviews({});
      return;
    }
    const mine = ++version.current;
    setReviewing(true);
    Promise.all(
      sections.map(async (s) => {
        const openingDate = openingDates[s.currency];
        const response = await reviewImport({
          ...(s.target ? { accountId: s.target } : { currency: s.currency }),
          rows: s.rows,
          ...(openingDate ? { openingDate } : {}),
        });
        return [s.currency, { accountId: s.target, response }] as const;
      }),
    )
      .then((entries) => {
        if (mine === version.current) setReviews(Object.fromEntries(entries));
      })
      .catch((error: unknown) => {
        if (mine === version.current) setMessage(errorText(error, t('import.failed')));
      })
      .finally(() => {
        if (mine === version.current) setReviewing(false);
      });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewKey]);

  const isChecked = (row: ReviewRow) => row.selectable && (checked[row.id] ?? row.checked);
  const setCheck = (rows: ReviewRow[], value: boolean) =>
    setChecked((c) => ({ ...c, ...Object.fromEntries(rows.map((r) => [r.id, value])) }));
  const editRow = (row: ReviewRow, draft: ImportDraft) => {
    setEdits((e) => ({ ...e, [row.id]: draft }));
    setChecked((c) => {
      const { [row.id]: _dropped, ...rest } = c;
      return rest;
    });
  };

  const batches = sections.flatMap((s) => {
    const reviewed = reviews[s.currency];
    const rows = s.target && reviewed?.accountId === s.target ? reviewed.response.rows.filter(isChecked) : [];
    return rows.length > 0 ? [{ currency: s.currency, accountId: s.target, rows }] : [];
  });
  const ticked = batches.flatMap((b) => b.rows);
  const setTarget = (section: (typeof sections)[number], id: string) => {
    setTargets((prev) => ({ ...prev, [section.currency]: id }));
    const ids = new Set(section.rows.map((r) => r.id));
    setChecked((c) => Object.fromEntries(Object.entries(c).filter(([key]) => !ids.has(key))));
  };

  const run = async () => {
    setMessage(null);
    if (ticked.length === 0) {
      setMessage(t('import.nothingTicked'));
      return;
    }
    const bodyOf = (b: (typeof batches)[number], accountId: string) => ({
      accountId,
      importId: importIdFor(accountId),
      openingDate: openingDates[b.currency] || reviews[b.currency]!.response.openingDate,
      rows: b.rows.map((r) => ({ id: r.id, draft: r.draft, allowDuplicate: r.duplicate })),
    });
    const total = { imported: 0 };
    const saved = new Set<string>();
    try {
      const bodies = batches.map((b) => bodyOf(b, b.accountId));
      for (const body of bodies) await checkImport(body);
      for (const body of bodies) {
        const done = await commit.mutateAsync(body);
        total.imported += done.imported;
        for (const row of body.rows) saved.add(row.id);
        delete importIds.current[body.accountId];
      }
      setResult(total);
      setFiles([]);
      setEdits({});
      setChecked({});
      setOpeningDates({});
    } catch (error) {
      if (saved.size > 0) {
        setResult(total);
        setFiles((list) => list.map((f) => ({ ...f, rows: f.rows.filter((r) => !saved.has(r.id)) })));
      }
      const rowId =
        error instanceof ApiError ? (error.details as { rowId?: string } | undefined)?.rowId : undefined;
      const text = errorText(error, t('import.failed'));
      setMessage(rowId ? t('import.rowRefused', { message: text }) : text);
    }
  };

  const busy = files.some((f) => f.status === 'reading');
  const hasRows = sourceRows.length > 0;
  const showSignIn = ai != null && (ai.status === 'sign-in' || (ai.status === 'ready' && ai.account != null));
  const first = showSignIn ? 2 : 1;
  const signedIn = !showSignIn || ai?.status === 'ready';

  return (
    <Col gap={3}>
      <Text variant="title">{t('import.title')}</Text>
      <Text muted>{t('import.intro')}</Text>

      {message && (
        <Banner tone="error" onClose={() => setMessage(null)}>
          {message}
        </Banner>
      )}
      {showSignIn && ai && (
        <StepCard step={1} title={t('import.steps.signIn')} done={ai.status === 'ready'}>
          <AiStatus ai={ai} onWaitingForSignIn={setWaitingForSignIn} />
        </StepCard>
      )}

      <StepCard step={first} title={t('import.steps.upload')} done={hasRows && !busy} upcoming={!signedIn}>
        {!signedIn ? (
          <Text muted>{t('import.steps.uploadLocked')}</Text>
        ) : (
          <Col gap={2}>
            <FileDrop
              label={t('import.drop')}
              hint={t('import.dropHint')}
              accept={ACCEPT}
              multiple={IMPORT_FILES_AT_A_TIME > 1}
              onFiles={onFiles}
            />
            {ai?.status === 'unavailable' && <Text muted>{t('import.aiUnavailable')}</Text>}
            {ai?.status === 'ready' && (
              <Col gap={1}>
                {!showSignIn && <AiStatus ai={ai} onWaitingForSignIn={setWaitingForSignIn} />}
                <Row gap={1} align="center" wrap>
                  <Badge
                    tone={aiFilesLeft === 0 ? 'negative' : 'info'}
                    label={
                      ai.usage.limit == null
                        ? t('import.aiUsageUnlimited', { used: ai.usage.used })
                        : t('import.aiUsage', { left: aiFilesLeft, limit: ai.usage.limit })
                    }
                  />
                  <Text muted>{t('import.aiNotSaved')}</Text>
                </Row>
              </Col>
            )}
            {files.length > 0 && (
              <Col gap={1}>
                {files.map((f) => (
                  <Row key={f.key} gap={1} align="center" justify="between">
                    <Row gap={1} align="center" wrap>
                      <Text>{f.name}</Text>
                      {f.status === 'reading' && <Text muted>{t('import.fileReading')}</Text>}
                      {f.status === 'read' && (
                        <Badge tone="positive" label={t('import.fileRows', { count: f.rows.length })} />
                      )}
                      {f.status === 'read' && f.response?.totals && (
                        <Text muted variant="caption">
                          {totalsText(f.response.totals)}
                        </Text>
                      )}
                      {f.status === 'mapping' && (
                        <Badge tone="warning" label={t('import.fileNeedsMapping')} />
                      )}
                      {f.status === 'failed' && <Badge tone="negative" label={t('import.fileFailed')} />}
                      {f.error && (
                        <Text tone="negative" variant="caption">
                          {f.error}
                        </Text>
                      )}
                    </Row>
                    <IconButton
                      label={t('import.removeFile', { name: f.name })}
                      onClick={() => removeFile(f.key)}
                    >
                      ✕
                    </IconButton>
                  </Row>
                ))}
              </Col>
            )}
            {files
              .filter((f) => f.status === 'mapping' && f.response)
              .map((f) => (
                <MappingStep
                  key={f.key}
                  response={f.response!}
                  busy={busy}
                  aiFiles={ai?.status === 'ready' ? { left: aiFilesLeft, limit: ai.usage.limit } : undefined}
                  onConfirm={(mapping, save) => confirmMapping(f, mapping, save)}
                  onReadWithAi={() => readWithAi(f)}
                />
              ))}
            {busy && !hasRows && <Spinner label={t('import.fileReading')} />}
          </Col>
        )}
      </StepCard>

      <StepCard
        step={first + 1}
        title={t('import.steps.review')}
        upcoming={!hasRows}
        action={reviewing ? <Spinner /> : undefined}
      >
        {hasRows ? (
          <Col gap={3}>
            <Text muted>{t('import.reviewIntro')}</Text>
            {sections.map((s) => (
              <CurrencySection
                key={s.currency}
                currency={s.currency}
                count={s.rows.length}
                accounts={s.choices}
                created={created[s.currency]}
                target={s.target}
                onTarget={(id) => setTarget(s, id)}
                onAddAccount={() => setDialog({ currency: s.currency, account: null })}
                onEditAccount={(account) => setDialog({ currency: s.currency, account })}
                review={
                  reviews[s.currency]?.accountId === s.target ? reviews[s.currency]!.response : undefined
                }
                openingDate={openingDates[s.currency] ?? ''}
                onOpeningDate={(date) => setOpeningDates((d) => ({ ...d, [s.currency]: date }))}
                isChecked={isChecked}
                onCheck={setCheck}
                onEdit={editRow}
              />
            ))}
          </Col>
        ) : (
          <Text muted>{t('import.steps.reviewEmpty')}</Text>
        )}
      </StepCard>

      <StepCard
        step={first + 2}
        title={t('import.steps.save')}
        done={result != null}
        upcoming={!hasRows && result == null}
      >
        <Col gap={2}>
          {result && (
            <Banner
              tone="success"
              action={
                <Button variant="text" onClick={() => void navigate('/')}>
                  {t('import.seeThem')}
                </Button>
              }
            >
              {t('import.imported', { count: result.imported })}
            </Banner>
          )}
          {hasRows ? (
            <Row gap={2} justify="between" align="center" wrap>
              <Text muted>{t('import.afterImport')}</Text>
              <Button
                variant="primary"
                disabled={commit.isPending || busy || reviewing || ticked.length === 0}
                onClick={() => void run()}
                data-testid="run-import"
              >
                {commit.isPending ? t('import.importing') : t('import.importRows', { count: ticked.length })}
              </Button>
            </Row>
          ) : (
            !result && <Text muted>{t('import.steps.saveEmpty')}</Text>
          )}
        </Col>
      </StepCard>

      <AccountDialog
        open={dialog != null}
        account={dialog?.account ?? null}
        currencies={dialog ? [dialog.currency] : undefined}
        busy={saveAccount.isPending}
        error={saveAccount.error ? errorText(saveAccount.error, t('common.somethingWentWrong')) : null}
        onCancel={() => {
          setDialog(null);
          saveAccount.reset();
        }}
        onSave={(values) =>
          dialog?.account && saveAccount.mutate({ currency: dialog.currency, id: dialog.account.id, values })
        }
        onAdd={(values) => dialog && saveAccount.mutate({ currency: dialog.currency, values })}
      />

      {ai?.status === 'ready' && (
        <AiNotice
          open={pending != null}
          processor={ai.processor}
          onCancel={() => setPending(null)}
          onSend={() => {
            const next = pending;
            setPending(null);
            next?.();
          }}
        />
      )}
    </Col>
  );
}

function totalsText(totals: ImportTotals): string {
  return [
    totals.unrealizedPnl != null &&
      translate('import.totalsUnrealized', { shown: totals.unrealizedPnl, read: totals.readUnrealizedPnl }),
    totals.realizedPnl != null &&
      translate('import.totalsRealized', { shown: totals.realizedPnl, read: totals.readRealizedPnl }),
  ]
    .filter(Boolean)
    .join(' · ');
}
