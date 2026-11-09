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

function roomWith(ws, pred, timeout = 10000) {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error('timeout room pred')), timeout);
		const handler = (raw) => {
			const msg = JSON.parse(String(raw));
			if (msg.type === 'room' && pred(msg.room)) {
				clearTimeout(t);
				ws.off('message', handler);
				resolve(msg.room);
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
		settings: {
			winAt: 3,
			startCards: 1,
			challengeSeconds: 8,
			autoFlowDelayMs: 400,
			tokenEarnMode: 'host',
			challengeMode: 'timer'
		}
	})
);
const created = await once(host, 'room');
const code = created.room.code;
console.log('created', code);

const p2 = new WebSocket('ws://127.0.0.1:5173/ws');
await new Promise((r, j) => {
	p2.on('open', r);
	p2.on('error', j);
});
p2.send(JSON.stringify({ type: 'join', code, name: 'Sam' }));
await once(p2, 'room');

const fakeTracks = Array.from({ length: 8 }, (_, i) => ({
	id: `tc${i}`,
	title: `Track ${i}`,
	artist: 'Smoke',
	year: 1970 + i * 3,
	spotifyYear: 1970 + i * 3,
	spotifyUri: `spotify:track:tc${i}`,
	previewUrl: null,
	mockColor: '#ff5c33'
}));
host.send(
	JSON.stringify({
		type: 'set_deck',
		tracks: fakeTracks,
		playlistId: 'tc',
		playlistName: 'Title confirm',
		source: 'spotify'
	})
);
await once(host, 'room');
host.send(JSON.stringify({ type: 'start' }));

let room = await roomWith(host, (r) => r.phase === 'GUESSING' || r.phase === 'HOST_PLAYING');
console.log('playing', room.phase);

const activeId = room.turn.activePlayerId;
const activeWs = activeId === created.you.playerId ? host : p2;
const guestWs = activeWs === host ? p2 : host;
const guestId = activeWs === host ? (await once(p2, 'room').catch(() => null), room.players.find((p) => p.id !== activeId)?.id) : created.you.playerId;
const guest = room.players.find((p) => p.id !== activeId);
console.log('active', room.players.find((p) => p.id === activeId)?.name, 'guest', guest?.name);

// Guest requests viesje while music/flow running
guestWs.send(JSON.stringify({ type: 'request_token' }));
room = await roomWith(host, (r) => !!r.titleConfirm);
console.log('paused confirm for', room.titleConfirm.playerName, 'phase still', room.phase);
if (!room.titleConfirm || room.titleConfirm.playerId !== guest.id) {
	throw new Error('titleConfirm missing or wrong player');
}
if (room.turn.challengeEndsAt != null) {
	console.log('note: challengeEndsAt cleared?', room.turn.challengeEndsAt);
}

// Flow actions should fail while paused
activeWs.send(JSON.stringify({ type: 'lock_slot', slotIndex: 0 }));
const err = await once(activeWs, 'error');
console.log('lock blocked:', err.message);
if (!/gepauzeerd|bevestigen/i.test(err.message)) {
	throw new Error('expected pause error, got: ' + err.message);
}

const tokensBefore = room.players.find((p) => p.id === guest.id).tokens;
host.send(JSON.stringify({ type: 'token_earn_approve', playerId: guest.id }));
room = await roomWith(host, (r) => !r.titleConfirm);
const tokensAfter = room.players.find((p) => p.id === guest.id).tokens;
console.log('approved tokens', tokensBefore, '→', tokensAfter);
if (tokensAfter !== tokensBefore + 1) throw new Error('token not granted');

console.log('OK title-confirm pause + approve');
host.close();
p2.close();
process.exit(0);
