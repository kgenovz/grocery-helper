// Fetch a page's HTML server-side (avoids browser CORS; keeps scraping off the client).

const USER_AGENT =
  'Mozilla/5.0 (compatible; GroceryHelper/0.1; +https://github.com/kgenovz/grocery-helper)';

// Block obviously-internal targets so a pasted URL can't make the service
// hit localhost or the box's private network (e.g. the n8n container). Basic
// SSRF hygiene — fine for two trusted users; not a full allowlist.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // link-local
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true; // IPv6 loopback / ULA
  return false;
}

export async function fetchHtml(url: string, timeoutMs = 12_000): Promise<string> {
  const { hostname } = new URL(url);
  if (isBlockedHost(hostname)) {
    throw new Error('refusing to fetch an internal/private address');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`upstream responded ${res.status}`);
    return await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`fetch timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
