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

function roomWith(ws, pred, timeout = 12000) {
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

async function open() {
	const ws = new WebSocket('ws://127.0.0.1:5173/ws');
	await new Promise((r, j) => {
		ws.on('open', r);
		ws.on('error', j);
	});
	return ws;
}

const host = await open();
host.send(
	JSON.stringify({
		type: 'create',
		name: 'Nick',
		settings: {
			winAt: 5,
			startCards: 1,
			challengeSeconds: 2,
			autoFlowDelayMs: 350,
			tokenEarnMode: 'host',
			challengeMode: 'timer',
			hostPlays: true
		}
	})
);
const created = await once(host, 'room');
const code = created.room.code;
const nickId = created.you.playerId;
console.log('created', code);

const p2 = await open();
p2.send(JSON.stringify({ type: 'join', code, name: 'Sam' }));
const joined = await once(p2, 'room');
const samId = joined.you.playerId;

const fakeTracks = Array.from({ length: 10 }, (_, i) => ({
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
const activeId = room.turn.activePlayerId;
const activeWs = activeId === nickId ? host : p2;
const otherWs = activeWs === host ? p2 : host;
console.log('active', room.players.find((p) => p.id === activeId)?.name);

// Mid-turn claim must fail
activeWs.send(JSON.stringify({ type: 'request_token' }));
const midErr = await once(activeWs, 'error');
console.log('mid-turn blocked:', midErr.message);
if (!/reveal/i.test(midErr.message)) throw new Error('expected post-reveal only');

activeWs.send(JSON.stringify({ type: 'lock_slot', slotIndex: 0 }));
room = await roomWith(host, (r) => r.phase === 'RESOLVE' && !!r.turn.lastResolve);
console.log('resolved', room.turn.lastResolve.message, 'kept', room.turn.lastResolve.activeKept);

const claimantId = room.turn.lastResolve.stolenBy
	? room.turn.lastResolve.stolenBy
	: room.turn.lastResolve.activeKept || room.turn.lastResolve.correct
		? room.turn.activePlayerId
		: null;

if (!claimantId) {
	console.log('no correct player this turn — skip claim path OK for miss');
	host.close();
	p2.close();
	process.exit(0);
}

const claimWs = claimantId === nickId ? host : p2;
const wrongWs = claimWs === host ? p2 : host;

// Wrong player cannot claim
wrongWs.send(JSON.stringify({ type: 'request_token' }));
const wrongErr = await once(wrongWs, 'error');
console.log('wrong player blocked:', wrongErr.message);

claimWs.send(JSON.stringify({ type: 'request_token' }));
room = await roomWith(host, (r) => !!r.titleConfirm);
console.log('paused', room.titleConfirm.mode, room.titleConfirm.playerName, 'phase', room.phase);
if (room.phase !== 'RESOLVE' && room.phase !== 'CHECK_WIN') throw new Error('unexpected phase');

// Flow locked
activeWs.send(JSON.stringify({ type: 'host_skip_turn' }));
const pauseErr = await once(host, 'error');
console.log('flow blocked:', pauseErr.message);

const tokensBefore = room.players.find((p) => p.id === claimantId).tokens;
host.send(JSON.stringify({ type: 'token_earn_approve', playerId: claimantId }));
room = await roomWith(host, (r) => !r.titleConfirm);
const tokensAfter = room.players.find((p) => p.id === claimantId).tokens;
console.log('host yes tokens', tokensBefore, '→', tokensAfter);
if (tokensAfter !== tokensBefore + 1) throw new Error('token not granted');

// --- votes mode room ---
const host2 = await open();
host2.send(
	JSON.stringify({
		type: 'create',
		name: 'A',
		settings: {
			winAt: 5,
			startCards: 1,
			challengeSeconds: 2,
			autoFlowDelayMs: 300,
			tokenEarnMode: 'votes',
			challengeMode: 'timer',
			hostPlays: true
		}
	})
);
const c2 = await once(host2, 'room');
const code2 = c2.room.code;
const aId = c2.you.playerId;
const b = await open();
b.send(JSON.stringify({ type: 'join', code: code2, name: 'B' }));
await once(b, 'room');
const c = await open();
c.send(JSON.stringify({ type: 'join', code: code2, name: 'C' }));
const cJoined = await once(c, 'room');
const cId = cJoined.you.playerId;

host2.send(
	JSON.stringify({
		type: 'set_deck',
		tracks: fakeTracks.map((t, i) => ({ ...t, id: `v${i}` })),
		source: 'spotify'
	})
);
await once(host2, 'room');
host2.send(JSON.stringify({ type: 'start' }));
room = await roomWith(host2, (r) => r.phase === 'GUESSING' || r.phase === 'HOST_PLAYING');
const act2 = room.turn.activePlayerId;
const actWs2 = act2 === aId ? host2 : act2 === cJoined.you.playerId ? c : b;
// find b id
const bId = room.players.find((p) => p.name === 'B').id;

actWs2.send(JSON.stringify({ type: 'lock_slot', slotIndex: 0 }));
room = await roomWith(host2, (r) => r.phase === 'RESOLVE' && !!r.turn.lastResolve);
const claim2 = room.turn.lastResolve.stolenBy
	? room.turn.lastResolve.stolenBy
	: room.turn.lastResolve.activeKept || room.turn.lastResolve.correct
		? room.turn.activePlayerId
		: null;
if (!claim2) {
	console.log('votes: miss turn, skip');
} else {
	const claimWs2 = claim2 === aId ? host2 : claim2 === bId ? b : c;
	claimWs2.send(JSON.stringify({ type: 'request_token' }));
	room = await roomWith(host2, (r) => !!r.titleConfirm);
	console.log(
		'votes open',
		'need',
		room.titleConfirm.majorityNeeded,
		'voters',
		room.titleConfirm.voterIds.length
	);
	if (room.titleConfirm.majorityNeeded !== 2) {
		// 3 players → ceil(3/2)=2
		throw new Error('expected majority 2 for 3 players, got ' + room.titleConfirm.majorityNeeded);
	}
	const voters = room.titleConfirm.voterIds;
	const voterWs = (id) => (id === aId ? host2 : id === bId ? b : c);
	// First to 2 against
	voterWs(voters[0]).send(JSON.stringify({ type: 'token_vote', vote: 'against' }));
	await roomWith(host2, (r) => r.titleConfirm && r.titleConfirm.votes.length === 1);
	voterWs(voters[1]).send(JSON.stringify({ type: 'token_vote', vote: 'against' }));
	room = await roomWith(host2, (r) => !r.titleConfirm);
	console.log('votes resolved against OK, phase', room.phase);
}

console.log('OK title-confirm post-reveal + host + votes');
host.close();
p2.close();
host2.close();
b.close();
c.close();
process.exit(0);
