import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sql } from './db';
import { env } from './env';
import { runMigrations } from './migrate';
import { recipeRoute } from './routes/recipe';
import { listRoute } from './routes/list';
import { settingsRoute } from './routes/settings';
import { priceRoute } from './routes/price';

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
  c.json({ service: 'grocery-helper-api', ok: true }),
);

// POST /recipe -> scrape + JSON-LD parse + heuristic parse + aisle classify (Ph 3-4)
app.route('/', recipeRoute);

// GET/POST/PATCH/DELETE /list[/items[/:id]] (Phase 5-6)
app.route('/', listRoute);

// GET /settings, PUT /settings/aisle-order — custom store layout (Phase 6)
app.route('/', settingsRoute);

// GET /price/pending, POST /price/ingest — cost estimation (Phase 7).
// Prices arrive from the Firefox extension running in the user's real session.
app.route('/', priceRoute);

// --- Routes to come ---
//   WS /ws -> live sync via LISTEN/NOTIFY  (Phase 8)

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
