import { useState } from 'react';
import { fetchRecipe, addToList, type GroceryList, type Recipe } from '../api';
import { formatQty, scaleQty } from '../format';

type Props = { onAdded: (list: GroceryList) => void };

export default function RecipeAdder({ onAdded }: Props) {
  const [url, setUrl] = useState('');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // scaling
  const base = recipe?.baseServings ?? null;
  const [servings, setServings] = useState(1);
  const [mult, setMult] = useState(1);
  const factor = base ? servings / base : mult;

  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  async function onFetch(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setAdded(null);
    setRecipe(null);
    try {
      const r = await fetchRecipe(url.trim());
      setRecipe(r);
      setServings(r.baseServings ?? 1);
      setMult(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onAdd() {
    if (!recipe) return;
    setAdding(true);
    setError(null);
    try {
      const list = await addToList(
        recipe.ingredients.map((i) => ({
          item: i.item,
          qty: scaleQty(i.qty, factor),
          unit: i.unit,
          aisle: i.aisle,
        })),
      );
      onAdded(list);
      setAdded(`Added ${recipe.ingredients.length} ingredients to the list`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="card">
      <form className="url-form" onSubmit={onFetch}>
        <input
          type="url"
          inputMode="url"
          placeholder="Paste a recipe URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Recipe URL"
        />
        <button type="submit" disabled={loading || !url.trim()}>
          {loading ? '…' : 'Get'}
        </button>
      </form>

      {error && <p className="msg error">{error}</p>}

      {recipe && (
        <div className="recipe">
          <h2>{recipe.title ?? 'Recipe'}</h2>

          <div className="scale">
            {base ? (
              <label className="stepper">
                <span>Servings</span>
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  aria-label="Fewer servings"
                >
                  −
                </button>
                <strong>{servings}</strong>
                <button
                  type="button"
                  onClick={() => setServings((s) => s + 1)}
                  aria-label="More servings"
                >
                  +
                </button>
                <span className="muted">(recipe makes {base})</span>
              </label>
            ) : (
              <div className="mult">
                <span>Scale</span>
                {[0.5, 1, 1.5, 2, 3].map((m) => (
                  <button
                    type="button"
                    key={m}
                    className={mult === m ? 'active' : ''}
                    onClick={() => setMult(m)}
                  >
                    ×{m}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul className="ingredients">
            {recipe.ingredients.map((i, idx) => (
              <li key={idx}>
                <span className="qty">
                  {i.qty === null ? '' : `${formatQty(scaleQty(i.qty, factor))} `}
                  {i.unit ?? ''}
                </span>
                <span className="name">
                  {i.item}
                  {i.qty === null && <em className="muted"> · to taste</em>}
                  {i.prep && <em className="muted"> · {i.prep}</em>}
                </span>
                {i.aisle && <span className={`aisle a-${i.aisle}`}>{i.aisle}</span>}
              </li>
            ))}
          </ul>

          <button className="add" onClick={onAdd} disabled={adding}>
            {adding ? 'Adding…' : 'Add to list'}
          </button>
          {added && <p className="msg ok">{added}</p>}
        </div>
      )}
    </section>
  );
}
