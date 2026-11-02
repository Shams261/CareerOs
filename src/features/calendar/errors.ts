import 'server-only';
import { GoogleApiError } from './google';

/** Calendar errors the owner may see, and which ones stop sync (WI-131, split from service.ts). */
export type CalendarErrorCode =
  | 'not_configured'
  | 'access_denied'
  | 'state_mismatch'
  | 'state_expired'
  | 'missing_refresh_token'
  | 'scope_denied'
  | 'exchange_failed'
  | 'not_connected'
  | 'busy'
  | 'reauth_required'
  | 'calendar_missing'
  | 'remote_unsupported'
  | 'google_unavailable'
  | 'unexpected';
/** Sanitized, user-safe errors. Raw Google/OAuth errors are never shown or stored. */
export class CalendarError extends Error {
  constructor(public code: CalendarErrorCode) {
    super(code);
  }
}
export const errorMessages: Record<CalendarErrorCode, string> = {
  not_configured: 'Google Calendar is not configured on this server.',
  access_denied: 'Google access was not granted.',
  state_mismatch:
    'The Google sign-in could not be verified. Try connecting again.',
  state_expired: 'The Google sign-in took too long. Try connecting again.',
  missing_refresh_token:
    'Google did not grant offline access. Remove Silsila from your Google account permissions, then connect again.',
  scope_denied:
    'Silsila needs permission to manage its own calendar. Connect again and allow calendar access.',
  exchange_failed: 'Google sign-in failed. Try connecting again.',
  not_connected: 'Google Calendar is not connected.',
  busy: 'A sync is already running. Try again in a moment.',
  reauth_required:
    'Reconnect required: Google no longer accepts the saved permission.',
  calendar_missing:
    'The Silsila calendar no longer exists in Google. Reconnect to create a new one.',
  remote_unsupported:
    'The Google version is an all-day or untitled event that Silsila cannot use. Keep the Silsila version.',
  google_unavailable:
    'Google Calendar is temporarily unavailable. Sync will retry.',
  unexpected: 'Sync failed unexpectedly. Details were logged on the server.',
};
export function codeOf(error: unknown): CalendarErrorCode {
  if (error instanceof CalendarError) return error.code;
  if (error instanceof GoogleApiError)
    return error.kind === 'auth'
      ? 'reauth_required'
      : error.kind === 'notFound'
        ? 'calendar_missing'
        : error.kind === 'transient'
          ? 'google_unavailable'
          : 'unexpected';
  return 'unexpected';
}
export const fatal = (code: CalendarErrorCode) =>
  ['reauth_required', 'calendar_missing'].includes(code);
