/**
 * FAIL-closed smoke: titleConfirm must hard-freeze flow past all auto-advance windows.
 * Exits 1 if phase advances or titleConfirm clears before host Ja/Nee.
 */
import WebSocket from 'ws';

const FREEZE_MS = 8000;

function once(ws, type, timeout = 12000) {
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

function roomWith(ws, pred, timeout = 25000) {
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

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function open() {
	const ws = new WebSocket('ws://127.0.0.1:5173/ws');
	await new Promise((r, j) => {
		ws.on('open', r);
		ws.on('error', j);
	});
	return ws;
}

function fail(msg) {
	console.error('FAIL:', msg);
	process.exit(1);
}

const host = await open();
host.send(
	JSON.stringify({
		type: 'create',
		name: 'Nick',
		settings: {
			winAt: 8,
			startCards: 1,
			challengeSeconds: 3,
			autoFlowDelayMs: 400,
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
await once(p2, 'room');

const tracks = Array.from({ length: 16 }, (_, i) => ({
	id: `hz${i}`,
	title: `Track ${i}`,
	artist: 'Freeze',
	year: 1980 + i,
	spotifyUri: `spotify:track:hz${i}`,
	previewUrl: null,
	mockColor: '#ff5c33'
}));
host.send(
	JSON.stringify({
		type: 'set_deck',
		tracks,
		playlistId: 'hz',
		playlistName: 'Hard freeze',
		source: 'spotify'
	})
);
await once(host, 'room');
host.send(JSON.stringify({ type: 'start' }));

/** Year hidden pre-reveal — rotate slots until a correct place. */
let room = null;
for (let attempt = 0; attempt < 24; attempt++) {
	room = await roomWith(host, (r) => r.phase === 'GUESSING' && !!r.turn.track);
	const activeId = room.turn.activePlayerId;
	const active = room.players.find((p) => p.id === activeId);
	const activeWs = activeId === nickId ? host : p2;
	const slot = attempt % (active.timeline.length + 1);
	console.log('try', attempt, active.name, 'slot', slot, '/', active.timeline.length);
	activeWs.send(JSON.stringify({ type: 'lock_slot', slotIndex: slot }));
	room = await roomWith(host, (r) => r.phase === 'RESOLVE' && !!r.turn.lastResolve);
	console.log('→', room.turn.lastResolve.message);
	if (room.turn.lastResolve.activeKept || room.turn.lastResolve.stolenBy) break;
	room = null;
}
if (!room) fail('no correct placement in 24 attempts');

const claimantId = room.turn.lastResolve.stolenBy || room.turn.activePlayerId;
const claimWs = claimantId === nickId ? host : p2;
claimWs.send(JSON.stringify({ type: 'request_token' }));
room = await roomWith(host, (r) => !!r.titleConfirm);
console.log('CLAIM OPEN phase=', room.phase, 'claimant=', room.titleConfirm.playerName);

let latest = room;
let illegal = null;
const onMsg = (raw) => {
	const msg = JSON.parse(String(raw));
	if (msg.type !== 'room') return;
	latest = msg.room;
	if (!latest.titleConfirm) {
		illegal = `titleConfirm cleared without host decision (phase=${latest.phase})`;
		return;
	}
	if (
		['WAITING_TURN', 'HOST_PLAYING', 'GUESSING', 'GUESS_LOCKED', 'CHALLENGE_WINDOW', 'REVEAL'].includes(
			latest.phase
		)
	) {
		illegal = `phase advanced to ${latest.phase} while titleConfirm open`;
	}
};
host.on('message', onMsg);
p2.on('message', onMsg);

console.log(`freezing ${FREEZE_MS}ms past auto-advance windows…`);
const t0 = Date.now();
while (Date.now() - t0 < FREEZE_MS) {
	if (illegal) fail(illegal);
	await sleep(200);
}
host.off('message', onMsg);
p2.off('message', onMsg);
if (illegal) fail(illegal);
if (!latest.titleConfirm) fail('titleConfirm missing after freeze window');
if (!['RESOLVE', 'CHECK_WIN'].includes(latest.phase)) {
	fail(`expected RESOLVE/CHECK_WIN after freeze, got ${latest.phase}`);
}
console.log('still frozen after', FREEZE_MS, 'ms — phase=', latest.phase);

host.send(JSON.stringify({ type: 'host_skip_turn' }));
const skipErr = await once(host, 'error');
console.log('host_skip blocked:', skipErr.message);
if (!/gepauzeerd/i.test(skipErr.message)) fail('host_skip should error while paused');

const tokensBefore = latest.players.find((p) => p.id === claimantId).tokens;
const cleared = roomWith(host, (r) => !r.titleConfirm, 8000);
host.send(JSON.stringify({ type: 'token_earn_approve', playerId: claimantId }));
const after = await cleared;
if (after.titleConfirm) fail('titleConfirm still set after Ja');
const tokensAfter = after.players.find((p) => p.id === claimantId).tokens;
if (tokensAfter !== tokensBefore + 1) fail(`token not granted ${tokensBefore}→${tokensAfter}`);
console.log('after Ja tokens', tokensBefore, '→', tokensAfter, 'phase', after.phase);

const resumed = await Promise.race([
	roomWith(
		host,
		(r) =>
			!r.titleConfirm &&
			(r.phase === 'WAITING_TURN' ||
				r.phase === 'HOST_PLAYING' ||
				r.phase === 'GUESSING' ||
				r.phase === 'CHECK_WIN' ||
				r.phase === 'GAME_OVER')
	),
	sleep(5000).then(() => null)
]);
if (!resumed) fail('flow did not resume after host Ja');
console.log('OK hard-freeze held; resumed phase=', resumed.phase);

host.close();
p2.close();
process.exit(0);
