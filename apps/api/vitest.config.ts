import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://ssma:ssma_dev@localhost:5432/ssma_test?schema=public',
      ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      APP_ORIGIN: 'http://localhost:5173',
      STORAGE_DIR: './storage-test',
      LOGIN_RATE_LIMIT: '1000',
    },
  },
});
