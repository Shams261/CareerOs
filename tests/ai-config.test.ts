import { afterEach, describe, expect, it } from 'vitest';
import { aiConfig, configProblems } from '../src/lib/env';

const baseEnv = {
  DATABASE_URL: 'postgresql://u:p@db.example.com:5432/careeros',
  OWNER_EMAIL: 'owner@example.com',
  CRON_SECRET: 'c'.repeat(40),
  APP_BASE_URL: 'https://careeros.example.com',
  GOOGLE_CLIENT_ID: 'client',
  GOOGLE_CLIENT_SECRET: 'super-secret-value',
  AUTH_SECRET: Buffer.alloc(32, 1).toString('base64'),
  NODE_ENV: 'production',
};
const key = `sk-or-v1-${'b'.repeat(48)}`;
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('Grill Me configuration (WI-031)', () => {
  it('is off without a key and when switched off', () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(aiConfig()).toBeNull();
    process.env.OPENROUTER_API_KEY = key;
    process.env.STUDY_AI_ENABLED = 'false';
    expect(aiConfig()).toBeNull();
  });
  it('uses OpenRouter, allowing only a loopback override', () => {
    process.env.OPENROUTER_API_KEY = key;
    delete process.env.STUDY_AI_ENABLED;
    delete process.env.OPENROUTER_API_URL;
    expect(aiConfig()).toEqual({
      apiKey: key,
      baseUrl: 'https://openrouter.ai/api/v1',
    });
    process.env.OPENROUTER_API_URL = 'http://127.0.0.1:4466/api/v1/';
    expect(aiConfig()?.baseUrl).toBe('http://127.0.0.1:4466/api/v1');
  });
  it('reports a bad key or a remote override by name, never the value', () => {
    expect(configProblems({ ...baseEnv, OPENROUTER_API_KEY: key })).toEqual([]);
    const bad = configProblems({
      ...baseEnv,
      OPENROUTER_API_KEY: 'not-a-key-value',
    }).join('\n');
    expect(bad).toMatch(/OPENROUTER_API_KEY/);
    expect(bad).not.toMatch(/not-a-key-value/);
    expect(
      configProblems({
        ...baseEnv,
        OPENROUTER_API_KEY: key,
        OPENROUTER_API_URL: 'https://evil.example.com/api/v1',
      }).join(),
    ).toMatch(/OPENROUTER_API_URL/);
  });
});
