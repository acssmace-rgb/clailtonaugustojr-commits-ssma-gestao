/** Gera docs/openapi.json a partir das rotas registradas. */
import { writeFile } from 'node:fs/promises';
import { buildApp } from '../app.js';

const app = await buildApp();
await app.ready();
await writeFile(new URL('../../../../docs/openapi.json', import.meta.url), JSON.stringify(app.swagger(), null, 2));
console.log('docs/openapi.json gerado');
await app.close();
