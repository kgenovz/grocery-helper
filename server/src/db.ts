import postgres from 'postgres';
import { env } from './env';

// Single shared connection pool. postgres.js handles a reserved connection
// for LISTEN/NOTIFY later (Phase 8) via sql.listen().
export const sql = postgres(env.DATABASE_URL, {
  onnotice: () => {}, // silence NOTICE noise on boot
});
