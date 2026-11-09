/**
 * Spotify shared types + no-op stub.
 * Real OAuth/API: `#lib/spotify/api`, playback: `#lib/spotify/player`.
 */

export type SpotifyAccountTier = 'premium' | 'free' | 'unknown';

export interface SpotifyPlaybackSettings {
	playDurationSec: number;
	playOffsetSec: number;
}

export interface SpotifyTrackRef {
	spotifyUri: string;
	title: string;
	artist: string;
	year: number | null;
	previewUrl: string | null;
	yearOverride?: number;
}

export interface SpotifyHostSession {
	connected: boolean;
	tier: SpotifyAccountTier;
	displayName: string | null;
	hasRefreshToken: boolean;
}

export interface SpotifyPlayerPort {
	connect(): Promise<SpotifyHostSession>;
	disconnect(): Promise<void>;
	search(query: string): Promise<SpotifyTrackRef[]>;
	listPlaylists(): Promise<{ id: string; name: string }[]>;
	play(uri: string, opts: SpotifyPlaybackSettings): Promise<void>;
	pause(): Promise<void>;
	unlockAudio(): Promise<void>;
}

/** Fallback when env/OAuth missing — UI uses API routes + HostSpotifyPlayer instead. */
export const spotifyStub: SpotifyPlayerPort = {
	async connect() {
		return { connected: false, tier: 'unknown', displayName: null, hasRefreshToken: false };
	},
	async disconnect() {},
	async search() {
		return [];
	},
	async listPlaylists() {
		return [];
	},
	async play() {
		console.info('[spotify] stub play — connect Spotify in lobby');
	},
	async pause() {},
	async unlockAudio() {}
};
