import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sql } from './db';
import { env } from './env';
import { runMigrations } from './migrate';

const app = new Hono();

app.use('*', cors());

// Liveness + DB connectivity. Pointed at by n8n Watchdog in prod (plan: ops).
app.get('/health', async (c) => {
  try {
    await sql`select 1`;
    return c.json({ status: 'ok', db: 'up' });
  } catch {
    return c.json({ status: 'degraded', db: 'down' }, 503);
  }
});

app.get('/', (c) =>
  c.json({ service: 'grocery-helper-api', phase: 1, ok: true }),
);

// --- Routes to come ---
//   POST /recipe  -> scrape + parse + aisle classify   (Phase 3-4)
//   GET/POST /list, /list/items                          (Phase 5-6)
//   POST /price   -> PC Express match + price            (Phase 7)
//   WS  /ws       -> live sync via LISTEN/NOTIFY         (Phase 8)

async function main() {
  await runMigrations();
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(`grocery-helper api listening on :${info.port}`);
  });
}

main().catch((err) => {
  console.error('fatal startup error:', err);
  process.exit(1);
});
