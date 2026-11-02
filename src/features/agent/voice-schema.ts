import { z } from 'zod';
import { readVoiceLang, type VoiceMeta } from './voice-domain';

/** Server-side checks for voice (WI-104; apart from `voice-domain.ts` since WI-123). */
export const voiceInput: z.ZodType<VoiceMeta> = z
  .object({ via: z.literal('voice'), edited: z.boolean() })
  .strict();
/** The settings form: consent, the language, and whether replies are read aloud. */
export const voiceSettingsInput = z.object({
  consent: z.boolean(),
  lang: z.string().transform(readVoiceLang),
  speakReplies: z.boolean(),
});
