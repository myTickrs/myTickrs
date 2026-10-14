import type { SignInProvider } from '@tickrs/shared';
import { AppError } from '../errors.js';
import type { CloudSyncConfig } from '../server-config.js';

export type SignInMethod = { kind: 'loopback'; redirectUri: string } | { kind: 'relay'; instance: string };

export interface Relay {
  id: string;
  startUrl: string;
  collectSecret: string;
  expiresAt: string;
}

export type RelayResult =
  | { kind: 'pending' }
  | { kind: 'signed-in'; token: string; email: string; expiresAt: string }
  | { kind: 'failed'; message: string };

export const RELAY_POLL_MS = 2_000;
const CLOUD_TIMEOUT_MS = 30_000;

export interface RelayDeps {
  config: CloudSyncConfig;
  fetch: typeof fetch;
}

type ErrorBody = { error?: { code?: unknown; message?: unknown } } | null;
const messageOf = (body: ErrorBody) =>
  typeof body?.error?.message === 'string' ? body.error.message : undefined;

export async function startRelay(
  deps: RelayDeps,
  input: { provider: SignInProvider; client: 'sync' | 'import'; instance: string; refusal: string },
): Promise<Relay> {
  const { cloudUrl } = deps.config;
  let res: Response;
  try {
    res = await deps.fetch(`${cloudUrl}/api/v1/desktop-auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ provider: input.provider, client: input.client, instance: input.instance }),
      signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
    });
  } catch {
    throw new AppError('CLOUD_UNREACHABLE', 502, `Could not reach the myTickrs cloud at ${cloudUrl}`);
  }
  const body = (await res.json().catch(() => null)) as (Partial<Relay> & NonNullable<ErrorBody>) | null;
  if (res.status === 404 || res.status === 401) {
    throw new AppError(
      'SYNC_NEEDS_LOCAL_BROWSER',
      400,
      `${input.refusal} Or update the myTickrs cloud at ${cloudUrl}, which can then sign you in from any computer.`,
    );
  }
  if (
    !res.ok ||
    typeof body?.id !== 'string' ||
    typeof body.startUrl !== 'string' ||
    typeof body.collectSecret !== 'string' ||
    typeof body.expiresAt !== 'string'
  ) {
    const said = messageOf(body);
    throw new AppError(
      'CLOUD_UNREACHABLE',
      502,
      `The myTickrs cloud could not start the sign-in${said ? `: ${said}` : ` (it answered ${res.status})`}`,
    );
  }
  if (new URL(body.startUrl).origin !== new URL(cloudUrl).origin) {
    throw new AppError('CLOUD_UNREACHABLE', 502, 'The myTickrs cloud sent a sign-in address on another site');
  }
  return {
    id: body.id,
    startUrl: body.startUrl,
    collectSecret: body.collectSecret,
    expiresAt: body.expiresAt,
  };
}

export async function collectRelay(deps: RelayDeps, relay: Relay): Promise<RelayResult> {
  let res: Response;
  try {
    res = await deps.fetch(
      `${deps.config.cloudUrl}/api/v1/desktop-auth/${encodeURIComponent(relay.id)}/collect`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ collectSecret: relay.collectSecret }),
        signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
      },
    );
  } catch {
    return { kind: 'pending' };
  }
  const body = (await res.json().catch(() => null)) as
    ({ token?: unknown; email?: unknown; expiresAt?: unknown } & NonNullable<ErrorBody>) | null;
  if (res.status === 428) return { kind: 'pending' };
  if (res.status === 410)
    return { kind: 'failed', message: messageOf(body) ?? 'The sign-in did not complete.' };
  if (res.status === 404) {
    return {
      kind: 'failed',
      message: 'The sign-in is no longer waiting in the myTickrs cloud. Start again.',
    };
  }
  if (res.ok && typeof body?.token === 'string' && typeof body.expiresAt === 'string') {
    return {
      kind: 'signed-in',
      token: body.token,
      email: typeof body.email === 'string' ? body.email : '',
      expiresAt: body.expiresAt,
    };
  }
  return { kind: 'pending' };
}

export function pollRelay(
  deps: RelayDeps,
  relay: Relay,
  done: (result: Exclude<RelayResult, { kind: 'pending' }>) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    const result = await collectRelay(deps, relay);
    if (stopped) return;
    if (result.kind === 'pending') {
      schedule();
      return;
    }
    stopped = true;
    done(result);
  };
  const schedule = () => {
    timer = setTimeout(() => void tick(), deps.config.relayPollMs ?? RELAY_POLL_MS);
    timer.unref?.();
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
