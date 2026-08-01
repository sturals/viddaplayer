const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3427;
const ROOT = __dirname;

// In-memory store for pending URLs per TV ID: { "tv_7524": "http://..." }
const pendingUrls = {};
// Active TVs registry: { "tv_7524": { id: "tv_7524", name: "ТВ 7524", lastSeen: timestamp } }
const activeTvs = {};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
};

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // CORS headers (allow phone to call API)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // ========== API ENDPOINTS ==========

    // Phone sends URL to a specific TV (or default)
    if (pathname === '/api/send' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (data.url) {
                    const targetTv = data.tv || 'default';
                    pendingUrls[targetTv] = data.url;
                    console.log(`📱 Ссылка для [${targetTv}]: ${data.url.substring(0, 70)}...`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true, tv: targetTv }));
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing url field' }));
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // TV polls for new URL
    if (pathname === '/api/poll' && req.method === 'GET') {
        const tvId = parsed.query.tv || 'default';
        const name = parsed.query.name || ('ТВ ' + tvId.replace('tv_', ''));

        // Register/Heartbeat active TV
        activeTvs[tvId] = { id: tvId, name: name, lastSeen: Date.now() };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (pendingUrls[tvId]) {
            const urlToSend = pendingUrls[tvId];
            delete pendingUrls[tvId]; // Clear after sending
            console.log(`📺 Отправлена ссылка на [${tvId}]: ${urlToSend.substring(0, 70)}...`);
            res.end(JSON.stringify({ url: urlToSend }));
        } else {
            res.end(JSON.stringify({ url: null }));
        }
        return;
    }

    // Get list of active TVs for phone remote
    if (pathname === '/api/tvs' && req.method === 'GET') {
        const now = Date.now();
        // Return active TVs seen in the last 15 seconds
        const list = Object.values(activeTvs).filter(tv => now - tv.lastSeen < 15000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tvs: list }));
        return;
    }

    // Health check
    if (pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', activeTvs: Object.keys(activeTvs).length }));
        return;
    }

    // ========== STATIC FILE SERVER ==========
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = filePath.split('?')[0];
    const fullPath = path.join(ROOT, filePath);

    if (!fullPath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(fullPath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>404 — Файл не найден</h1>');
            return;
        }

        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(fullPath).pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const nets = require('os').networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIP = net.address;
                break;
            }
        }
    }

    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║         📺 VIDAA TV Player Server           ║');
    console.log('  ╠══════════════════════════════════════════════╣');
    console.log(`  ║  Локально:  http://localhost:${PORT}/          ║`);
    console.log(`  ║  Сеть:      http://${localIP}:${PORT}/   ║`);
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('  Сервер готов к работе с несколькими телевизорами!');
    console.log('');
});
        sources.forEach(s => notifyStream(s.src));
        return origPlay.apply(this, arguments);
    };
    document.addEventListener('play', function(e) {
        if (e.target && e.target.src) notifyStream(e.target.src);
    }, true);

    const origFetch = window.fetch;
    if (origFetch) {
        window.fetch = function() {
            const urlArg = arguments[0];
            if (typeof urlArg === 'string' && (urlArg.includes('.m3u8') || urlArg.includes('.mp4'))) {
                notifyStream(urlArg);
            }
            return origFetch.apply(this, arguments);
        };
    }
})();
</script>`;
                    body = body.replace(/<head[^>]*>/i, match => match + snifferScript);
                    clientRes.end(body);
                });
            } else {
                clientRes.writeHead(res.statusCode || 200, headers);
                res.pipe(clientRes);
            }
        });

        req.on('error', (err) => {
            clientRes.writeHead(500);
            clientRes.end('Proxy error: ' + err.message);
        });
        req.end();
    } catch (e) {
        clientRes.writeHead(500);
        clientRes.end('Proxy exception: ' + e.message);
    }
}
