/**
 * thoughtdesk.org. The pages are the files in public/; this Worker runs in
 * front of them to send www.thoughtdesk.org to thoughtdesk.org, to answer
 * /download (the latest Windows installer) and /api/release (its version,
 * date and size), and to add security headers to every page.
 */

const REPO = 'kusule1351-hue/thought-desk';
const RELEASES = `https://github.com/${REPO}/releases/latest`;

interface Env {
  ASSETS: Fetcher;
}

/** The latest release's Windows installer. */
interface Release {
  version: string;
  date: string;
  url: string;
  size: number;
}

/** The site is static and loads nothing from elsewhere. */
const HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000',
};

/** Asks GitHub at most every 10 minutes, well under its 60 an hour. */
async function latest(ctx: ExecutionContext): Promise<Release | null> {
  const key = new Request('https://thoughtdesk.org/api/release');
  const cached = await caches.default.match(key);
  if (cached) return cached.json();
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'thoughtdesk.org' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    tag_name: string;
    published_at: string;
    assets: { name: string; browser_download_url: string; size: number }[];
  };
  const exe = data.assets.find((a) => a.name.endsWith('_x64-setup.exe'));
  if (!exe) return null;
  const release: Release = { version: data.tag_name.replace(/^v/, ''), date: data.published_at, url: exe.browser_download_url, size: exe.size };
  ctx.waitUntil(caches.default.put(key, Response.json(release, { headers: { 'Cache-Control': 'max-age=600' } })));
  return release;
}

function secure(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(HEADERS)) out.headers.set(name, value);
  // Cloudflare adds its analytics script to pages on the way out (free plans
  // have it on by default). no-transform stops that, at the cost of sending
  // pages uncompressed: the site promises no analytics.
  if (out.headers.get('Content-Type')?.startsWith('text/html')) {
    const cache = out.headers.get('Cache-Control');
    out.headers.set('Cache-Control', cache ? `${cache}, no-transform` : 'no-transform');
  }
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/download') {
      const release = await latest(ctx).catch(() => null);
      return Response.redirect(release?.url ?? RELEASES, 302);
    }
    if (url.pathname === '/api/release') {
      const release = await latest(ctx).catch(() => null);
      if (!release) return Response.json({ error: 'GitHub is unavailable' }, { status: 503 });
      return Response.json(release, { headers: { 'Cache-Control': 'public, max-age=600' } });
    }
    return secure(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
