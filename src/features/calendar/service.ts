import 'server-only';
/**
 * The calendar module's public surface (WI-131): the code lives in errors, core, oauth, sync,
 * watch and connection; importers keep this path.
 */
export { CalendarError, errorMessages, type CalendarErrorCode } from './errors';
export { defaultDeps, getConnection, type CalendarDeps } from './core';
export { beginOAuth, completeOAuth } from './oauth';
export { resolveConflict, syncCalendar } from './sync';
export { verifyWebhook } from './watch';
export {
  calendarOverview,
  disconnectCalendar,
  saveExcludedCategories,
} from './connection';
