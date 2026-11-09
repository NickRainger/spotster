import type {
	ChallengeClaim,
	GamePhase,
	GameSettings,
	Player,
	ResolveResult,
	TimelineCard,
	Track,
	TurnState
} from './types';

/** Slot i is valid if year sits between left neighbor and right neighbor (inclusive same-year both sides). */
export function isSlotCorrect(timeline: TimelineCard[], slotIndex: number, year: number): boolean {
	const left = slotIndex > 0 ? timeline[slotIndex - 1] : null;
	const right = slotIndex < timeline.length ? timeline[slotIndex] : null;
	if (left && year < left.year) return false;
	if (right && year > right.year) return false;
	// Same year allowed on either side of equal neighbor
	if (left && year === left.year) return true;
	if (right && year === right.year) return true;
	if (left && right) return year >= left.year && year <= right.year;
	if (left) return year >= left.year;
	if (right) return year <= right.year;
	return true; // empty timeline — any year ok
}

/** First valid insert index for `year` on a timeline (used when stealing onto challenger's board). */
export function firstCorrectSlot(timeline: TimelineCard[], year: number): number {
	for (let i = 0; i <= timeline.length; i++) {
		if (isSlotCorrect(timeline, i, year)) return i;
	}
	return timeline.length;
}

export function insertCard(timeline: TimelineCard[], slotIndex: number, card: TimelineCard): TimelineCard[] {
	const next = [...timeline];
	next.splice(slotIndex, 0, card);
	return next;
}

export function toCard(track: Track, revealed = true): TimelineCard {
	return {
		trackId: track.id,
		year: track.year,
		title: track.title,
		artist: track.artist,
		revealed
	};
}

export function resolveTurn(
	active: Player,
	track: Track,
	lockedSlot: number,
	claims: ChallengeClaim[],
	players: Player[]
): { result: ResolveResult; players: Player[] } {
	const correct = isSlotCorrect(active.timeline, lockedSlot, track.year);
	const card = toCard(track, true);
	let nextPlayers = players.map((p) => ({ ...p, timeline: [...p.timeline] }));
	const activeIdx = nextPlayers.findIndex((p) => p.id === active.id);
	let stolenBy: string | null = null;
	let activeKept = false;
	let message = '';

	if (correct) {
		nextPlayers[activeIdx].timeline = insertCard(nextPlayers[activeIdx].timeline, lockedSlot, card);
		activeKept = true;
		message = `${active.name} plaatste goed — ${track.year}!`;
	} else {
		// Claims sit on the *active* player's board (where challengers say the track belongs).
		// First challenger who pointed at a correct slot on that board steals onto their own timeline.
		const sorted = [...claims].sort((a, b) => a.at - b.at);
		for (const claim of sorted) {
			const challenger = nextPlayers.find((p) => p.id === claim.playerId);
			if (!challenger || claim.playerId === active.id) continue;
			if (!isSlotCorrect(active.timeline, claim.slotIndex, track.year)) continue;
			const ci = nextPlayers.findIndex((p) => p.id === claim.playerId);
			const stealSlot = firstCorrectSlot(nextPlayers[ci].timeline, track.year);
			nextPlayers[ci].timeline = insertCard(nextPlayers[ci].timeline, stealSlot, card);
			stolenBy = claim.playerId;
			message = `${challenger.name} steelt met een viesje! (${track.year})`;
			break;
		}
		if (!stolenBy) {
			message = `Mis — ${track.title} is uit ${track.year}. Kaart weg.`;
		}
	}

	const result: ResolveResult = {
		correct,
		activeKept,
		stolenBy,
		year: track.year,
		title: track.title,
		artist: track.artist,
		message,
		trackId: track.id
	};
	return { result, players: nextPlayers };
}

export function checkWinner(players: Player[], winAt: number): string | null {
	for (const p of players) {
		if (p.timeline.length >= winAt) return p.id;
	}
	return null;
}

export function nextPlayerId(turnOrder: string[], currentId: string | null): string | null {
	if (!turnOrder.length) return null;
	if (!currentId) return turnOrder[0];
	const i = turnOrder.indexOf(currentId);
	if (i < 0) return turnOrder[0];
	return turnOrder[(i + 1) % turnOrder.length];
}

export function emptyTurn(): TurnState {
	return {
		activePlayerId: null,
		track: null,
		lockedSlot: null,
		claims: [],
		challengeEndsAt: null,
		lastResolve: null
	};
}

export const PHASE_LABELS: Record<GamePhase, string> = {
	lobby: 'Lobby',
	WAITING_TURN: 'Beurt',
	HOST_PLAYING: 'Nummer speelt',
	GUESSING: 'Plaats de hit',
	GUESS_LOCKED: 'Vastgezet',
	CHALLENGE_WINDOW: 'Viesjes!',
	REVEAL: 'Reveal',
	RESOLVE: 'Score',
	CHECK_WIN: 'Check',
	GAME_OVER: 'Gewonnen'
};

export function playerViewTokensOk(settings: GameSettings, tokens: number, cost: number) {
	return tokens >= cost;
}
