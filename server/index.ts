import { WebSocketServer, type WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { ClientMessage } from '../src/lib/game/types.ts';
import { RoomManager, type SendFn } from './room.ts';

export const manager = new RoomManager();

interface SockConn {
	send: SendFn;
	playerId: string | null;
	roomCode: string | null;
	ws: WebSocket;
}

export function attachGameServer(server: HttpServer) {
	const wss = new WebSocketServer({ server, path: '/ws' });

	wss.on('connection', (ws) => {
		const conn: SockConn = {
			ws,
			playerId: null,
			roomCode: null,
			send: (msg) => {
				if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
			}
		};

		ws.on('message', (raw) => {
			let msg: ClientMessage & { code?: string };
			try {
				msg = JSON.parse(String(raw));
			} catch {
				conn.send({ type: 'error', message: 'Ongeldige JSON' });
				return;
			}

			if (msg.type === 'create') {
				const room = manager.create(msg.settings);
				conn.roomCode = room.code;
				room.addConn(conn);
				room.handle(conn, msg);
				return;
			}

			if (msg.type === 'join' || msg.type === 'reconnect') {
				const code = msg.code?.toUpperCase();
				if (!code) {
					conn.send({ type: 'error', message: 'Code verplicht' });
					return;
				}
				const room = manager.get(code);
				if (!room) {
					conn.send({ type: 'error', message: 'Room niet gevonden' });
					return;
				}
				// Move conn between rooms if needed
				if (conn.roomCode && conn.roomCode !== code) {
					manager.get(conn.roomCode)?.removeConn(conn);
				}
				conn.roomCode = code;
				room.addConn(conn);
				room.handle(conn, msg);
				return;
			}

			const room = conn.roomCode ? manager.get(conn.roomCode) : undefined;
			if (!room) {
				conn.send({ type: 'error', message: 'Eerst joinen' });
				return;
			}
			room.handle(conn, msg);
		});

		ws.on('close', () => {
			if (conn.roomCode) {
				manager.get(conn.roomCode)?.removeConn(conn);
			}
		});
	});

	setInterval(() => manager.gc(), 60_000);
	return wss;
}
