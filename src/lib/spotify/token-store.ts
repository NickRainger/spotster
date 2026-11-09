/**
 * Ephemeral Spotify token store (memory).
 * Keyed by Spotster host cookie — no DB in MVP.
 */

export interface SpotifyTokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	displayName: string | null;
	product: 'premium' | 'free' | 'unknown';
	email: string | null;
}

const store = new Map<string, SpotifyTokens>();

export function putTokens(sessionId: string, tokens: SpotifyTokens) {
	store.set(sessionId, tokens);
}

export function getTokens(sessionId: string): SpotifyTokens | undefined {
	return store.get(sessionId);
}

export function deleteTokens(sessionId: string) {
	store.delete(sessionId);
}

export function isExpired(tokens: SpotifyTokens, skewMs = 60_000) {
	return Date.now() >= tokens.expiresAt - skewMs;
}
