import WebSocket from 'ws';

function once(ws, type, timeout = 8000) {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error('timeout ' + type)), timeout);
		const handler = (raw) => {
			const msg = JSON.parse(String(raw));
			if (msg.type === type) {
				clearTimeout(t);
				ws.off('message', handler);
				resolve(msg);
			}
		};
		ws.on('message', handler);
	});
}

const host = new WebSocket('ws://127.0.0.1:5173/ws');
await new Promise((r, j) => {
	host.on('open', r);
	host.on('error', j);
});
host.send(
	JSON.stringify({
		type: 'create',
		name: 'Nick',
		settings: { winAt: 3, startCards: 1, challengeSeconds: 2, autoFlowDelayMs: 400 }
	})
);
const created = await once(host, 'room');
console.log('created', created.room.code, created.room.phase);
const code = created.room.code;

const p2 = new WebSocket('ws://127.0.0.1:5173/ws');
await new Promise((r, j) => {
	p2.on('open', r);
	p2.on('error', j);
});
p2.send(JSON.stringify({ type: 'join', code, name: 'Sam' }));
await once(p2, 'room');
console.log('joined OK');

const fakeTracks = Array.from({ length: 8 }, (_, i) => ({
	id: `sm${i}`,
	title: `Track ${i}`,
	artist: 'Smoke',
	year: 1970 + i * 3,
	spotifyYear: 1970 + i * 3,
	spotifyUri: `spotify:track:smoke${i}`,
	previewUrl: null,
	mockColor: '#ff5c33'
}));
host.send(
	JSON.stringify({
		type: 'set_deck',
		tracks: fakeTracks,
		playlistId: 'smoke',
		playlistName: 'Smoke playlist',
		source: 'spotify'
	})
);
await once(host, 'room');
console.log('deck set');

host.send(JSON.stringify({ type: 'start' }));

let room = null;
for (let i = 0; i < 25; i++) {
	room = (await once(host, 'room')).room;
	console.log('phase', room.phase);
	if (room.phase === 'GUESSING' || room.phase === 'HOST_PLAYING') break;
}

const activeId = room.turn.activePlayerId;
const activeWs = activeId === created.you.playerId ? host : p2;
const activePlayer = room.players.find((p) => p.id === activeId);
console.log('lock as', activePlayer.name);
activeWs.send(JSON.stringify({ type: 'lock_slot', slotIndex: 0 }));

for (let i = 0; i < 40; i++) {
	room = (await once(host, 'room')).room;
	console.log(
		'→',
		room.phase,
		room.turn.lastResolve?.message ?? '',
		room.winnerId ? 'WIN' : ''
	);
	if (room.phase === 'WAITING_TURN' || room.phase === 'HOST_PLAYING' || room.phase === 'GUESSING') {
		console.log('auto-flow continues OK');
		break;
	}
	if (room.phase === 'GAME_OVER') break;
}

console.log('done', room.phase, 'deck', room.deckRemaining);
host.close();
p2.close();
process.exit(0);
