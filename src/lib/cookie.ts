/**
 * A per-browser preference cookie (a theme, a hidden card): httpOnly, Lax, Secure when the app
 * is served over HTTPS in production, for `days` days. One definition (WI-145), so the flags
 * never drift between the forms that set them. The session cookie has its own, in auth.
 */
export const browserCookie = (days: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure:
    process.env.NODE_ENV === 'production' &&
    process.env.APP_BASE_URL?.startsWith('https://') === true,
  path: '/',
  maxAge: 60 * 60 * 24 * days,
});
