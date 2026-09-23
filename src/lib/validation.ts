import { z } from 'zod';
export const resourceUrl = z.url().refine((v) => {
  if (!URL.canParse(v)) return false;
  const u = new URL(v);
  return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
}, 'Use an HTTP or HTTPS URL without credentials');
export const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const timezone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, 'Use a valid IANA timezone');
