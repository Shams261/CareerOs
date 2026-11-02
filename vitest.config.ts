import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Notification processing scans all owners; database suites must not interleave clocks.
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    // WI-139: measured in CI (`--coverage`) as a report, never a threshold.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/generated/**'],
      reporter: ['text-summary'],
    },
  },
});
