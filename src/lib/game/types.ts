/** Shared Spotster game types — client + server */

export type RulesVariant = 'original' | 'pro' | 'expert' | 'teams';
export type TokenEarnMode = 'host' | 'votes' | 'off';
export type ChallengeMode = 'timer' | 'host-reveal' | 'both';
export type GamePhase =
	| 'lobby'
	| 'WAITING_TURN'
	| 'HOST_PLAYING'
	| 'GUESSING'
	| 'GUESS_LOCKED'
	| 'CHALLENGE_WINDOW'
	| 'REVEAL'
	| 'RESOLVE'
	| 'CHECK_WIN'
	| 'GAME_OVER';

export interface GameSettings {
	rulesVariant: RulesVariant;
	winAt: number;
	startCards: number;
	tokensStart: number;
	tokensMax: number;
	tokenEarnMode: TokenEarnMode;
	challengeMode: ChallengeMode;
	challengeSeconds: number;
	threeForOneEnabled: boolean;
	threeForOneCost: number;
	skipCost: number;
	hostPlays: boolean;
	/** Spotify placeholders — HIT-4 */
	playDurationSec: number;
	playOffsetSec: number;
	disconnectGraceSec: number;
	autoFlowDelayMs: number;
}

export interface Track {
	id: string;
	title: string;
	artist: string;
	year: number;
	/** Visual accent for mock / cards */
	mockColor: string;
	/** Spotify fields (HIT-4) — optional; mock deck omits these */
	spotifyUri?: string;
	previewUrl?: string | null;
	/** Album release year before override */
	spotifyYear?: number | null;
	yearOverride?: number | null;
	imageUrl?: string | null;
}

export interface TimelineCard {
	trackId: string;
	year: number;
	title: string;
	artist: string;
	revealed: boolean;
}

export interface Player {
	id: string;
	name: string;
	color: string;
	connected: boolean;
	isHost: boolean;
	tokens: number;
	timeline: TimelineCard[];
	order: number;
	/** Session token for reconnect */
	sessionToken: string;
}

export interface ChallengeClaim {
	playerId: string;
	/** Slot index relative to active player's timeline (0 = before first) */
	slotIndex: number;
	at: number;
}

export interface TurnState {
	activePlayerId: string | null;
	track: Track | null;
	lockedSlot: number | null;
	claims: ChallengeClaim[];
	challengeEndsAt: number | null;
	lastResolve: ResolveResult | null;
}

export interface ResolveResult {
	correct: boolean;
	activeKept: boolean;
	stolenBy: string | null;
	year: number;
	title: string;
	artist: string;
	message: string;
	/** Track that was resolved — for insert animation */
	trackId?: string;
}

export interface SpotifyRoomInfo {
	connected: boolean;
	tier: 'premium' | 'free' | 'unknown';
	displayName: string | null;
	playlistName: string | null;
	playlistId: string | null;
	source: 'mock' | 'spotify';
}

/** Pass-the-phone gate (single-device). UI dims until handoff_ack. */
export interface HandoffState {
	kind: 'guesser' | 'challenger' | 'reveal';
	playerId: string | null;
	playerName: string;
	message: string;
}

export interface RoomPublic {
	code: string;
	phase: GamePhase;
	settings: GameSettings;
	players: Omit<Player, 'sessionToken'>[];
	turnOrder: string[];
	turn: TurnState;
	winnerId: string | null;
	deckRemaining: number;
	playMode: 'multi' | 'single';
	createdAt: number;
	spotify: SpotifyRoomInfo;
	/** Single-device: whose challenge seat (null = multi / done / N/A) */
	challengeSeatId: string | null;
	/** Single-device: pass-phone overlay */
	handoff: HandoffState | null;
	/**
	 * Host must confirm title/artist for a viesje.
	 * While set, timers are frozen and clients should pause music.
	 */
	titleConfirm: {
		playerId: string;
		playerName: string;
		requestedAt: number;
	} | null;
}

export type ClientMessage =
	| { type: 'create'; name: string; settings?: Partial<GameSettings> }
	| { type: 'join'; code: string; name: string; sessionToken?: string }
	| { type: 'reconnect'; code: string; sessionToken: string }
	| { type: 'update_settings'; settings: Partial<GameSettings> }
	| { type: 'reorder'; playerIds: string[] }
	| { type: 'kick'; playerId: string }
	| { type: 'transfer_host'; playerId: string }
	| { type: 'leave' }
	| { type: 'start' }
	| { type: 'lock_slot'; slotIndex: number; asPlayerId?: string }
	| { type: 'challenge'; slotIndex: number; asPlayerId?: string }
	| { type: 'skip_turn'; asPlayerId?: string }
	| { type: 'skip_challenge'; asPlayerId?: string }
	| { type: 'three_for_one'; asPlayerId?: string }
	| { type: 'host_reveal' }
	| { type: 'host_skip_turn' }
	| { type: 'host_force_phase'; phase: GamePhase }
	| { type: 'token_earn_approve'; playerId: string }
	| { type: 'token_earn_deny' }
	| { type: 'request_token'; asPlayerId?: string }
	| { type: 'set_play_mode'; mode: 'multi' | 'single' }
	| { type: 'add_local_player'; name: string }
	| { type: 'remove_local_player'; playerId: string }
	| { type: 'handoff_ack' }
	| {
			type: 'set_deck';
			tracks: Track[];
			playlistName?: string;
			playlistId?: string;
			source?: 'mock' | 'spotify';
	  }
	| { type: 'set_year_override'; trackId: string; year: number | null }
	| {
			type: 'spotify_status';
			connected: boolean;
			tier: 'premium' | 'free' | 'unknown';
			displayName?: string | null;
	  };

export type ServerMessage =
	| { type: 'room'; room: RoomPublic; you: { playerId: string; sessionToken: string } }
	| { type: 'error'; message: string }
	| { type: 'notice'; message: string }
	| { type: 'pong' }
	| { type: 'kicked'; reason: string };
