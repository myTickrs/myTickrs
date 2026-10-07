import { randomUUID } from 'node:crypto';
import {
  BACKUP_MAX_BYTES,
  backupCounts,
  SYNC_FINGERPRINT_HEADER,
  SYNC_PATHS,
  type BackupFile,
  type CloudSyncSession,
  type CloudSyncSettings,
  type ConfirmCloudSyncInput,
  type SignInProvider,
  type StartCloudSyncInput,
  type SyncComparison,
  type SyncResult,
  type SyncStatus,
} from '@tickrs/shared';
import type { Logger } from 'pino';
import type { Ctx } from '../context.js';
import { AppError } from '../errors.js';
import type { CloudSyncConfig } from '../server-config.js';
import type { DesktopPort, SyncBase } from '../store/ports.js';
import { backupFingerprint, exportBackup, lastChangedAt, restoreBackup } from './backup.js';
import { beginSignIn, callbackPage, finishSignIn, type PendingSignIn } from './oauth-native.js';

const SIGN_IN_TTL_MS = 10 * 60_000;
const CONFIRM_TTL_MS = 10 * 60_000;
const KEEP_FINISHED_MS = 60 * 60_000;
const CLOUD_TIMEOUT_MS = 60_000;

export interface CloudSyncDeps {
  config: CloudSyncConfig;
  fetch: typeof fetch;
  now: () => Date;
  logger?: Logger;
}

interface Session {
  view: CloudSyncSession;
  ctx: Ctx;
  pending?: PendingSignIn;
  startedAt: number;
  idToken?: string;
  shown?: { local: string; cloud?: string };
}

const tooLarge = () =>
  new AppError(
    'CLOUD_REJECTED_DATA',
    422,
    `The myTickrs cloud sent more than ${BACKUP_MAX_BYTES / 1_000_000} MB, the most a portfolio can be`,
  );

const stale = (side: 'local' | 'cloud') =>
  new AppError(
    'SYNC_STALE',
    409,
    side === 'local'
      ? "This computer's data changed while you were deciding. Check again."
      : "The cloud's data changed while you were deciding. Check again.",
  );

const FINISHED = new Set<CloudSyncSession['status']>(['done', 'failed', 'cancelled', 'expired']);
const BUSY = new Set<CloudSyncSession['status']>(['comparing', 'running']);
const WAITING = new Set<CloudSyncSession['status']>(['awaiting-sign-in', 'awaiting-confirm']);

const isEmpty = (counts: { transactions: number } | undefined) => !counts || counts.transactions === 0;

export function compareSides(input: {
  base: SyncBase | null;
  cloudUrl: string;
  account: string;
  local: { fingerprint: string; file: BackupFile };
  cloud: SyncStatus;
}): SyncComparison {
  const { base, local, cloud } = input;
  const localCounts = backupCounts(local.file);
  const sides: Omit<SyncComparison, 'state'> = {
    local: { counts: localCounts, lastChangedAt: lastChangedAt(local.file) },
    cloud: cloud.exists
      ? { exists: true, counts: cloud.counts, lastChangedAt: cloud.lastChangedAt }
      : { exists: false },
  };
  if (!base || !cloud.exists || base.cloudUrl !== input.cloudUrl || base.account !== input.account) {
    const suggested = isEmpty(cloud.exists ? cloud.counts : undefined)
      ? 'to-cloud'
      : isEmpty(localCounts)
        ? 'from-cloud'
        : undefined;
    return { state: 'first-sync', ...(suggested ? { suggested } : {}), ...sides };
  }
  const localChanged = local.fingerprint !== base.localFingerprint;
  const cloudChanged = cloud.fingerprint !== base.cloudFingerprint;
  const lastSyncedAt = base.syncedAt;
  if (localChanged && cloudChanged) return { state: 'both-changed', lastSyncedAt, ...sides };
  if (localChanged) return { state: 'local-changed', suggested: 'to-cloud', lastSyncedAt, ...sides };
  if (cloudChanged) return { state: 'cloud-changed', suggested: 'from-cloud', lastSyncedAt, ...sides };
  return { state: 'in-sync', lastSyncedAt, ...sides };
}

export class CloudSync {
  readonly #sessions = new Map<string, Session>();

  constructor(private readonly deps: CloudSyncDeps) {}

  settings(): Omit<CloudSyncSettings, 'unset'> {
    return {
      cloudUrl: this.deps.config.cloudUrl,
      providers: (Object.keys(this.deps.config.providers) as SignInProvider[]).toSorted(),
    };
  }

  async lastSync(ctx: Ctx): Promise<CloudSyncSettings['lastSync']> {
    const base = await ctx.data.desktop?.syncBase();
    if (!base || base.cloudUrl !== this.deps.config.cloudUrl) return undefined;
    return { at: base.syncedAt, account: base.account };
  }

  start(ctx: Ctx, input: StartCloudSyncInput, redirectUri: string): CloudSyncSession {
    const client = this.deps.config.providers[input.provider];
    if (!client) {
      throw new AppError('VALIDATION_FAILED', 422, `Signing in with ${input.provider} is not set up here`);
    }
    desktopOf(ctx);
    this.#sweep();
    for (const s of this.#sessions.values()) {
      if (BUSY.has(s.view.status)) {
        throw new AppError('SYNC_IN_PROGRESS', 409, 'A sync is already running; wait for it to finish');
      }
      if (WAITING.has(s.view.status)) this.#finish(s, 'cancelled');
    }

    const pending = beginSignIn(client, redirectUri);
    const now = this.deps.now().getTime();
    const session: Session = {
      ctx,
      pending,
      startedAt: now,
      view: {
        id: randomUUID(),
        provider: input.provider,
        status: 'awaiting-sign-in',
        authorizeUrl: pending.authorizeUrl,
        expiresAt: new Date(now + SIGN_IN_TTL_MS).toISOString(),
      },
    };
    this.#sessions.set(session.view.id, session);
    this.deps.logger?.info({ sync: session.view.id, provider: input.provider }, 'sync started');
    return this.#view(session);
  }

  get(id: string): CloudSyncSession {
    return this.#view(this.#require(id));
  }

  cancel(id: string): void {
    const session = this.#require(id);
    if (session.view.status === 'running') {
      throw new AppError('SYNC_IN_PROGRESS', 409, 'This sync is already running and cannot be cancelled');
    }
    if (WAITING.has(session.view.status) || session.view.status === 'comparing') {
      this.#finish(session, 'cancelled');
    }
  }

  async complete(callback: { state?: string; code?: string; error?: string; errorDescription?: string }) {
    this.#sweep();
    const session = [...this.#sessions.values()].find(
      (s) => s.pending && callback.state && s.pending.state === callback.state,
    );
    if (!session?.pending || session.view.status !== 'awaiting-sign-in') {
      throw new AppError(
        'VALIDATION_FAILED',
        400,
        'This sign-in does not belong to a sync that is waiting for it',
      );
    }
    const pending = session.pending;
    session.pending = undefined;
    delete session.view.authorizeUrl;

    if (callback.error || !callback.code) {
      const why = callback.errorDescription ?? callback.error ?? 'no code was returned';
      this.#fail(session, new AppError('CLOUD_SIGN_IN_FAILED', 401, `Sign-in was not completed: ${why}`));
      return this.get(session.view.id);
    }
    const client = this.deps.config.providers[session.view.provider]!;
    try {
      const signedIn = await finishSignIn(client, pending, callback.code, this.deps);
      session.view.account = { email: signedIn.email };
      session.idToken = signedIn.idToken;
      session.view.status = 'comparing';
      this.deps.logger?.info({ sync: session.view.id, account: signedIn.email }, 'sync signed in');
      void this.#compare(session);
    } catch (error) {
      this.#fail(session, error);
    }
    return this.get(session.view.id);
  }

  confirm(id: string, input: ConfirmCloudSyncInput): CloudSyncSession {
    const session = this.#require(id);
    if (session.view.status !== 'awaiting-confirm') {
      throw new AppError('SYNC_NOT_WAITING', 409, 'This sync is not waiting for a direction');
    }
    if (input.direction === 'from-cloud' && !session.view.comparison?.cloud.exists) {
      throw new AppError('VALIDATION_FAILED', 422, 'The cloud has no data for this account yet');
    }
    session.view.direction = input.direction;
    session.view.status = 'running';
    this.deps.logger?.info({ sync: id, direction: input.direction }, 'sync confirmed');
    void this.#run(session);
    return this.#view(session);
  }

  async #compare(session: Session): Promise<void> {
    try {
      const desktop = desktopOf(session.ctx);
      const [status, file, base] = await Promise.all([
        this.#status(session.idToken!),
        exportBackup(session.ctx),
        desktop.syncBase(),
      ]);
      if (session.view.status !== 'comparing') return;
      const local = { fingerprint: backupFingerprint(file), file };
      session.shown = { local: local.fingerprint, cloud: status.exists ? status.fingerprint : undefined };
      session.view.comparison = compareSides({
        base,
        cloudUrl: this.deps.config.cloudUrl,
        account: session.view.account!.email,
        local,
        cloud: status,
      });
      session.view.status = 'awaiting-confirm';
      session.view.expiresAt = new Date(this.deps.now().getTime() + CONFIRM_TTL_MS).toISOString();
      this.deps.logger?.info(
        { sync: session.view.id, state: session.view.comparison.state },
        'sync compared',
      );
    } catch (error) {
      if (session.view.status === 'comparing') this.#fail(session, error);
    }
  }

  async #run(session: Session): Promise<void> {
    try {
      const { ctx } = session;
      const shown = session.shown!;
      const idToken = session.idToken!;
      const before = await exportBackup(ctx);
      if (backupFingerprint(before) !== shown.local) throw stale('local');

      const outcome =
        session.view.direction === 'to-cloud'
          ? await this.#pushToCloud(before, idToken, shown.cloud)
          : await this.#pullFromCloud(ctx, idToken, shown.cloud);
      session.view.result = outcome.result;

      await desktopOf(ctx).setSyncBase({
        cloudUrl: this.deps.config.cloudUrl,
        account: session.view.account!.email,
        localFingerprint: backupFingerprint(await exportBackup(ctx)),
        cloudFingerprint: outcome.cloudFingerprint,
        syncedAt: this.deps.now().toISOString(),
      });
      this.#finish(session, 'done');
      this.deps.logger?.info({ sync: session.view.id, result: session.view.result }, 'sync done');
    } catch (error) {
      this.#fail(session, error);
    }
  }

  async #status(idToken: string): Promise<SyncStatus> {
    const res = await this.#cloud(SYNC_PATHS.status, idToken, { method: 'GET' });
    if (!res.ok) throw await this.#cloudError(res);
    const body = (await res.json().catch(() => null)) as SyncStatus | null;
    if (!body || typeof body.exists !== 'boolean' || (body.exists && typeof body.fingerprint !== 'string')) {
      throw new AppError('CLOUD_UNREACHABLE', 502, 'The myTickrs cloud did not say what it holds');
    }
    return body;
  }

  async #pushToCloud(file: BackupFile, idToken: string, expected: string | undefined) {
    const res = await this.#cloud(SYNC_PATHS.pushToCloud, idToken, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(expected ? { 'if-match': `"${expected}"` } : {}),
      },
      body: JSON.stringify(file),
    });
    if (res.status === 412) {
      await res.body?.cancel();
      throw stale('cloud');
    }
    if (!res.ok) throw await this.#cloudError(res);
    const body = (await res.json().catch(() => null)) as { fingerprint?: unknown } | null;
    if (typeof body?.fingerprint !== 'string') {
      throw new AppError('CLOUD_UNREACHABLE', 502, 'The myTickrs cloud did not say what it now holds');
    }
    const result: SyncResult = { exportedAt: file.exportedAt, now: backupCounts(file) };
    return { result, cloudFingerprint: body.fingerprint };
  }

  async #pullFromCloud(ctx: Ctx, idToken: string, expected: string | undefined) {
    const res = await this.#cloud(SYNC_PATHS.pullFromCloud, idToken, { method: 'GET' });
    if (!res.ok) throw await this.#cloudError(res);
    const cloudFingerprint = res.headers.get(SYNC_FINGERPRINT_HEADER);
    if (!cloudFingerprint || cloudFingerprint !== expected) {
      await res.body?.cancel();
      throw stale('cloud');
    }
    const text = await this.#readCapped(res);
    const restored = await restoreBackup(ctx, text, true);
    const result: SyncResult = {
      exportedAt: restored.exportedAt,
      replaced: restored.current,
      now: restored.backup,
    };
    return { result, cloudFingerprint };
  }

  async #readCapped(res: Response): Promise<string> {
    if (Number(res.headers.get('content-length') ?? 0) > BACKUP_MAX_BYTES) {
      await res.body?.cancel();
      throw tooLarge();
    }
    if (!res.body) return '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > BACKUP_MAX_BYTES) {
          await reader.cancel();
          throw tooLarge();
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('CLOUD_UNREACHABLE', 502, 'The myTickrs cloud stopped sending the data part way');
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  async #cloud(path: string, idToken: string, init: RequestInit): Promise<Response> {
    try {
      return await this.deps.fetch(`${this.deps.config.cloudUrl}${path}`, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${idToken}`, accept: 'application/json' },
        signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
      });
    } catch {
      throw new AppError(
        'CLOUD_UNREACHABLE',
        502,
        `Could not reach the myTickrs cloud at ${this.deps.config.cloudUrl}`,
      );
    }
  }

  async #cloudError(res: Response): Promise<AppError> {
    const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
    const said = typeof body?.error?.message === 'string' ? body.error.message : undefined;
    switch (res.status) {
      case 401:
        return new AppError(
          'CLOUD_ACCOUNT_NOT_FOUND',
          401,
          `The myTickrs cloud did not accept this sign-in${said ? ` (${said})` : ''}. Sign up at ${this.deps.config.cloudUrl} with the same account first.`,
        );
      case 403:
        return new AppError(
          'CLOUD_SYNC_REFUSED',
          403,
          said ?? 'The myTickrs cloud refused to sync this account',
        );
      case 413:
      case 422:
        return new AppError(
          'CLOUD_REJECTED_DATA',
          422,
          said ?? 'The myTickrs cloud did not accept this data',
        );
      default:
        return new AppError(
          'CLOUD_UNREACHABLE',
          502,
          `The myTickrs cloud answered ${res.status}${said ? `: ${said}` : ''}`,
        );
    }
  }

  #fail(session: Session, error: unknown): void {
    const known = error instanceof AppError;
    session.view.error = {
      code: known ? error.code : 'INTERNAL',
      message: known ? error.message : 'The sync failed unexpectedly',
    };
    this.#finish(session, 'failed');
    this.deps.logger?.warn({ sync: session.view.id, error: session.view.error }, 'sync failed');
  }

  #finish(session: Session, status: CloudSyncSession['status']): void {
    session.view.status = status;
    session.pending = undefined;
    session.idToken = undefined;
    session.shown = undefined;
    delete session.view.authorizeUrl;
  }

  #view(session: Session): CloudSyncSession {
    return structuredClone(session.view);
  }

  #require(id: string): Session {
    this.#sweep();
    const session = this.#sessions.get(id);
    if (!session) throw new AppError('NOT_FOUND', 404, 'No such sync');
    return session;
  }

  #sweep(): void {
    const now = this.deps.now().getTime();
    for (const [id, s] of this.#sessions) {
      if (WAITING.has(s.view.status) && now >= Date.parse(s.view.expiresAt)) this.#finish(s, 'expired');
      if (FINISHED.has(s.view.status) && now - s.startedAt >= KEEP_FINISHED_MS) this.#sessions.delete(id);
    }
  }
}

function desktopOf(ctx: Ctx): DesktopPort {
  const desktop = ctx.data.desktop;
  if (!desktop) throw new AppError('INTERNAL', 500, 'This store cannot keep sync state');
  return desktop;
}

export function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function syncCallbackPage(session: CloudSyncSession | undefined, failure?: string): string {
  const signedIn = session != null && session.status !== 'failed';
  return callbackPage(
    signedIn,
    signedIn
      ? 'Signed in. You can close this tab and return to myTickrs to check both sides and choose how to sync.'
      : `${failure ?? session?.error?.message ?? 'Something went wrong.'} Return to myTickrs to try again.`,
  );
}
