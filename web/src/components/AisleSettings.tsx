import { useState } from 'react';

type Props = {
  order: string[];
  onReorder: (next: string[]) => void;
};

// Reorder the aisles to match our store's walking order. Up/down buttons —
// robust on touch, no drag-and-drop library.
export default function AisleSettings({ order, onReorder }: Props) {
  const [open, setOpen] = useState(false);

  function move(index: number, delta: number) {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  }

  return (
    <section className="card settings">
      <button className="settings-toggle" onClick={() => setOpen((o) => !o)}>
        <span>Store layout (aisle order)</span>
        <span className="chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <ol className="aisle-order">
          {order.map((aisle, i) => (
            <li key={aisle}>
              <span className={`dot a-${aisle}`} />
              <span className="aisle-name">{aisle}</span>
              <span className="moves">
                <button
                  aria-label={`Move ${aisle} up`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${aisle} down`}
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
