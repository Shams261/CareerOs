import { describe, expect, it } from 'vitest';
import { isTestNamed } from '../src/lib/test-data';

describe('test-named records', () => {
  it('catches the way test data is written', () => {
    for (const name of [
      'TEST routine',
      'TEST Company',
      'Example Labs (demo)',
      '[test] block',
      'UAT check',
      'uat notes',
      'test',
      'Test 2',
      'DUMMY interview',
      'SAMPLE note',
    ])
      expect(isTestNamed(name), name).toBe(true);
  });
  it('leaves study material and ordinary words alone', () => {
    for (const name of [
      'Bug squash: run the failing test first',
      'Unit testing in Node',
      'Design a load test for an API',
      'Demo day prep for Acme',
      'Northwind Labs',
      'Two pointers practice',
      'Sample size and statistics',
    ])
      expect(isTestNamed(name), name).toBe(false);
  });
  it('checks every name given and ignores empty values', () => {
    expect(isTestNamed(null, undefined, '')).toBe(false);
    expect(isTestNamed('Acme', 'TEST role')).toBe(true);
  });
});
