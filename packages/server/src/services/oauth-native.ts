import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../errors.js';
import type { OAuthClientConfig } from '../server-config.js';

export interface PendingSignIn {
  authorizeUrl: string;
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
}

export interface SignedIn {
  idToken: string;
  email: string;
}

const randomToken = () => randomBytes(32).toString('base64url');

export function beginSignIn(client: OAuthClientConfig, redirectUri: string): PendingSignIn {
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const url = new URL(client.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return { authorizeUrl: url.toString(), state, nonce, verifier, redirectUri };
}

const signInFailed = (message: string) => new AppError('CLOUD_SIGN_IN_FAILED', 401, message);

interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nonce?: unknown;
  email?: unknown;
  preferred_username?: unknown;
}

function claimsOf(idToken: string): IdTokenClaims {
  const payload = idToken.split('.')[1];
  if (!payload) throw signInFailed('The sign-in provider returned an unreadable ID token');
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as IdTokenClaims;
  } catch {
    throw signInFailed('The sign-in provider returned an unreadable ID token');
  }
}

export async function finishSignIn(
  client: OAuthClientConfig,
  pending: Pick<PendingSignIn, 'verifier' | 'nonce' | 'redirectUri'>,
  code: string,
  deps: { fetch: typeof fetch; now: () => Date },
): Promise<SignedIn> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    client_id: client.clientId,
    code_verifier: pending.verifier,
  });
  if (client.clientSecret) form.set('client_secret', client.clientSecret);

  let res: Response;
  try {
    res = await deps.fetch(client.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AppError('CLOUD_UNREACHABLE', 502, 'Could not reach the sign-in provider');
  }
  const body = (await res.json().catch(() => ({}))) as { id_token?: unknown; error_description?: unknown };
  if (!res.ok || typeof body.id_token !== 'string') {
    const why = typeof body.error_description === 'string' ? `: ${body.error_description}` : '';
    throw signInFailed(`The sign-in provider did not complete the sign-in${why}`);
  }

  const claims = claimsOf(body.id_token);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (typeof claims.iss !== 'string' || !client.issuer.test(claims.iss)) {
    throw signInFailed('The ID token is not from the expected sign-in provider');
  }
  if (!audiences.includes(client.clientId)) {
    throw signInFailed('The ID token was issued to another application');
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= deps.now().getTime()) {
    throw signInFailed('The ID token has expired');
  }
  if (claims.nonce !== pending.nonce) {
    throw signInFailed('The ID token does not belong to this sign-in');
  }
  const email =
    typeof claims.email === 'string'
      ? claims.email
      : typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : '';
  return { idToken: body.id_token, email };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CLOSE_SCRIPT = 'window.close()';

export const CALLBACK_PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  `script-src 'sha256-${createHash('sha256').update(CLOSE_SCRIPT).digest('base64')}'`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const CALLBACK_PAGE_STYLE = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1c1b1f;--err-main:#b3261e;--err-bg:#f7e9e8;--err-fg:#480f0c}
@media (prefers-color-scheme:dark){:root{--bg:#121212;--fg:#e6e1e5;--err-main:#f2877e;--err-bg:#3b1a17;--err-fg:#facfcb}}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif}
main{max-width:32rem;margin:4rem auto;padding:0 1rem}
.alert{display:flex;gap:12px;padding:12px 16px;border:1px solid var(--err-main);border-radius:4px;line-height:1.5;background:var(--err-bg);color:var(--err-fg)}
.alert svg{flex:none;width:22px;height:22px;margin-top:2px;fill:var(--err-main)}
.alert h1{margin:0 0 4px;font-size:1rem;font-weight:600}
.alert p{margin:0;font-size:.875rem}`.replace(/\n/g, '');

const ERROR_ICON =
  'M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z';

export function callbackPage(ok: boolean, text: string): string {
  const title = ok ? 'Signed in' : 'Sign-in did not complete';
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>myTickrs — ${esc(title)}</title><style>${CALLBACK_PAGE_STYLE}</style>`;
  if (ok)
    return `${head}<script>${CLOSE_SCRIPT}</script></head><body><main><p>${esc(text)}</p></main></body></html>`;
  return `${head}</head><body><main><div class="alert" role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ERROR_ICON}"/></svg><div><h1>${esc(title)}</h1><p>${esc(text)}</p></div></div></main></body></html>`;
}
