const http = require('http');
const url = require('url');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 3000;
const DEFAULT_BASE = process.env.BASE_URL || `http://${HOST}:${PORT}`;

function baseOf(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `${HOST}:${PORT}`;
  return `${proto}://${host}`.replace(/\/$/, '');
}

function oembedData(reqUrl, maxwidth, maxheight, BASE) {
  let width = maxwidth && maxwidth > 0 ? Math.min(maxwidth, 640) : 640;
  let height = maxheight && maxheight > 0 ? Math.min(maxheight, 480) : 480;

  if (/\/photos\/[^/]+$/.test(reqUrl.split('?')[0])) {
    return {
      version: '1.0',
      type: 'photo',
      width,
      height,
      title: `Lumovy snapshot (${reqUrl})`,
      url: 'https://placehold.co/600x400/png',
      thumbnail_url: 'https://placehold.co/120x80/png',
      thumbnail_width: 120,
      thumbnail_height: 80,
      author_name: 'Lumovy User',
      author_url: BASE,
      provider_name: 'Lumovy',
      provider_url: BASE,
      cache_age: 86400
    };
  }

  if (/\/videos\/[^/]+$/.test(reqUrl.split('?')[0])) {
    return {
      version: '1.0',
      type: 'video',
      provider_name: 'Lumovy',
      provider_url: BASE,
      width,
      height,
      title: `Lumovy video (${reqUrl})`,
      author_name: 'Lumovy User',
      author_url: BASE,
      html:
        `<iframe width="${width}" height="${height}" src="${BASE}/play/${encodeURIComponent(reqUrl)}" ` +
        `frameborder="0" allowfullscreen></iframe>`
    };
  }

  if (/\/rich\/[^/]+$/.test(reqUrl.split('?')[0])) {
    return {
      version: '1.0',
      type: 'rich',
      provider_name: 'Lumovy',
      provider_url: BASE,
      width,
      height,
      title: `Lumovy rich widget (${reqUrl})`,
      author_name: 'Lumovy User',
      author_url: BASE,
      html: `<div style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;background:rebeccapurple;color:#fff;font-family:sans-serif;border-radius:8px;">Lumovy Widget</div>`
    };
  }

  return {
    version: '1.0',
    type: 'link',
    title: `Lumovy link (${reqUrl})`,
    author_name: 'Lumovy',
    author_url: BASE,
    provider_name: 'Lumovy',
    provider_url: BASE,
    cache_age: 86400
  };
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toXml(data) {
  const body = Object.keys(data)
    .map(k => `  <${k}>${xmlEscape(data[k])}</${k}>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<oembed>\n${body}\n</oembed>`;
}

function send(res, status, mime, body) {
  res.writeHead(status, {
    'Content-Type': mime,
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    send(res, 405, 'text/plain', 'Method not allowed');
    return;
  }

  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;
  const BASE = baseOf(req);

  if (path === '/' || path === '/index.html') {
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lumovy oEmbed Provider</title>
<link rel="alternate" type="application/json+oembed"
  href="${BASE}/oembed?url=${encodeURIComponent(BASE + '/videos/demo')}&format=json"
  title="Lumovy oEmbed Profile" />
<link rel="alternate" type="text/xml+oembed"
  href="${BASE}/oembed?url=${encodeURIComponent(BASE + '/videos/demo')}&format=xml"
  title="Lumovy oEmbed Profile" />
<style>
  body{font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a;line-height:1.6}
  code{background:#f2f2f2;padding:.1rem .3rem;border-radius:4px;font-size:.9em}
</style>
</head>
<body>
<h1>Lumovy oEmbed Provider</h1>
<p>This site implements the <a href="https://oembed.com">oEmbed</a> API. Point a consumer at
<code>${BASE}/oembed?url=...</code> to get embed data.</p>
<h2>Try it</h2>
<ul>
  <li><a href="/oembed?url=${encodeURIComponent(BASE + '/photos/sunset')}">/oembed (photo, JSON)</a></li>
  <li><a href="/oembed?url=${encodeURIComponent(BASE + '/videos/demo')}&format=json">/oembed (video, JSON)</a></li>
  <li><a href="/oembed?url=${encodeURIComponent(BASE + '/rich/widget')}">/oembed (rich, JSON)</a></li>
  <li><a href="/oembed?url=${encodeURIComponent(BASE + '/posts/hello')}">/oembed (link, JSON)</a></li>
  <li><a href="/oembed?url=${encodeURIComponent(BASE + '/photos/sunset')}&format=xml">/oembed (photo, XML)</a></li>
  <li><a href="/providers.json">/providers.json</a> (registry)</li>
</ul>
</body>
</html>`;
    send(res, 200, 'text/html; charset=utf-8', html);
    return;
  }

  if (path === '/providers.json') {
    const body = JSON.stringify(
      [{
        provider_name: 'Lumovy',
        provider_url: BASE,
        endpoints: [{ schemes: [`${BASE}/photos/*`], url: `${BASE}/oembed`, formats: ['json', 'xml'] }]
      }],
      null,
      2
    );
    send(res, 200, 'application/json', body);
    return;
  }

  if (path === '/oembed') {
    const target = parsed.query.url;
    if (!target || !/^https?:\/\//i.test(target)) {
      send(res, 404, 'application/json', JSON.stringify({ error: 'Missing or invalid "url" parameter' }));
      return;
    }

    const format = (parsed.query.format || 'json').toLowerCase();
    const maxwidth = parseInt(parsed.query.maxwidth, 10) || undefined;
    const maxheight = parseInt(parsed.query.maxheight, 10) || undefined;

    const data = oembedData(target, maxwidth, maxheight, BASE);

    if (format === 'xml') {
      send(res, 200, 'text/xml; charset=utf-8', toXml(data));
    } else if (format === 'json') {
      send(res, 200, 'application/json', JSON.stringify(data, null, 2));
    } else {
      send(res, 501, 'text/plain', 'Requested format not supported');
    }
    return;
  }

  if (path === '/play/' && parsed.pathname.length > '/play/'.length) {
    const title = decodeURIComponent(parsed.pathname.slice('/play/'.length));
    const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Play</title></head>
<body style="margin:0;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">
Playing: ${xmlEscape(title)}
</body>
</html>`;
    send(res, 200, 'text/html; charset=utf-8', html);
    return;
  }

  if (/^\/(photos|videos|rich|posts|link)\//.test(path)) {
    const selfUrl = `${BASE}${path}`;
    const label = {
      photos: 'Photo',
      videos: 'Video',
      rich: 'Widget',
      posts: 'Post',
      link: 'Link'
    }[path.match(/^\/(photos|videos|rich|posts|link)\//)[1]];
    const jsonEndpoint = `${BASE}/oembed?url=${encodeURIComponent(selfUrl)}&format=json`;
    const xmlEndpoint = `${BASE}/oembed?url=${encodeURIComponent(selfUrl)}&format=xml`;
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${label} | Lumovy</title>
<link rel="alternate" type="application/json+oembed" href="${jsonEndpoint}" title="Lumovy ${label} oEmbed Profile" />
<link rel="alternate" type="text/xml+oembed" href="${xmlEndpoint}" title="Lumovy ${label} oEmbed Profile" />
<meta name="theme-color" content="#663399">
</head>
<body>
<h1>${label}</h1>
<p>This page is oEmbed-enabled. Consumers can fetch embed data from
<a href="${jsonEndpoint}">${jsonEndpoint}</a></p>
</body>
</html>`;
    send(res, 200, 'text/html; charset=utf-8', html);
    return;
  }

  send(res, 404, 'text/plain', 'Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`Lumovy oEmbed provider running at ${DEFAULT_BASE}`);
});