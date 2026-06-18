import { useState } from 'react';
import { clearList, type GroceryList as List, type ListItem } from '../api';
import { AISLE_ORDER, formatQty } from '../format';

type Props = { list: List | null; onChanged: (list: List) => void };

function groupByAisle(items: ListItem[]): [string, ListItem[]][] {
  const buckets = new Map<string, ListItem[]>();
  for (const item of items) {
    const aisle = item.aisle && AISLE_ORDER.includes(item.aisle as never)
      ? item.aisle
      : 'Other';
    const arr = buckets.get(aisle) ?? [];
    arr.push(item);
    buckets.set(aisle, arr);
  }
  return AISLE_ORDER.filter((a) => buckets.has(a)).map((a) => [a, buckets.get(a)!]);
}

export default function GroceryList({ list, onChanged }: Props) {
  const [clearing, setClearing] = useState(false);

  const items = list?.items ?? [];
  const groups = groupByAisle(items);

  async function onClear() {
    if (!confirm('Clear the whole list?')) return;
    setClearing(true);
    try {
      onChanged(await clearList());
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="card list">
      <div className="list-head">
        <h2>Grocery list</h2>
        <span className="count">{items.length} items</span>
        {items.length > 0 && (
          <button className="ghost" onClick={onClear} disabled={clearing}>
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="muted empty">Add a recipe to start your list.</p>
      ) : (
        groups.map(([aisle, group]) => (
          <div className="aisle-group" key={aisle}>
            <h3 className={`aisle-head a-${aisle}`}>{aisle}</h3>
            <ul>
              {group.map((it) => (
                <li key={it.id}>
                  <span className="qty">
                    {it.qty === null ? '' : `${formatQty(it.qty)} `}
                    {it.unit ?? ''}
                  </span>
                  <span className="name">{it.item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
