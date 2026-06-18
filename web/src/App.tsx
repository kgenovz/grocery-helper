import { useEffect, useState } from 'react';
import {
  getList,
  getSettings,
  toggleItem,
  deleteItem,
  saveAisleOrder,
  type GroceryList as List,
} from './api';
import { AISLE_ORDER } from './format';
import RecipeAdder from './components/RecipeAdder';
import GroceryList from './components/GroceryList';
import AisleSettings from './components/AisleSettings';
import './App.css';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [list, setList] = useState<List | null>(null);
  const [aisleOrder, setAisleOrder] = useState<string[]>([...AISLE_ORDER]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getList()
      .then(setList)
      .catch((e) => setLoadError(msg(e)));
    getSettings()
      .then((s) => setAisleOrder(s.aisleOrder))
      .catch(() => undefined);
  }, []);

  const refresh = () => getList().then(setList).catch(() => undefined);

  // Optimistic check-off — instant in-store; reconcile from server on failure.
  function toggle(id: number, checked: boolean) {
    setList((prev) =>
      prev
        ? { ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, checked } : i)) }
        : prev,
    );
    toggleItem(id, checked).catch(refresh);
  }

  function removeItem(id: number) {
    setList((prev) =>
      prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev,
    );
    deleteItem(id).catch(refresh);
  }

  function reorder(next: string[]) {
    setAisleOrder(next);
    saveAisleOrder(next)
      .then((s) => setAisleOrder(s.aisleOrder))
      .catch(refresh);
  }

  return (
    <main className="app">
      <header>
        <h1>🛒 Grocery Helper</h1>
      </header>

      {loadError && <p className="msg error">Can’t reach the API — {loadError}</p>}

      <RecipeAdder onAdded={setList} />
      <AisleSettings order={aisleOrder} onReorder={reorder} />
      <GroceryList
        list={list}
        aisleOrder={aisleOrder}
        onToggle={toggle}
        onDelete={removeItem}
        onChanged={setList}
      />

      <footer>Phase 6 — in-store check-off & custom aisle order.</footer>
    </main>
  );
}
