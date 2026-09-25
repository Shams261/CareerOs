'use server';
import { createHash } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authConfig } from '@/lib/env';
import {
  encryptSecret,
  parseEncryptionKey,
  randomToken,
} from '@/lib/token-crypto';
import { SESSION_COOKIE, revokeSession } from '@/server/session';
import { clientIp, rateLimit } from '@/server/rate-limit';
import { authorizationUrl, safeNext } from './oidc';
import { LOGIN_COOKIE } from './constants';

/** Starts Google sign-in (openid email only) with state, nonce and PKCE in an encrypted cookie. */
export async function signInAction(form: FormData) {
  const cfg = authConfig();
  if (!rateLimit(`login:${clientIp(await headers())}`, 20))
    redirect('/login?error=rate_limited');
  const state = randomToken(),
    verifier = randomToken(48),
    nonce = randomToken();
  const cookie = encryptSecret(
    JSON.stringify({
      state,
      verifier,
      nonce,
      next: safeNext(String(form.get('next') ?? '')),
      exp: Date.now() + 600000,
    }),
    parseEncryptionKey(cfg.authSecret),
  );
  (await cookies()).set(LOGIN_COOKIE, cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.secureCookies,
    path: '/api/auth',
    maxAge: 600,
  });
  redirect(
    authorizationUrl(cfg, {
      state,
      nonce,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    }),
  );
}

/** Revokes the server-side session and clears the cookie. Calendar connections are untouched. */
export async function signOutAction() {
  const jar = await cookies();
  await revokeSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect('/login?signed_out=1');
}
