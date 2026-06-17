import { useEffect, useState } from 'react';
import './App.css';

type Health = { status: string; db: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  const ok = health?.db === 'up';

  return (
    <main className="app">
      <header>
        <h1>🛒 Grocery Helper</h1>
        <p className="tagline">
          Recipe URL → aisle-sorted list with a cost estimate.
        </p>
      </header>

      <section className="card">
        <h2>API status</h2>
        {error && <p className="status down">Cannot reach API — {error}</p>}
        {!error && !health && <p className="status">Checking…</p>}
        {health && (
          <p className={`status ${ok ? 'up' : 'down'}`}>
            <span className="dot" /> service: {health.status} · db: {health.db}
          </p>
        )}
      </section>

      <footer>Phase 1 scaffold — roadmap in recipe-grocery-pwa-plan.md</footer>
    </main>
  );
}
