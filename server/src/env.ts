// Centralized env access with dev-friendly defaults.

function get(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const env = {
  PORT: Number(get('PORT', '8080')),
  DATABASE_URL: get(
    'DATABASE_URL',
    'postgres://grocery:grocery@localhost:5432/grocery',
  ),
  HOUSEHOLD_TOKEN: get('HOUSEHOLD_TOKEN', 'changeme'),
  ANTHROPIC_API_KEY: get('ANTHROPIC_API_KEY', ''),
};
