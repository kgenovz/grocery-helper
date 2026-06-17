# Recipe → Grocery List PWA — Build Plan

A standalone Progressive Web App for **two users** (me + my wife) that turns a recipe URL into a portion-scalable, aisle-sorted grocery list **with an estimated total cost**, plus **real-time shared sync** for use in-store. No app store, no ads, no paywalls, no meal-planning bloat.

**The problem it replaces:** the current manual chain takes ~1–1.5 hrs — paste recipes into an AI chatbot, get them sorted by aisle, then go to the Superstore website and price every item to budget the trip. This app collapses that into: share a URL → aisle-sorted list with a running cost estimate → done.

## Principles
- **Frictionless add is the #1 priority.** If adding a recipe takes more than two taps, it won't get used.
- Two trusted users only. No multi-tenancy, no scale concerns, keep auth minimal.
- Lean. Cut any feature that adds a subsystem without earning its keep.

## How recipes get in (resolved: both phones are Android)
Both devices are Android (Samsung S22+ on Chrome/Samsung Internet, Pixel 9 on Chrome), so the **Web Share Target API** is the primary flow with no caveats. The installed PWA registers as a share target, so from any browser or social app you hit Share → the app → the recipe is in. No copy, no paste, no opening the app first. This is *the* adoption feature — build it properly.
- Keep a **paste field with clipboard auto-detect** as a secondary path (e.g. for the odd app that doesn't expose a share intent), but it's a fallback, not the main flow.
- iOS is not a concern — no Safari/share-target workarounds needed.

## Stack (self-hosted on Contabo)
- **Frontend:** React + Vite, built as an installable PWA. Service worker (Workbox) caches the app shell + last-known list. Served as static files by Caddy.
- **Backend service:** one small Node service (Hono or Fastify) in a Docker container. Handles everything server-side: scrape/parse/classify, PC Express pricing, the REST API for the list, and live sync. The Anthropic + PC Express calls live here so no keys touch the client.
- **Database:** Postgres in a Docker container. Plain Postgres — *not* the full Supabase stack (that's 8–10 containers and unnecessary ops for two users).
- **Realtime:** Postgres `LISTEN/NOTIFY` → a websocket from the Node service. A `list_items` change fires NOTIFY; the service pushes it to the other connected phone. (Fallback if you want it even simpler: poll every ~3–5s. It's a grocery list.)
- **Auth:** minimal — one shared household with a signed token per device, or a basic magic link issued by the service. No third-party auth.
- **LLM:** Anthropic API (Haiku, `claude-haiku-4-5`) from the Node service.
- **Hosting:** all on the existing Contabo box (currently only running n8n, has headroom), behind Caddy with automatic TLS. Docker Compose: `caddy`, `app` (Node), `db` (Postgres).

## Features
1. **Add recipe** via Web Share Target (primary), with paste + clipboard auto-detect as a secondary path.
2. **Scrape** the URL: extract `recipeIngredient` from the page's schema.org JSON-LD. Fall back to a Haiku extraction pass if no structured data is present.
3. **Parse ingredients** into structured rows: `{ qty, unit, item, prep }`. Handle fractions, unicode (½), ranges (3–4), and non-numeric ("to taste" → qty null).
4. **Portion scaling:** a client-side multiplier on the recipe. Scales numeric qtys only; leaves "to taste" untouched. Display as fractions or decimals (pick one, keep consistent).
5. **Aisle classification:** Haiku tags each ingredient with an aisle (Produce, Dairy, Meat, Pantry, Frozen, Spices, Bakery, Other). **Cache every ingredient→aisle mapping in Postgres** — check cache before calling Haiku so repeats are instant and free.
6. **Grocery list:** items grouped by aisle, with check-off. Adding a recipe merges its ingredients into the active list (combine duplicates: two recipes with onions = one line).
7. **Custom aisle order:** a reorderable settings list so the grouping matches the layout of *our* store. (This is the thing the off-the-shelf apps don't do well.)
8. **Real-time shared sync:** both users see the same list live via the service's websocket (Postgres `LISTEN/NOTIFY`). Check off milk → it updates on the other phone within ~1s.
9. **Cost estimate (the big time-saver):** each list item is auto-matched to a real Superstore product and priced, producing a running total so we know the budget before leaving. Auto-pick is zero-effort (see Cost estimation below); override is optional, not required.

## Data model
```
recipes
  id, title, source_url, base_servings, created_by, created_at

recipe_ingredients
  id, recipe_id, qty, unit, item, prep, aisle

lists                      -- one shared "household" list is enough
  id, name, created_at

list_items                 -- the realtime table
  id, list_id, item, qty, unit, aisle, checked, added_by, recipe_id,
  matched_sku, est_price, on_sale, updated_at

ingredient_aisle_cache     -- normalized ingredient name -> aisle
  norm_name (pk), aisle

product_match_cache        -- normalized ingredient name -> chosen Superstore product
  norm_name (pk), sku, product_name, package_size, last_price, last_unit_price,
  on_sale, was_price, last_priced_at

price_history              -- every price we ever capture (append-only, tiny)
  id, sku, price, unit_price, on_sale, was_price, captured_at
```
- Portion scaling = client multiplies `recipe_ingredients.qty` before merging into `list_items`.
- Grocery view = `list_items` grouped by `aisle`, ordered by the user's custom aisle order.
- Running total = sum of `est_price` across `list_items` (with a clear "estimate" label).

## Scrape / parse / classify (service route)
`POST /recipe` takes a URL, returns structured ingredients:
1. Fetch the page HTML server-side (avoids browser CORS).
2. Find `<script type="application/ld+json">`, locate the `Recipe` object, pull `recipeIngredient[]` and `recipeYield` (for base servings).
3. If no JSON-LD Recipe found → send the page text to Haiku: "extract the ingredient list."
4. Send the raw ingredient strings to Haiku once for structured parse **+ aisle tag**, returning strict JSON (`[{qty, unit, item, prep, aisle}]`). Prompt it to return JSON only, no prose; strip code fences before parsing.
5. Before tagging, check `ingredient_aisle_cache`; only ask Haiku about uncached items. Write new mappings back.
6. Return the structured array to the client.

## Cost estimation (PC Express / Superstore)
No official Loblaw API exists. Prices come from the **PC Express** product-search endpoint (the JSON call the shop website makes — inspect it via browser devtools; it uses a subscription-key header). Set the store to our Real Canadian Superstore (by store ID / postal code) so pricing is local. Unofficial and against ToS; fine for personal use, can break.

A pricing route (`POST /price`, or a step folded into `/recipe`) prices the list:
1. For each ingredient, check `product_match_cache` first. Cached → use it, instant and free.
2. Uncached → search PC Express for the ingredient name. Filter the results to relevant matches (the search returns noise — "flour" can return tortillas).
3. **Auto-pick the medium-priced common item**: take the median price across the top relevant matches (skip the rock-bottom tiny package and the premium/organic outlier). No tapping required — this is the whole point, since per-item picking is exactly the manual work we're killing.
4. **Surface deals**: PC Express results include `on_sale` / was-prices / PC Optimum offers. If the picked item (or a close relevant match) is on sale, store `on_sale` + `was_price` and badge it in the UI — informational only; the in-store judgement call stays with us.
5. Write the pick to `product_match_cache` and set `est_price` on the list item. For by-weight items ("2 lb apples"), price via `unit_price` × qty.
6. **Override is optional**: tapping an item opens the other matches so a pick can be corrected once; the new choice overwrites the cache. Never required to get a total.

Show the sum as an **estimate**, clearly labelled — online prices can differ from in-store, and sales/flyer deals vary. Goal is budgeting ("what are we walking into"), not exact receipts. The estimate sharpens every shop as the match cache fills in.

## Data retention, freshness & resilience
We eat largely the same things year-round (family of 5), so the match cache converges to a stable set fast — and we want to keep enough history that a price stays "close enough" even if PC Express breaks. Store generously; the footprint is tiny (a few hundred distinct SKUs × periodic snapshots = low thousands of rows — nothing for Postgres on the Contabo disk).

- **Append-only `price_history`:** never overwrite a price — log a new row each time we fetch one. `product_match_cache.last_price` is just the latest convenience copy.
- **Freshness rule:** treat a cached price as good for ~10–14 days. When a list is priced and the API is up, refresh any item older than that in the background; otherwise reuse the cached price. This is what keeps us from hammering PC Express for staples we already know.
- **Show price age:** display "priced 3 days ago" (or grey it out past ~3 weeks) so we know how much to trust the total.
- **Fallback chain when the API is down or a match fails:**
  1. Recent cached price (within freshness window) → use as-is.
  2. Stale cached price → use it, flagged as stale.
  3. No cache → median of that SKU's `price_history`.
  4. Nothing at all → leave unpriced, exclude from total, flag for manual entry.
- The list / aisle / sync core never depends on pricing — a price outage just means staler estimates, not a broken app.

## Auth & sharing
- Minimal, self-rolled. Two devices share one household; the service issues a signed token per device (or a basic magic link). No third-party auth provider.
- One shared `list`; both devices are members. Authorization is just "is this a valid household token" — trivial at two users, don't overthink it.
- `added_by` / check-off attribution is for nicety, not access control.

## Offline behavior (decent signal assumed, so keep it light)
- Service worker caches the shell and the current list so a signal blip never shows a blank screen.
- Optimistic UI on check-off / add; queue writes and reconcile on reconnect.
- Conflict resolution = last-write-wins per item. No CRDTs.

## Build phases (suggested order for Claude Code)
1. Docker Compose scaffold on Contabo: `caddy`, `app` (Node/Hono), `db` (Postgres). Caddy TLS for a new subdomain.
2. Postgres schema + migrations; minimal household-token auth; create the shared list.
3. Node service `POST /recipe`: scrape + JSON-LD parse (URL in → structured ingredients out), no LLM yet.
4. Add Haiku parse + aisle classify + the `ingredient_aisle_cache` table.
5. React PWA: recipe view with portion scaling; "add to list" merge logic; REST wiring to the service.
6. Grocery list UI grouped by aisle with check-off; custom aisle order.
7. Cost estimation: PC Express price lookup + auto medium-priced match + `product_match_cache` + `price_history` + freshness/refresh rule + fallback chain + running total + deal badges.
8. Live sync: Postgres `LISTEN/NOTIFY` → websocket in the service → client subscription.
9. PWA manifest + service worker + install prompt.
10. Web Share Target (primary add flow) + paste/clipboard fallback.

## Deployment & ops (fits the existing setup)
- All three containers in one Docker Compose alongside n8n on Contabo; Caddy already there pattern-matches your other sites.
- **Backups:** add the Postgres volume (a nightly `pg_dump`) to your existing restic backups — the price history is worth keeping.
- **Monitoring:** expose a `/health` endpoint on the service and point the n8n Watchdog at it, so an outage shows up on the same dashboard as everything else.
- Anthropic + PC Express keys/headers live in the service's env (Compose secrets / `.env`), never in the client bundle.

## Explicit non-goals (don't build these)
- No in-app recipe search engine — paste/share a URL instead.
- No native app, no app store, no Expo.
- No meal planning, pantry tracking, calorie counting.
- No multi-household / public sharing / scaling concerns.
- No offline-first CRDT machinery.
