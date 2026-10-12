import {
  IMPORT_AI_PATHS,
  SIGN_IN_PROVIDERS,
  extractResultSchema,
  mappingSchema,
  type AiContext,
  type AiServiceConfig,
  type ExtractResult,
  type ImportConfig,
  type Mapping,
  type SignInProvider,
  type StructuredRecords,
  type StructuredSample,
} from '@tickrs/shared';
import type { Logger } from 'pino';
import type { Ctx } from '../context.js';
import { AppError } from '../errors.js';
import type { CloudSyncConfig } from '../server-config.js';
import { beginSignIn, callbackPage, finishSignIn, type PendingSignIn } from '../services/oauth-native.js';
import type { AiFile, AiSignIn, ImportAi } from './ai.js';

const TOKEN_TTL_MS = 55 * 60_000;
const SIGN_IN_TTL_MS = 10 * 60_000;
const CLOUD_TIMEOUT_MS = 180_000;

export interface RemoteImportAiDeps {
  config: CloudSyncConfig;
  fetch: typeof fetch;
  now: () => Date;
  logger?: Logger;
}

export class RemoteImportAi implements ImportAi {
  #token: { idToken: string; email: string; expiresAt: number } | null = null;
  readonly #pending = new Map<
    string,
    { pending: PendingSignIn; provider: SignInProvider; startedAt: number }
  >();
  readonly signIn: AiSignIn;

  constructor(private readonly deps: RemoteImportAiDeps) {
    this.signIn = {
      start: (provider, redirectUri) => this.#start(provider, redirectUri),
      owns: (state) => Boolean(state && this.#pending.has(state)),
      complete: (callback) => this.#complete(callback),
      signOut: () => {
        this.#token = null;
      },
    };
  }

  #providers(): SignInProvider[] {
    return SIGN_IN_PROVIDERS.filter((p) => this.deps.config.providers[p]);
  }

  #tokenNow(): { idToken: string; email: string } | null {
    if (this.#token && this.#token.expiresAt > this.deps.now().getTime()) return this.#token;
    this.#token = null;
    return null;
  }

  #noAccount: string | null = null;

  #signIn(): ImportConfig['ai'] {
    return {
      status: 'sign-in',
      providers: this.#providers(),
      ...(this.#noAccount ? { noAccount: this.#noAccount } : {}),
    };
  }

  async config(_ctx: Ctx): Promise<ImportConfig['ai']> {
    const token = this.#tokenNow();
    if (!token) return this.#signIn();
    try {
      const service = await this.#call<AiServiceConfig>('GET', IMPORT_AI_PATHS.config);
      return { status: 'ready', account: token.email, ...service };
    } catch (error) {
      if (error instanceof AppError && error.status === 401) return this.#signIn();
      if (error instanceof AppError && error.code === 'CLOUD_ACCOUNT_NOT_FOUND') {
        this.#noAccount = token.email;
        this.#token = null;
        return this.#signIn();
      }
      throw error;
    }
  }

  async extract(_ctx: Ctx, file: AiFile, context: AiContext): Promise<ExtractResult> {
    const body = await this.#call<unknown>('POST', IMPORT_AI_PATHS.extract, {
      context,
      file: { name: file.name, mediaType: file.mediaType, data: file.data },
    });
    const parsed = extractResultSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError('CLOUD_UNREACHABLE', 502, 'The myTickrs cloud sent rows we cannot read');
    return parsed.data;
  }

  async proposeMapping(_ctx: Ctx, sample: StructuredSample, context: AiContext): Promise<Mapping> {
    const body = await this.#call<unknown>('POST', IMPORT_AI_PATHS.mapping, { context, sample });
    const parsed = mappingSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError('CLOUD_UNREACHABLE', 502, 'The myTickrs cloud sent a mapping we cannot read');
    return parsed.data;
  }

  async readRecords(_ctx: Ctx, records: StructuredRecords, context: AiContext): Promise<ExtractResult> {
    const body = await this.#call<unknown>('POST', IMPORT_AI_PATHS.records, { context, records });
    const parsed = extractResultSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError('CLOUD_UNREACHABLE', 502, 'The myTickrs cloud sent rows we cannot read');
    return parsed.data;
  }

  #start(provider: string, redirectUri: string): { authorizeUrl: string } {
    const client = this.deps.config.providers[provider as SignInProvider];
    if (!client)
      throw new AppError('VALIDATION_FAILED', 422, `Signing in with ${provider} is not set up here`);
    const now = this.deps.now().getTime();
    for (const [state, entry] of this.#pending)
      if (now - entry.startedAt > SIGN_IN_TTL_MS) this.#pending.delete(state);
    const pending = beginSignIn(client, redirectUri);
    this.#pending.set(pending.state, { pending, provider: provider as SignInProvider, startedAt: now });
    return { authorizeUrl: pending.authorizeUrl };
  }

  async #complete(callback: { state?: string; code?: string; error?: string; errorDescription?: string }) {
    const entry = callback.state ? this.#pending.get(callback.state) : undefined;
    if (callback.state) this.#pending.delete(callback.state);
    if (!entry) return callbackPage(false, 'This sign-in has expired. Return to myTickrs and try again.');
    if (callback.error || !callback.code) {
      return callbackPage(
        false,
        `Sign-in was not completed: ${callback.errorDescription ?? callback.error ?? 'no code was returned'}.`,
      );
    }
    try {
      const signedIn = await finishSignIn(
        this.deps.config.providers[entry.provider]!,
        entry.pending,
        callback.code,
        this.deps,
      );
      this.#token = { ...signedIn, expiresAt: this.deps.now().getTime() + TOKEN_TTL_MS };
      this.#noAccount = null;
      this.deps.logger?.info({ account: signedIn.email }, 'signed in to the cloud for AI import');
      return callbackPage(
        true,
        'Signed in. You can close this tab and return to myTickrs to import your files.',
      );
    } catch (error) {
      this.deps.logger?.warn({ err: error }, 'AI import sign-in failed');
      return callbackPage(false, error instanceof AppError ? error.message : 'Something went wrong.');
    }
  }

  async #call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const token = this.#tokenNow();
    if (!token) throw new AppError('IMPORT_AI_SIGN_IN', 401, 'Sign in to myTickrs cloud to read this file');
    let res: Response;
    try {
      res = await this.deps.fetch(`${this.deps.config.cloudUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token.idToken}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS),
      });
    } catch {
      throw new AppError('CLOUD_UNREACHABLE', 502, 'Could not reach the myTickrs cloud');
    }
    const payload = (await res.json().catch(() => null)) as
      (T & { error?: { code?: string; message?: string; details?: unknown } }) | null;
    if (res.ok && payload) return payload;
    if (res.status === 401) {
      this.#token = null;
      throw new AppError('IMPORT_AI_SIGN_IN', 401, 'Your myTickrs cloud sign-in has expired; sign in again');
    }
    const error = payload?.error;
    throw new AppError(
      error?.code ?? 'CLOUD_UNREACHABLE',
      res.status >= 400 && res.status < 600 ? res.status : 502,
      error?.message ?? `The myTickrs cloud answered ${res.status}`,
      error?.details,
    );
  }
}
