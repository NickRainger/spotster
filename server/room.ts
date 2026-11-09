import { customAlphabet } from 'nanoid';
import { shuffledDeck } from '../src/lib/game/deck.ts';
import {
	checkWinner,
	emptyTurn,
	isSlotCorrect,
	nextPlayerId,
	resolveTurn,
	toCard
} from '../src/lib/game/engine.ts';
import { applyVariantPreset, DEFAULT_SETTINGS, mergeSettings } from '../src/lib/game/settings.ts';
import type {
	ClientMessage,
	GamePhase,
	GameSettings,
	HandoffState,
	Player,
	RoomPublic,
	ServerMessage,
	Track
} from '../src/lib/game/types.ts';

const codeGen = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const tokenGen = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24);
const PLAYER_COLORS = ['#ff5c33', '#2dd4bf', '#fbbf24', '#60a5fa', '#f472b6', '#a3e635', '#c084fc', '#fb7185'];

export type SendFn = (msg: ServerMessage) => void;

interface Conn {
	send: SendFn;
	playerId: string | null;
}

export class Room {
	code: string;
	settings: GameSettings;
	players: Player[] = [];
	turnOrder: string[] = [];
	phase: GamePhase = 'lobby';
	turn = emptyTurn();
	winnerId: string | null = null;
	deck: Track[] = [];
	/** Full deck snapshot for re-deals (Spotify playlist) */
	deckBackup: Track[] = [];
	playMode: 'multi' | 'single' = 'multi';
	createdAt = Date.now();
	spotify = {
		connected: false,
		tier: 'unknown' as 'premium' | 'free' | 'unknown',
		displayName: null as string | null,
		playlistName: null as string | null,
		playlistId: null as string | null,
		source: 'mock' as 'mock' | 'spotify'
	};
	handoff: HandoffState | null = null;
	challengeSeatId: string | null = null;
	private challengeQueue: string[] = [];
	/** Device owner connection playerId (host) — acts for local seats in single mode */
	private deviceOwnerId: string | null = null;
	private conns = new Set<Conn>();
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private turnIndexSeed = 0;

	constructor(code?: string, settings?: Partial<GameSettings>) {
		this.code = code ?? codeGen();
		this.settings = mergeSettings(settings);
	}

	addConn(conn: Conn) {
		this.conns.add(conn);
	}

	removeConn(conn: Conn) {
		this.conns.delete(conn);
		if (conn.playerId) {
			const p = this.players.find((x) => x.id === conn.playerId);
			if (p) {
				p.connected = false;
				this.broadcast();
			}
		}
	}

	private broadcast() {
		for (const c of this.conns) {
			if (!c.playerId) continue;
			const you = this.players.find((p) => p.id === c.playerId);
			if (!you) continue;
			c.send({
				type: 'room',
				room: this.toPublic(you.isHost),
				you: { playerId: you.id, sessionToken: you.sessionToken }
			});
		}
	}

	private sendTo(playerId: string, msg: ServerMessage) {
		for (const c of this.conns) {
			if (c.playerId === playerId) c.send(msg);
		}
	}

	toPublic(forHost = false): RoomPublic {
		const revealed =
			this.phase === 'REVEAL' ||
			this.phase === 'RESOLVE' ||
			this.phase === 'CHECK_WIN' ||
			this.phase === 'GAME_OVER';
		let track = this.turn.track;
		if (track && !revealed) {
			track = {
				...track,
				title: '???',
				artist: '???',
				year: 0,
				imageUrl: forHost ? track.imageUrl : null
			};
			// Playback URLs only for host (anti-cheat + device plays)
			if (!forHost) {
				track = { ...track, spotifyUri: undefined, previewUrl: null };
			}
		}
		return {
			code: this.code,
			phase: this.phase,
			settings: this.settings,
			players: this.players.map(({ sessionToken: _s, ...rest }) => rest),
			turnOrder: this.turnOrder,
			turn: {
				...this.turn,
				track
			},
			winnerId: this.winnerId,
			deckRemaining: this.deck.length,
			playMode: this.playMode,
			createdAt: this.createdAt,
			spotify: { ...this.spotify },
			challengeSeatId: this.challengeSeatId,
			handoff: this.handoff ? { ...this.handoff } : null
		};
	}

	handle(conn: Conn, msg: ClientMessage) {
		try {
			switch (msg.type) {
				case 'create':
					this.createHost(conn, msg.name, msg.settings);
					break;
				case 'join':
					this.join(conn, msg.name, msg.sessionToken);
					break;
				case 'reconnect':
					this.reconnect(conn, msg.sessionToken);
					break;
				case 'update_settings':
					this.updateSettings(conn, msg.settings);
					break;
				case 'reorder':
					this.reorder(conn, msg.playerIds);
					break;
				case 'kick':
					this.kick(conn, msg.playerId);
					break;
				case 'leave':
					this.leave(conn);
					break;
				case 'start':
					this.start(conn);
					break;
				case 'lock_slot':
					this.lockSlot(conn, msg.slotIndex, msg.asPlayerId);
					break;
				case 'challenge':
					this.challenge(conn, msg.slotIndex, msg.asPlayerId);
					break;
				case 'skip_turn':
					this.skipTurn(conn, msg.asPlayerId);
					break;
				case 'skip_challenge':
					this.skipChallenge(conn, msg.asPlayerId);
					break;
				case 'three_for_one':
					this.threeForOne(conn, msg.asPlayerId);
					break;
				case 'add_local_player':
					this.addLocalPlayer(conn, msg.name);
					break;
				case 'remove_local_player':
					this.removeLocalPlayer(conn, msg.playerId);
					break;
				case 'handoff_ack':
					this.handoffAck(conn);
					break;
				case 'host_reveal':
					this.hostReveal(conn);
					break;
				case 'host_skip_turn':
					this.hostSkipTurn(conn);
					break;
				case 'host_force_phase':
					this.hostForcePhase(conn, msg.phase);
					break;
				case 'token_earn_approve':
					this.tokenEarnApprove(conn, msg.playerId);
					break;
				case 'request_token':
					this.requestToken(conn);
					break;
				case 'set_play_mode':
					this.setPlayMode(conn, msg.mode);
					break;
				case 'set_deck':
					this.setDeck(conn, msg);
					break;
				case 'set_year_override':
					this.setYearOverride(conn, msg.trackId, msg.year);
					break;
				case 'spotify_status':
					this.setSpotifyStatus(conn, msg);
					break;
				default:
					conn.send({ type: 'error', message: 'Onbekend bericht' });
			}
		} catch (e) {
			conn.send({ type: 'error', message: e instanceof Error ? e.message : 'Fout' });
		}
	}

	private requireHost(conn: Conn): Player {
		const p = this.requirePlayer(conn);
		if (!p.isHost) throw new Error('Alleen de host mag dit');
		return p;
	}

	private requirePlayer(conn: Conn): Player {
		if (!conn.playerId) throw new Error('Niet ingelogd in room');
		const p = this.players.find((x) => x.id === conn.playerId);
		if (!p) throw new Error('Speler niet gevonden');
		return p;
	}

	/** In single-device, the device owner may act as any local seat via asPlayerId. */
	private requireActor(conn: Conn, asPlayerId?: string): Player {
		const controller = this.requirePlayer(conn);
		if (!asPlayerId || asPlayerId === controller.id) return controller;
		if (this.playMode !== 'single') throw new Error('asPlayerId alleen in single-device');
		if (controller.id !== this.deviceOwnerId && !controller.isHost) {
			throw new Error('Alleen het speeltoestel mag seats wisselen');
		}
		const target = this.players.find((p) => p.id === asPlayerId);
		if (!target) throw new Error('Speler niet gevonden');
		return target;
	}

	private createHost(conn: Conn, name: string, settings?: Partial<GameSettings>) {
		if (this.players.length) throw new Error('Room bestaat al');
		if (settings?.rulesVariant) {
			this.settings = mergeSettings(settings, applyVariantPreset(settings.rulesVariant));
		} else {
			this.settings = mergeSettings(settings);
		}
		const host = this.makePlayer(name, true);
		this.players.push(host);
		this.turnOrder = [host.id];
		conn.playerId = host.id;
		this.deviceOwnerId = host.id;
		this.broadcast();
	}

	private join(conn: Conn, name: string, sessionToken?: string) {
		if (sessionToken) {
			const existing = this.players.find((p) => p.sessionToken === sessionToken);
			if (existing) {
				existing.connected = true;
				existing.name = name || existing.name;
				conn.playerId = existing.id;
				this.broadcast();
				return;
			}
		}
		if (this.phase !== 'lobby' && this.phase !== 'GAME_OVER') {
			// Mid-game join allowed
		}
		const player = this.makePlayer(name, false);
		this.players.push(player);
		if (this.phase === 'lobby') {
			this.turnOrder = this.players.map((p) => p.id);
		} else {
			this.turnOrder.push(player.id);
			this.dealStartCards(player);
		}
		conn.playerId = player.id;
		this.broadcast();
	}

	private reconnect(conn: Conn, sessionToken: string) {
		const existing = this.players.find((p) => p.sessionToken === sessionToken);
		if (!existing) throw new Error('Sessie verlopen — join opnieuw');
		existing.connected = true;
		conn.playerId = existing.id;
		if (existing.isHost) this.deviceOwnerId = existing.id;
		this.broadcast();
	}

	private makePlayer(name: string, isHost: boolean): Player {
		const id = tokenGen();
		return {
			id,
			name: (name || 'Speler').trim().slice(0, 20),
			color: PLAYER_COLORS[this.players.length % PLAYER_COLORS.length],
			connected: true,
			isHost,
			tokens: this.settings.tokensStart,
			timeline: [],
			order: this.players.length,
			sessionToken: tokenGen()
		};
	}

	private updateSettings(conn: Conn, partial: Partial<GameSettings>) {
		this.requireHost(conn);
		// Mid-game: only playback knobs (speelduur / offset / auto-flow)
		if (this.phase !== 'lobby') {
			const allowed: (keyof GameSettings)[] = [
				'playDurationSec',
				'playOffsetSec',
				'autoFlowDelayMs',
				'disconnectGraceSec'
			];
			const safe: Partial<GameSettings> = {};
			for (const k of allowed) {
				if (partial[k] !== undefined) (safe as Record<string, unknown>)[k] = partial[k];
			}
			if (!Object.keys(safe).length) {
				throw new Error('Alleen speelduur/offset mid-game');
			}
			this.settings = mergeSettings(safe, this.settings);
			this.broadcast();
			return;
		}
		if (partial.rulesVariant && partial.rulesVariant !== this.settings.rulesVariant) {
			this.settings = mergeSettings(partial, applyVariantPreset(partial.rulesVariant, this.settings));
		} else {
			this.settings = mergeSettings(partial, this.settings);
		}
		this.broadcast();
	}

	private reorder(conn: Conn, playerIds: string[]) {
		this.requireHost(conn);
		if (this.phase !== 'lobby') throw new Error('Volgorde alleen in lobby');
		const set = new Set(this.players.map((p) => p.id));
		if (playerIds.length !== set.size || playerIds.some((id) => !set.has(id))) {
			throw new Error('Ongeldige volgorde');
		}
		this.turnOrder = playerIds;
		this.players.forEach((p, i) => {
			p.order = playerIds.indexOf(p.id);
		});
		this.players.sort((a, b) => a.order - b.order);
		this.broadcast();
	}

	private kick(conn: Conn, playerId: string) {
		this.requireHost(conn);
		if (playerId === conn.playerId) throw new Error('Je kunt jezelf niet kicken');
		const idx = this.players.findIndex((p) => p.id === playerId);
		if (idx < 0) throw new Error('Speler niet gevonden');
		this.sendTo(playerId, { type: 'kicked', reason: 'De host heeft je gekickt' });
		this.players.splice(idx, 1);
		this.turnOrder = this.turnOrder.filter((id) => id !== playerId);
		for (const c of this.conns) {
			if (c.playerId === playerId) c.playerId = null;
		}
		if (this.phase !== 'lobby' && this.turn.activePlayerId === playerId) {
			this.clearTimers();
			this.beginWaitingTurn(nextPlayerId(this.turnOrder, playerId));
		} else {
			this.broadcast();
		}
	}

	private leave(conn: Conn) {
		const p = this.requirePlayer(conn);
		if (p.isHost) {
			// Transfer host to next connected player
			const next = this.players.find((x) => x.id !== p.id);
			if (next) {
				next.isHost = true;
			}
		}
		this.players = this.players.filter((x) => x.id !== p.id);
		this.turnOrder = this.turnOrder.filter((id) => id !== p.id);
		conn.playerId = null;
		if (!this.players.length) {
			this.phase = 'lobby';
			this.clearTimers();
			return;
		}
		if (this.phase !== 'lobby' && this.turn.activePlayerId === p.id) {
			this.clearTimers();
			this.beginWaitingTurn(nextPlayerId(this.turnOrder, p.id));
		} else {
			this.broadcast();
		}
	}

	private setPlayMode(conn: Conn, mode: 'multi' | 'single') {
		this.requireHost(conn);
		if (this.phase !== 'lobby') throw new Error('Alleen in lobby');
		this.playMode = mode;
		this.handoff = null;
		this.challengeSeatId = null;
		this.challengeQueue = [];
		this.broadcast();
	}

	private addLocalPlayer(conn: Conn, name: string) {
		this.requireHost(conn);
		if (this.playMode !== 'single') throw new Error('Lokale spelers alleen in single-device');
		if (this.phase !== 'lobby') throw new Error('Alleen in lobby');
		if (this.players.length >= 12) throw new Error('Max 12 spelers');
		const player = this.makePlayer(name, false);
		player.connected = true;
		this.players.push(player);
		this.turnOrder = this.players.map((p) => p.id);
		this.broadcast();
	}

	private removeLocalPlayer(conn: Conn, playerId: string) {
		this.requireHost(conn);
		if (this.playMode !== 'single') throw new Error('Alleen in single-device');
		if (this.phase !== 'lobby') throw new Error('Alleen in lobby');
		const p = this.players.find((x) => x.id === playerId);
		if (!p) throw new Error('Speler niet gevonden');
		if (p.isHost) throw new Error('Host kan niet weg (hernoem of leave room)');
		this.players = this.players.filter((x) => x.id !== playerId);
		this.turnOrder = this.turnOrder.filter((id) => id !== playerId);
		this.broadcast();
	}

	private handoffAck(conn: Conn) {
		this.requirePlayer(conn);
		if (this.playMode !== 'single') return;
		if (!this.handoff) return;
		const kind = this.handoff.kind;
		this.handoff = null;
		this.broadcast();
		if (kind === 'guesser' && this.phase === 'WAITING_TURN') {
			this.beginHostPlaying();
		} else if (kind === 'challenger' && this.phase === 'CHALLENGE_WINDOW') {
			this.armChallengeSeatTimer();
		} else if (kind === 'reveal' && this.phase === 'REVEAL') {
			this.schedule('auto', this.settings.autoFlowDelayMs, () => this.beginResolve());
		}
	}

	private setSpotifyStatus(
		conn: Conn,
		msg: {
			connected: boolean;
			tier: 'premium' | 'free' | 'unknown';
			displayName?: string | null;
		}
	) {
		this.requireHost(conn);
		this.spotify.connected = msg.connected;
		this.spotify.tier = msg.tier;
		this.spotify.displayName = msg.displayName ?? null;
		if (!msg.connected) {
			this.spotify.source = 'mock';
			this.spotify.playlistId = null;
			this.spotify.playlistName = null;
		}
		this.broadcast();
	}

	private setDeck(
		conn: Conn,
		msg: {
			tracks: Track[];
			playlistName?: string;
			playlistId?: string;
			source?: 'mock' | 'spotify';
		}
	) {
		this.requireHost(conn);
		if (this.phase !== 'lobby' && this.phase !== 'GAME_OVER') {
			throw new Error('Deck alleen in lobby wijzigen');
		}
		const source = msg.source ?? 'spotify';
		if (source === 'mock' || !msg.tracks?.length) {
			this.deck = [];
			this.deckBackup = [];
			this.spotify.source = 'mock';
			this.spotify.playlistName = null;
			this.spotify.playlistId = null;
			this.broadcast();
			return;
		}
		const COLORS = ['#e11d48', '#f59e0b', '#0ea5e9', '#22c55e', '#a855f7', '#ef4444', '#14b8a6'];
		this.deck = msg.tracks.map((t, i) => {
			const baseYear = t.yearOverride ?? t.spotifyYear ?? t.year;
			if (!baseYear || baseYear < 1900) {
				throw new Error(`Track zonder geldig jaar: ${t.title}`);
			}
			return {
				...t,
				year: baseYear,
				spotifyYear: t.spotifyYear ?? t.year,
				mockColor: t.mockColor || COLORS[i % COLORS.length]
			};
		});
		for (let i = this.deck.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
		}
		this.spotify.source = 'spotify';
		this.spotify.playlistName = msg.playlistName ?? null;
		this.spotify.playlistId = msg.playlistId ?? null;
		this.deckBackup = this.deck.map((t) => ({ ...t }));
		this.broadcast();
	}

	private setYearOverride(conn: Conn, trackId: string, year: number | null) {
		this.requireHost(conn);
		const apply = (t: Track): Track => {
			if (t.id !== trackId) return t;
			const next = {
				...t,
				yearOverride: year,
				year: year ?? t.spotifyYear ?? t.year
			};
			return next;
		};
		this.deck = this.deck.map(apply);
		if (this.turn.track?.id === trackId) {
			this.turn.track = apply(this.turn.track);
		}
		for (const p of this.players) {
			p.timeline = p.timeline.map((c) =>
				c.trackId === trackId ? { ...c, year: year ?? c.year } : c
			);
		}
		this.broadcast();
	}

	private start(conn: Conn) {
		this.requireHost(conn);
		if (this.phase !== 'lobby' && this.phase !== 'GAME_OVER') throw new Error('Spel loopt al');
		if (this.playMode === 'single' && this.players.length < 2) {
			throw new Error('Single-device: voeg minstens één extra speler toe');
		}
		const playing = this.settings.hostPlays
			? this.players
			: this.players.filter((p) => !p.isHost);
		if (playing.length < 1) throw new Error('Minimaal 1 meespelende speler nodig');
		this.deviceOwnerId = this.players.find((p) => p.isHost)?.id ?? conn.playerId;
		// Keep Spotify deck if loaded; otherwise mock
		if (this.spotify.source === 'spotify' && this.deckBackup.length >= 5) {
			this.deck = this.deckBackup.map((t) => ({ ...t }));
			for (let i = this.deck.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
			}
		} else {
			this.deck = shuffledDeck();
			this.spotify.source = 'mock';
			this.spotify.playlistName = null;
			this.spotify.playlistId = null;
			this.deckBackup = [];
		}
		this.winnerId = null;
		this.turn = emptyTurn();
		this.turnOrder = this.turnOrder.filter((id) => playing.some((p) => p.id === id));
		if (!this.turnOrder.length) {
			this.turnOrder = playing.map((p) => p.id);
		}
		for (const p of this.players) {
			p.timeline = [];
			p.tokens = this.settings.tokensStart;
			if (this.turnOrder.includes(p.id)) this.dealStartCards(p);
		}
		this.turnIndexSeed = 0;
		this.beginWaitingTurn(this.turnOrder[0]);
	}

	private dealStartCards(player: Player) {
		for (let i = 0; i < this.settings.startCards; i++) {
			const t = this.deck.pop();
			if (!t) break;
			player.timeline.push(toCard(t, true));
			player.timeline.sort((a, b) => a.year - b.year);
		}
	}

	private clearTimers() {
		for (const t of this.timers.values()) clearTimeout(t);
		this.timers.clear();
	}

	private schedule(key: string, ms: number, fn: () => void) {
		const prev = this.timers.get(key);
		if (prev) clearTimeout(prev);
		this.timers.set(
			key,
			setTimeout(() => {
				this.timers.delete(key);
				fn();
			}, ms)
		);
	}

	private beginWaitingTurn(playerId: string | null) {
		if (!playerId || !this.turnOrder.includes(playerId)) {
			playerId = this.turnOrder[0] ?? null;
		}
		this.phase = 'WAITING_TURN';
		this.turn = { ...emptyTurn(), activePlayerId: playerId };
		this.challengeSeatId = null;
		this.challengeQueue = [];
		this.handoff = null;

		if (this.playMode === 'single' && playerId) {
			const p = this.players.find((x) => x.id === playerId);
			this.handoff = {
				kind: 'guesser',
				playerId,
				playerName: p?.name ?? 'Speler',
				message: `Geef de telefoon door aan ${p?.name ?? 'de volgende'}. Alleen zij/hij mag nu kijken.`
			};
			this.broadcast();
			return;
		}

		this.broadcast();
		this.schedule('auto', this.settings.autoFlowDelayMs * 0.4, () => this.beginHostPlaying());
	}

	private beginHostPlaying() {
		if (this.phase !== 'WAITING_TURN') return;
		const track = this.deck.pop() ?? null;
		if (!track) {
			const sorted = [...this.players].sort((a, b) => b.timeline.length - a.timeline.length);
			this.winnerId = sorted[0]?.id ?? null;
			this.phase = 'GAME_OVER';
			this.handoff = null;
			this.broadcast();
			return;
		}
		this.phase = 'HOST_PLAYING';
		this.turn.track = track;
		this.turn.lockedSlot = null;
		this.turn.claims = [];
		this.turn.challengeEndsAt = null;
		this.turn.lastResolve = null;
		this.handoff = null;
		this.broadcast();
		this.schedule('auto', Math.min(1200, this.settings.autoFlowDelayMs), () => this.beginGuessing());
	}

	private beginGuessing() {
		if (this.phase !== 'HOST_PLAYING') return;
		this.phase = 'GUESSING';
		this.broadcast();
	}

	private lockSlot(conn: Conn, slotIndex: number, asPlayerId?: string) {
		const p = this.requireActor(conn, asPlayerId);
		if (this.phase !== 'GUESSING' && this.phase !== 'HOST_PLAYING') {
			throw new Error('Nu kun je niet locken');
		}
		if (p.id !== this.turn.activePlayerId) throw new Error('Niet jouw beurt');
		if (!this.turn.track) throw new Error('Geen track');
		if (slotIndex < 0 || slotIndex > p.timeline.length) throw new Error('Ongeldig slot');
		this.turn.lockedSlot = slotIndex;
		this.phase = 'GUESS_LOCKED';
		this.broadcast();
		this.schedule('auto', 600, () => this.beginChallenge());
	}

	private beginChallenge() {
		if (this.phase !== 'GUESS_LOCKED') return;
		this.phase = 'CHALLENGE_WINDOW';

		if (this.playMode === 'single') {
			this.challengeQueue = this.turnOrder.filter((id) => id !== this.turn.activePlayerId);
			this.challengeSeatId = this.challengeQueue[0] ?? null;
			this.turn.challengeEndsAt = null;
			if (!this.challengeSeatId) {
				this.broadcast();
				this.schedule('auto', 400, () => this.beginReveal());
				return;
			}
			this.setChallengerHandoff(this.challengeSeatId);
			this.broadcast();
			return;
		}

		const mode = this.settings.challengeMode;
		if (mode === 'timer' || mode === 'both') {
			this.turn.challengeEndsAt = Date.now() + this.settings.challengeSeconds * 1000;
			this.broadcast();
			this.schedule('challenge', this.settings.challengeSeconds * 1000, () => this.beginReveal());
		} else {
			this.turn.challengeEndsAt = null;
			this.broadcast();
		}
	}

	private setChallengerHandoff(playerId: string) {
		const p = this.players.find((x) => x.id === playerId);
		this.handoff = {
			kind: 'challenger',
			playerId,
			playerName: p?.name ?? 'Speler',
			message: `Geef door aan ${p?.name ?? 'volgende'} voor viesjes. Anderen: niet meegluren.`
		};
	}

	private armChallengeSeatTimer() {
		if (this.playMode !== 'single' || this.phase !== 'CHALLENGE_WINDOW') return;
		const mode = this.settings.challengeMode;
		if (mode === 'timer' || mode === 'both') {
			this.turn.challengeEndsAt = Date.now() + this.settings.challengeSeconds * 1000;
			this.broadcast();
			this.schedule('challenge', this.settings.challengeSeconds * 1000, () => {
				// Seat timed out → skip to next
				this.advanceChallengeSeat();
			});
		} else {
			this.turn.challengeEndsAt = null;
			this.broadcast();
		}
	}

	private advanceChallengeSeat() {
		if (this.phase !== 'CHALLENGE_WINDOW') return;
		this.clearTimers();
		if (!this.challengeSeatId) {
			this.beginReveal();
			return;
		}
		const idx = this.challengeQueue.indexOf(this.challengeSeatId);
		const next = idx >= 0 ? this.challengeQueue[idx + 1] : undefined;
		this.challengeSeatId = next ?? null;
		this.turn.challengeEndsAt = null;
		if (!this.challengeSeatId) {
			this.handoff = null;
			this.broadcast();
			this.schedule('auto', 400, () => this.beginReveal());
			return;
		}
		this.setChallengerHandoff(this.challengeSeatId);
		this.broadcast();
	}

	private challenge(conn: Conn, slotIndex: number, asPlayerId?: string) {
		const p = this.requireActor(conn, asPlayerId);
		if (this.phase !== 'CHALLENGE_WINDOW') throw new Error('Geen challenge-window');
		if (p.id === this.turn.activePlayerId) throw new Error('Actieve speler kan niet challengen');
		if (this.playMode === 'single' && p.id !== this.challengeSeatId) {
			throw new Error('Niet jouw challenge-beurt — wacht op doorgeven');
		}
		if (this.playMode === 'single' && this.handoff) {
			throw new Error('Eerst bevestigen na doorgeven');
		}
		if (p.tokens < 1) throw new Error('Geen viesjes');
		if (this.turn.claims.some((c) => c.slotIndex === slotIndex)) {
			throw new Error('Slot al geclaimd');
		}
		if (this.turn.claims.some((c) => c.playerId === p.id)) {
			throw new Error('Al een viesje geplaatst');
		}
		// Viesjes liggen op het bord van de actieve speler (niet op dat van de challenger)
		const active = this.players.find((x) => x.id === this.turn.activePlayerId);
		if (!active) throw new Error('Geen actieve speler');
		if (slotIndex < 0 || slotIndex > active.timeline.length) throw new Error('Ongeldig slot');
		p.tokens -= 1;
		this.turn.claims.push({ playerId: p.id, slotIndex, at: Date.now() });
		if (this.playMode === 'single') {
			this.advanceChallengeSeat();
		} else {
			this.broadcast();
		}
	}

	private skipChallenge(conn: Conn, asPlayerId?: string) {
		const p = this.requireActor(conn, asPlayerId);
		if (this.phase !== 'CHALLENGE_WINDOW') throw new Error('Geen challenge-window');
		if (this.playMode !== 'single') throw new Error('Skip challenge alleen in single-device');
		if (p.id !== this.challengeSeatId) throw new Error('Niet jouw challenge-beurt');
		if (this.handoff) throw new Error('Eerst bevestigen na doorgeven');
		this.advanceChallengeSeat();
	}

	private hostReveal(conn: Conn) {
		this.requireHost(conn);
		if (this.phase !== 'CHALLENGE_WINDOW') throw new Error('Niet in challenge');
		const mode = this.settings.challengeMode;
		if (mode !== 'host-reveal' && mode !== 'both' && this.playMode !== 'single') {
			throw new Error('Host-reveal staat uit');
		}
		this.clearTimers();
		this.challengeSeatId = null;
		this.challengeQueue = [];
		this.beginReveal();
	}

	private beginReveal() {
		if (this.phase !== 'CHALLENGE_WINDOW' && this.phase !== 'GUESS_LOCKED') return;
		this.phase = 'REVEAL';
		this.challengeSeatId = null;
		this.challengeQueue = [];
		if (this.playMode === 'single') {
			this.handoff = {
				kind: 'reveal',
				playerId: null,
				playerName: 'Iedereen',
				message: 'Iedereen mag meekijken — tik om de reveal te tonen.'
			};
			this.broadcast();
			return;
		}
		this.handoff = null;
		this.broadcast();
		this.schedule('auto', this.settings.autoFlowDelayMs, () => this.beginResolve());
	}

	private beginResolve() {
		if (this.phase !== 'REVEAL') return;
		const active = this.players.find((p) => p.id === this.turn.activePlayerId);
		const track = this.turn.track;
		if (!active || !track || this.turn.lockedSlot == null) {
			this.phase = 'RESOLVE';
			this.broadcast();
			this.schedule('auto', this.settings.autoFlowDelayMs, () => this.beginCheckWin());
			return;
		}
		const { result, players } = resolveTurn(
			active,
			track,
			this.turn.lockedSlot,
			this.turn.claims,
			this.players
		);
		this.players = players;
		this.turn.lastResolve = result;
		this.phase = 'RESOLVE';
		this.broadcast();
		this.schedule('auto', this.settings.autoFlowDelayMs + 800, () => this.beginCheckWin());
	}

	private beginCheckWin() {
		if (this.phase !== 'RESOLVE') return;
		this.phase = 'CHECK_WIN';
		const winner = checkWinner(this.players, this.settings.winAt);
		this.broadcast();
		if (winner) {
			this.winnerId = winner;
			this.schedule('auto', 800, () => {
				this.phase = 'GAME_OVER';
				this.broadcast();
			});
		} else {
			const next = nextPlayerId(this.turnOrder, this.turn.activePlayerId);
			this.schedule('auto', 600, () => this.beginWaitingTurn(next));
		}
	}

	private skipTurn(conn: Conn, asPlayerId?: string) {
		const p = this.requireActor(conn, asPlayerId);
		if (p.id !== this.turn.activePlayerId) throw new Error('Niet jouw beurt');
		if (this.phase !== 'GUESSING' && this.phase !== 'HOST_PLAYING' && this.phase !== 'WAITING_TURN') {
			throw new Error('Te laat om te skippen');
		}
		if (this.playMode === 'single' && this.handoff?.kind === 'guesser') {
			throw new Error('Eerst bevestigen na doorgeven');
		}
		if (p.tokens < this.settings.skipCost) throw new Error('Niet genoeg viesjes');
		p.tokens -= this.settings.skipCost;
		if (this.turn.track) this.deck.unshift(this.turn.track);
		this.clearTimers();
		const next = nextPlayerId(this.turnOrder, p.id);
		this.beginWaitingTurn(next);
	}

	private threeForOne(conn: Conn, asPlayerId?: string) {
		const p = this.requireActor(conn, asPlayerId);
		if (!this.settings.threeForOneEnabled) throw new Error('3-voor-1 staat uit');
		if (this.phase === 'lobby' || this.phase === 'GAME_OVER') throw new Error('Niet nu');
		if (this.playMode === 'single' && this.handoff) {
			throw new Error('Niet tijdens doorgeven');
		}
		if (p.tokens < this.settings.threeForOneCost) throw new Error('Niet genoeg viesjes');
		const t = this.deck.pop();
		if (!t) throw new Error('Deck leeg');
		p.tokens -= this.settings.threeForOneCost;
		p.timeline.push(toCard(t, true));
		p.timeline.sort((a, b) => a.year - b.year);
		const winner = checkWinner(this.players, this.settings.winAt);
		if (winner) {
			this.clearTimers();
			this.winnerId = winner;
			this.phase = 'GAME_OVER';
			this.handoff = null;
		}
		this.broadcast();
	}

	private hostSkipTurn(conn: Conn) {
		this.requireHost(conn);
		if (this.phase === 'lobby' || this.phase === 'GAME_OVER') throw new Error('Niet nu');
		if (this.turn.track) this.deck.unshift(this.turn.track);
		this.clearTimers();
		const next = nextPlayerId(this.turnOrder, this.turn.activePlayerId);
		this.beginWaitingTurn(next);
	}

	private hostForcePhase(conn: Conn, phase: GamePhase) {
		this.requireHost(conn);
		// Emergency: only allow jumping to safe recovery points
		if (!['WAITING_TURN', 'GUESSING', 'CHALLENGE_WINDOW', 'REVEAL'].includes(phase)) {
			throw new Error('Ongeldige force-phase');
		}
		this.clearTimers();
		this.phase = phase;
		this.broadcast();
	}

	private tokenEarnApprove(conn: Conn, playerId: string) {
		this.requireHost(conn);
		if (this.settings.tokenEarnMode === 'off') throw new Error('Token verdienen staat uit');
		const target = this.players.find((p) => p.id === playerId);
		if (!target) throw new Error('Speler niet gevonden');
		if (target.tokens >= this.settings.tokensMax) throw new Error('Max viesjes bereikt');
		target.tokens += 1;
		this.broadcast();
	}

	private requestToken(conn: Conn) {
		const p = this.requirePlayer(conn);
		if (this.settings.tokenEarnMode === 'off') throw new Error('Token verdienen staat uit');
		if (this.settings.tokenEarnMode === 'votes') {
			// Stub: auto-grant for MVP when votes mode (full vote UI later)
			if (p.tokens >= this.settings.tokensMax) throw new Error('Max viesjes bereikt');
			p.tokens += 1;
			this.broadcast();
			return;
		}
		// host mode — just a signal; host uses approve. Echo via broadcast room state only.
		this.broadcast();
		for (const c of this.conns) {
			const host = this.players.find((x) => x.id === c.playerId && x.isHost);
			if (host) {
				c.send({
					type: 'error',
					message: `${p.name} vraagt een viesje (titel/artiest) — keur goed via host-panel`
				});
			}
		}
	}
}

export class RoomManager {
	rooms = new Map<string, Room>();

	create(settings?: Partial<GameSettings>): Room {
		let room: Room;
		do {
			room = new Room(undefined, settings);
		} while (this.rooms.has(room.code));
		this.rooms.set(room.code, room);
		return room;
	}

	get(code: string): Room | undefined {
		return this.rooms.get(code.toUpperCase());
	}

	/** Create empty room and return it (host joins via create message on same code) */
	ensure(code: string): Room {
		const existing = this.get(code);
		if (existing) return existing;
		const room = new Room(code.toUpperCase());
		this.rooms.set(room.code, room);
		return room;
	}

	gc() {
		for (const [code, room] of this.rooms) {
			if (room.players.every((p) => !p.connected) && Date.now() - room.createdAt > 1000 * 60 * 60) {
				this.rooms.delete(code);
			}
		}
	}
}

// silence unused import in some builds
void isSlotCorrect;
