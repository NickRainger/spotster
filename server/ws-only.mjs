/**
 * Game WebSocket-only process for hybrid deploy (Vercel UI + external WS host).
 *
 *   node --import tsx server/ws-only.mjs
 *
 * Env: PORT (default 3001), HOST
 * Set PUBLIC_WS_URL on Vercel to this service's wss:// URL.
 */
import http from 'node:http';
import { attachGameServer } from './index.ts';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((_req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.end('spotster-ws ok\n');
});

attachGameServer(server);

server.listen(PORT, HOST, () => {
	console.log(`Spotster WS-only on http://${HOST}:${PORT}  (path /ws)`);
});
