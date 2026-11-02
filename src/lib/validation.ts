import { z } from 'zod';
import { isLocalTime, isTimeZone } from './time';

/** "confidenceAfter" → "Confidence after", "contacts.0.email" → "Contacts email". */
export const fieldLabel = (path: PropertyKey[]) =>
  path
    .filter((p) => typeof p === 'string')
    .map((p) =>
      String(p)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase(),
    )
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());

/**
 * One line per Zod issue for form feedback. The field is named in words, never as the raw
 * schema key, and not repeated when the message already starts with it.
 */
export function issueMessages(issues: z.core.$ZodIssue[]) {
  return [
    ...new Set(
      issues.map((i) => {
        const label = fieldLabel(i.path);
        return label && !i.message.toLowerCase().startsWith(label.toLowerCase())
          ? `${label}: ${i.message}`
          : i.message;
      }),
    ),
  ].join('; ');
}
export const resourceUrl = z.url().refine((v) => {
  if (!URL.canParse(v)) return false;
  const u = new URL(v);
  return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
}, 'Use an HTTP or HTTPS URL without credentials');
export const localTime = z.string().refine(isLocalTime);
export const timezone = z
  .string()
  .refine(isTimeZone, 'Use a valid IANA timezone');
