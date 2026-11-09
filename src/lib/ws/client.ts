import { writable, type Writable } from 'svelte/store';
import type { ClientMessage, RoomPublic, ServerMessage } from '#lib/game/types';

const SESSION_KEY = 'spotster.session';

export interface SessionBlob {
	code: string;
	playerId: string;
	sessionToken: string;
	name: string;
}

export interface GameClientState {
	connected: boolean;
	room: RoomPublic | null;
	playerId: string | null;
	sessionToken: string | null;
	error: string | null;
	lastKicked: string | null;
}

function wsUrl(): string {
	const fromEnv = (import.meta.env.PUBLIC_WS_URL as string | undefined)?.trim();
	if (fromEnv) {
		// Accept wss://host, https://host, or https://host/ws
		if (fromEnv.startsWith('ws://') || fromEnv.startsWith('wss://')) {
			return fromEnv.endsWith('/ws') ? fromEnv : `${fromEnv.replace(/\/$/, '')}/ws`;
		}
		if (fromEnv.startsWith('http://') || fromEnv.startsWith('https://')) {
			const u = new URL(fromEnv);
			u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
			u.pathname = '/ws';
			u.search = '';
			u.hash = '';
			return u.toString().replace(/\/$/, '');
		}
	}
	if (typeof window === 'undefined') return 'ws://localhost:5173/ws';
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${window.location.host}/ws`;
}

export function loadSession(): SessionBlob | null {
	try {
		const raw = localStorage.getItem(SESSION_KEY);
		return raw ? (JSON.parse(raw) as SessionBlob) : null;
	} catch {
		return null;
	}
}

export function saveSession(blob: SessionBlob | null) {
	if (!blob) localStorage.removeItem(SESSION_KEY);
	else localStorage.setItem(SESSION_KEY, JSON.stringify(blob));
}

export class GameClient {
	state: Writable<GameClientState> = writable({
		connected: false,
		room: null,
		playerId: null,
		sessionToken: null,
		error: null,
		lastKicked: null
	});

	private ws: WebSocket | null = null;
	private queue: ClientMessage[] = [];
	private intentionalClose = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingName: string | null = null;

	connect() {
		if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
			return;
		}
		this.intentionalClose = false;
		const ws = new WebSocket(wsUrl());
		this.ws = ws;

		ws.onopen = () => {
			this.state.update((s) => ({ ...s, connected: true, error: null }));
			for (const m of this.queue) ws.send(JSON.stringify(m));
			this.queue = [];
			// Auto-reconnect only when already on a room URL (not on landing)
			if (typeof window !== 'undefined' && /^\/room\//i.test(window.location.pathname)) {
				const sess = loadSession();
				if (sess?.sessionToken && sess.code) {
					this.send({ type: 'reconnect', code: sess.code, sessionToken: sess.sessionToken });
				}
			}
		};

		ws.onmessage = (ev) => {
			let msg: ServerMessage;
			try {
				msg = JSON.parse(String(ev.data));
			} catch {
				return;
			}
			if (msg.type === 'room') {
				const name =
					this.pendingName ||
					msg.room.players.find((p) => p.id === msg.you.playerId)?.name ||
					'Speler';
				saveSession({
					code: msg.room.code,
					playerId: msg.you.playerId,
					sessionToken: msg.you.sessionToken,
					name
				});
				this.state.set({
					connected: true,
					room: msg.room,
					playerId: msg.you.playerId,
					sessionToken: msg.you.sessionToken,
					error: null,
					lastKicked: null
				});
			} else if (msg.type === 'error') {
				const stale =
					/room niet gevonden/i.test(msg.message) ||
					/ongeldige sessie/i.test(msg.message) ||
					/sessie/i.test(msg.message);
				if (stale) saveSession(null);
				this.state.update((s) => ({
					...s,
					error: msg.message,
					...(stale ? { room: null, playerId: null, sessionToken: null } : {})
				}));
			} else if (msg.type === 'kicked') {
				saveSession(null);
				this.state.update((s) => ({
					...s,
					room: null,
					playerId: null,
					sessionToken: null,
					lastKicked: msg.reason
				}));
			}
		};

		ws.onclose = () => {
			this.state.update((s) => ({ ...s, connected: false }));
			this.ws = null;
			if (!this.intentionalClose) {
				this.reconnectTimer = setTimeout(() => this.connect(), 1200);
			}
		};

		ws.onerror = () => {
			this.state.update((s) => ({ ...s, error: s.error ?? 'Verbinding mislukt' }));
		};
	}

	disconnect() {
		this.intentionalClose = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.ws?.close();
		this.ws = null;
	}

	send(msg: ClientMessage) {
		if (msg.type === 'create' || msg.type === 'join') {
			this.pendingName = msg.name;
		}
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		} else {
			this.queue.push(msg);
			this.connect();
		}
	}

	clearError() {
		this.state.update((s) => ({ ...s, error: null }));
	}
}

export const gameClient = new GameClient();
