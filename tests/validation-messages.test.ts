import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fieldLabel, issueMessages } from '../src/lib/validation';

describe('fieldLabel', () => {
  it('turns schema keys into words', () => {
    expect(fieldLabel(['confidenceAfter'])).toBe('Confidence after');
    expect(fieldLabel(['nextActionDate'])).toBe('Next action date');
    expect(fieldLabel(['contacts', 0, 'email'])).toBe('Contacts email');
    expect(fieldLabel([])).toBe('');
  });
});

describe('issueMessages', () => {
  it('names the field in words instead of the raw key', () => {
    const result = z
      .object({ confidenceAfter: z.enum(['RED', 'YELLOW', 'GREEN']) })
      .safeParse({ confidenceAfter: 'BLUE' });
    expect(result.success).toBe(false);
    const text = issueMessages(result.error!.issues);
    expect(text).toMatch(/^Confidence after: /);
    expect(text).not.toContain('confidenceAfter');
  });
  it('keeps a message that already names its subject', () => {
    const issues: z.core.$ZodIssue[] = [
      {
        code: 'custom',
        path: ['confidenceAfter'],
        message: 'Confidence after must be Yellow when solved with help.',
        input: 'RED',
      },
    ];
    expect(issueMessages(issues)).toBe(
      'Confidence after must be Yellow when solved with help.',
    );
  });
  it('joins and de-duplicates several issues', () => {
    const result = z
      .object({ title: z.string().min(1), startTime: z.string().min(1) })
      .safeParse({ title: '', startTime: '' });
    const text = issueMessages(result.error!.issues);
    expect(text.split('; ')).toHaveLength(2);
    expect(text).toContain('Title: ');
    expect(text).toContain('Start time: ');
  });
  it('uses the bare message for root-level issues', () => {
    const issues: z.core.$ZodIssue[] = [
      { code: 'custom', path: [], message: 'End must follow start.', input: 1 },
    ];
    expect(issueMessages(issues)).toBe('End must follow start.');
  });
});
