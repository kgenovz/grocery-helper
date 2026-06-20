import { useState } from 'react';
import { clearList, type GroceryList as List, type ListItem } from '../api';
import { formatQty, formatPrice, priceAge } from '../format';

type Props = {
  list: List | null;
  aisleOrder: string[];
  onToggle: (id: number, checked: boolean) => void;
  onDelete: (id: number) => void;
  onChanged: (list: List) => void;
};

function groupByAisle(items: ListItem[], order: string[]): [string, ListItem[]][] {
  const buckets = new Map<string, ListItem[]>();
  for (const item of items) {
    const aisle = item.aisle && order.includes(item.aisle) ? item.aisle : 'Other';
    const arr = buckets.get(aisle) ?? [];
    arr.push(item);
    buckets.set(aisle, arr);
  }
  const ordered = order.includes('Other') ? order : [...order, 'Other'];
  return ordered.filter((a) => buckets.has(a)).map((a) => [a, buckets.get(a)!]);
}

export default function GroceryList({
  list,
  aisleOrder,
  onToggle,
  onDelete,
  onChanged,
}: Props) {
  const [clearing, setClearing] = useState(false);

  const items = list?.items ?? [];
  const groups = groupByAisle(items, aisleOrder);
  const remaining = items.filter((i) => !i.checked).length;

  const priced = items.filter((i) => i.estPrice !== null);
  const total = priced.reduce((sum, i) => sum + (i.estPrice ?? 0), 0);

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
        <span className="count">
          {remaining} left · {items.length} total
        </span>
        {items.length > 0 && (
          <button className="ghost" onClick={onClear} disabled={clearing}>
            Clear
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="total">
          <strong>~{formatPrice(total)}</strong>
          <span className="muted">
            {' '}
            estimate · {priced.length}/{items.length} priced
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="muted empty">Add a recipe to start your list.</p>
      ) : (
        groups.map(([aisle, group]) => (
          <div className="aisle-group" key={aisle}>
            <h3 className={`aisle-head a-${aisle}`}>{aisle}</h3>
            <ul>
              {group.map((it) => {
                const age = priceAge(it.pricedAt);
                return (
                  <li key={it.id} className={it.checked ? 'item checked' : 'item'}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={it.checked}
                        onChange={(e) => onToggle(it.id, e.target.checked)}
                      />
                      <span className="qty">
                        {it.qty === null ? '' : `${formatQty(it.qty)} `}
                        {it.unit ?? ''}
                      </span>
                      <span className="name">
                        {it.item}
                        {age && (
                          <em className={`age ${age.stale ? 'stale' : ''}`}> · {age.label}</em>
                        )}
                      </span>
                      <span className="price">
                        {it.onSale && <span className="sale">SALE</span>}
                        {it.estPrice !== null ? (
                          formatPrice(it.estPrice)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </span>
                    </label>
                    <button
                      className="remove"
                      aria-label={`Remove ${it.item}`}
                      onClick={() => onDelete(it.id)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
