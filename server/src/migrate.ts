import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from './db';

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);

// Apply any *.sql files in migrations/ that haven't run yet, in filename order.
// Each runs in a transaction and is recorded in _migrations.
export async function runMigrations(): Promise<void> {
  await sql`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from _migrations where name = ${file}
    `;
    if (count > 0) continue;

    const text = await readFile(path.join(migrationsDir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into _migrations (name) values (${file})`;
    });
    console.log(`migrated: ${file}`);
  }
}

// Allow running directly: `npm run migrate`
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => sql.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
