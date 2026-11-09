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
		settings: { winAt: 3, challengeSeconds: 8, autoFlowDelayMs: 400, challengeMode: 'timer' }
	})
);
let msg = await once(host, 'room');
const code = msg.room.code;
const hostId = msg.you.playerId;
console.log('created', code);

host.send(JSON.stringify({ type: 'set_play_mode', mode: 'single' }));
msg = await once(host, 'room');
console.log('mode', msg.room.playMode);

host.send(JSON.stringify({ type: 'add_local_player', name: 'Sam' }));
msg = await once(host, 'room');
host.send(JSON.stringify({ type: 'add_local_player', name: 'Alex' }));
msg = await once(host, 'room');
console.log(
	'players',
	msg.room.players.map((p) => p.name).join(',')
);

host.send(JSON.stringify({ type: 'start' }));
msg = await once(host, 'room');
console.log('phase', msg.room.phase, 'handoff', msg.room.handoff?.kind, msg.room.handoff?.playerName);

if (msg.room.handoff?.kind !== 'guesser') throw new Error('expected guesser handoff');

host.send(JSON.stringify({ type: 'handoff_ack' }));
for (let i = 0; i < 10; i++) {
	msg = await once(host, 'room');
	console.log('→', msg.room.phase, msg.room.handoff?.kind ?? '-');
	if (msg.room.phase === 'GUESSING' || msg.room.phase === 'HOST_PLAYING') break;
}

const active = msg.room.turn.activePlayerId;
console.log('lock as', active);
host.send(JSON.stringify({ type: 'lock_slot', slotIndex: 0, asPlayerId: active }));

for (let i = 0; i < 20; i++) {
	msg = await once(host, 'room');
	console.log(
		'→',
		msg.room.phase,
		'seat',
		msg.room.challengeSeatId?.slice(0, 6),
		'handoff',
		msg.room.handoff?.kind ?? '-',
		msg.room.handoff?.playerName ?? ''
	);
	if (msg.room.phase === 'CHALLENGE_WINDOW' && msg.room.handoff?.kind === 'challenger') {
		host.send(JSON.stringify({ type: 'handoff_ack' }));
		msg = await once(host, 'room');
		console.log('  after ack seat', msg.room.challengeSeatId?.slice(0, 6), 'handoff', msg.room.handoff);
		const seat = msg.room.challengeSeatId;
		if (seat) {
			host.send(JSON.stringify({ type: 'skip_challenge', asPlayerId: seat }));
		}
		continue;
	}
	if (msg.room.phase === 'REVEAL' && msg.room.handoff?.kind === 'reveal') {
		host.send(JSON.stringify({ type: 'handoff_ack' }));
		continue;
	}
	if (msg.room.phase === 'WAITING_TURN' || msg.room.phase === 'GAME_OVER') {
		console.log('round advanced OK');
		break;
	}
}

console.log('done single-device smoke');
host.close();
process.exit(0);
