import { useEffect, useState } from 'react';
import { getList, type GroceryList as List } from './api';
import RecipeAdder from './components/RecipeAdder';
import GroceryList from './components/GroceryList';
import './App.css';

export default function App() {
  const [list, setList] = useState<List | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getList()
      .then(setList)
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main className="app">
      <header>
        <h1>🛒 Grocery Helper</h1>
      </header>

      {loadError && <p className="msg error">Can’t reach the API — {loadError}</p>}

      <RecipeAdder onAdded={setList} />
      <GroceryList list={list} onChanged={setList} />

      <footer>Phase 5 — recipe view, portion scaling, add-to-list merge.</footer>
    </main>
  );
}
