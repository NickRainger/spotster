import type { Plugin } from 'vite';
import type { Server as HttpServer } from 'node:http';
import { attachGameServer } from './index.ts';

export function spotsterGameServer(): Plugin {
	return {
		name: 'spotster-game-server',
		configureServer(server) {
			if (!server.httpServer) return;
			attachGameServer(server.httpServer as HttpServer);
			server.httpServer.once('listening', () => {
				const addr = server.httpServer?.address();
				const port = typeof addr === 'object' && addr ? addr.port : '?';
				console.log(`\n  🎲 Spotster WS  →  ws://localhost:${port}/ws\n`);
			});
		}
	};
}
