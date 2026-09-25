import { cookies, headers } from 'next/headers';
import { authConfig, env } from '@/lib/env';
import {
  decryptSecret,
  parseEncryptionKey,
  safeEqual,
} from '@/lib/token-crypto';
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSession,
  ownerAccount,
} from '@/server/session';
import {
  AuthError,
  exchangeLoginCode,
  safeNext,
  verifyIdToken,
} from '@/features/auth/oidc';
import { LOGIN_COOKIE } from '@/features/auth/constants';
export const runtime = 'nodejs';

/** Google redirects here after sign-in. Only the configured OWNER_EMAIL receives a session. */
export async function GET(request: Request) {
  const cfg = authConfig();
  const url = new URL(request.url);
  const jar = await cookies();
  const raw = jar.get(LOGIN_COOKIE)?.value;
  jar.delete(LOGIN_COOKIE);
  const fail = (code: string) =>
    Response.redirect(new URL(`/login?error=${code}`, cfg.baseUrl), 303);
  try {
    if (url.searchParams.get('error')) throw new AuthError('access_denied');
    let saved: {
      state: string;
      verifier: string;
      nonce: string;
      next: string;
      exp: number;
    };
    try {
      saved = JSON.parse(
        decryptSecret(raw ?? '', parseEncryptionKey(cfg.authSecret)),
      );
    } catch {
      throw new AuthError('state_mismatch');
    }
    const state = url.searchParams.get('state');
    if (!state || !safeEqual(state, saved.state))
      throw new AuthError('state_mismatch');
    if (Date.now() > saved.exp) throw new AuthError('state_expired');
    const code = url.searchParams.get('code');
    if (!code) throw new AuthError('exchange_failed');
    const idToken = await exchangeLoginCode(cfg, code, saved.verifier);
    verifyIdToken(idToken, {
      clientId: cfg.clientId,
      nonce: saved.nonce,
      ownerEmail: env().OWNER_EMAIL,
      now: new Date(),
    });
    const user = await ownerAccount(env().OWNER_EMAIL);
    const token = await createSession(
      user.id,
      (await headers()).get('user-agent'),
    );
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: cfg.secureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 86400,
    });
    console.info('[auth] signed-in');
    return Response.redirect(new URL(safeNext(saved.next), cfg.baseUrl), 303);
  } catch (error) {
    const code = error instanceof AuthError ? error.code : 'exchange_failed';
    console.warn(`[auth] sign-in rejected ${code}`);
    return fail(code);
  }
}
