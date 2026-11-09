/**
 * Production Node server: SvelteKit handler + Spotster game WebSocket on /ws.
 * Use with `@sveltejs/adapter-node` build (DEPLOY_TARGET=node, default).
 *
 *   npm run build
 *   node server/standalone.mjs
 *
 * Env: PORT (default 3000), HOST (default 0.0.0.0)
 */
import http from 'node:http';
import { attachGameServer } from './index.ts';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const { handler } = await import('../build/handler.js');

const server = http.createServer((req, res) => {
	handler(req, res, () => {
		res.statusCode = 404;
		res.end('Not found');
	});
});

attachGameServer(server);

server.listen(PORT, HOST, () => {
	console.log(`Spotster listening on http://${HOST}:${PORT}`);
	console.log(`Game WS on ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/ws`);
});
