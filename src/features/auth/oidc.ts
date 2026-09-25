import type { AuthConfig } from '../../lib/env';
import { requestWithRetry, type HttpOptions } from '../calendar/google';

/**
 * Owner sign-in with Google OpenID Connect (ADR-012). Scopes are only `openid email`; Calendar
 * access is a separate consent. The ID token comes straight from Google's token endpoint over TLS,
 * so (per OpenID Connect Core 3.1.3.7) TLS authenticates the issuer and the claims below are
 * validated instead of the signature.
 */
export const LOGIN_SCOPES = 'openid email';
export type AuthErrorCode =
  | 'state_mismatch'
  | 'state_expired'
  | 'access_denied'
  | 'exchange_failed'
  | 'invalid_token'
  | 'email_unverified'
  | 'not_owner'
  | 'owner_mismatch'
  | 'rate_limited';
export class AuthError extends Error {
  constructor(public code: AuthErrorCode) {
    super(code);
  }
}
export const authErrorMessages: Record<AuthErrorCode, string> = {
  state_mismatch: 'The sign-in could not be verified. Please try again.',
  state_expired: 'The sign-in took too long. Please try again.',
  access_denied: 'Google sign-in was cancelled.',
  exchange_failed: 'Google sign-in failed. Please try again.',
  invalid_token: 'Google returned an unexpected sign-in response.',
  email_unverified: 'That Google account email is not verified.',
  not_owner: 'This CareerOS workspace is private. That account is not allowed.',
  owner_mismatch:
    'This database already belongs to a different owner email. Set OWNER_EMAIL to it, or update the stored owner email (see the migration checklist).',
  rate_limited: 'Too many sign-in attempts. Wait a minute and try again.',
};

export function authorizationUrl(
  cfg: AuthConfig,
  p: { state: string; codeChallenge: string; nonce: string },
) {
  const u = new URL(cfg.authUrl);
  for (const [k, v] of Object.entries({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: LOGIN_SCOPES,
    prompt: 'select_account',
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
  }))
    u.searchParams.set(k, v);
  return u.toString();
}

export async function exchangeLoginCode(
  cfg: AuthConfig,
  code: string,
  codeVerifier: string,
  http: HttpOptions = {},
) {
  try {
    const res = await requestWithRetry(
      cfg.tokenUrl,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          code_verifier: codeVerifier,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      },
      http,
    );
    const json = (await res.json()) as { id_token?: string };
    if (!json.id_token) throw new AuthError('invalid_token');
    // Access/refresh tokens from sign-in are discarded: sign-in grants no API access.
    return json.id_token;
  } catch (error) {
    throw error instanceof AuthError ? error : new AuthError('exchange_failed');
  }
}

const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
/** Validates claims and the owner allowlist; returns the normalised email. */
export function verifyIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string; ownerEmail: string; now: Date },
) {
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(
      Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
  } catch {
    throw new AuthError('invalid_token');
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const nowSec = +expected.now / 1000;
  if (
    !ISSUERS.includes(String(claims.iss)) ||
    !aud.includes(expected.clientId) ||
    typeof claims.exp !== 'number' ||
    claims.exp < nowSec ||
    (typeof claims.iat === 'number' && claims.iat > nowSec + 300) ||
    claims.nonce !== expected.nonce
  )
    throw new AuthError('invalid_token');
  if (claims.email_verified !== true) throw new AuthError('email_unverified');
  const email = String(claims.email ?? '')
    .trim()
    .toLowerCase();
  if (!email || email !== expected.ownerEmail.trim().toLowerCase())
    throw new AuthError('not_owner');
  return email;
}

/** Only same-origin paths survive; anything else (//evil, http:, \\) becomes /today. */
export function safeNext(next: string | null | undefined) {
  return next &&
    /^\/(?![/\\])[\w\-./?=&%#]*$/.test(next) &&
    !next.startsWith('/login')
    ? next
    : '/today';
}
