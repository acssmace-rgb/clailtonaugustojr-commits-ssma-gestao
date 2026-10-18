import { buildApp } from './app.js';
import { config } from './lib/config.js';
import { serveWeb } from './web.js';

const app = await buildApp();
await serveWeb(app);
await app.listen({ port: config.PORT, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
