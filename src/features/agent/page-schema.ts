import { z } from 'zod';

/** A path only: no query, no host, short. */
export const pageInput = z
  .string()
  .max(200)
  .regex(/^\/[A-Za-z0-9/_-]*$/)
  .nullable()
  .optional();
