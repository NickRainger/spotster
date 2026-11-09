/**
 * Spotify integration stubs — full implementation in HIT-4.
 * Host OAuth PKCE + Web Playback SDK (Premium) / preview path (Free).
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
	/** TODO HIT-4: PKCE tokens stay server-side */
	hasRefreshToken: boolean;
}

export interface SpotifyPlayerPort {
	connect(): Promise<SpotifyHostSession>;
	disconnect(): Promise<void>;
	search(query: string): Promise<SpotifyTrackRef[]>;
	listPlaylists(): Promise<{ id: string; name: string }[]>;
	play(uri: string, opts: SpotifyPlaybackSettings): Promise<void>;
	pause(): Promise<void>;
	/** iOS/autoplay: must be called from user gesture on host */
	unlockAudio(): Promise<void>;
}

/** No-op stub used until HIT-4 wires real Spotify. */
export const spotifyStub: SpotifyPlayerPort = {
	async connect() {
		return {
			connected: false,
			tier: 'unknown',
			displayName: null,
			hasRefreshToken: false
		};
	},
	async disconnect() {},
	async search() {
		return [];
	},
	async listPlaylists() {
		return [];
	},
	async play() {
		console.info('[spotify stub] play — wire Web Playback in HIT-4');
	},
	async pause() {},
	async unlockAudio() {}
};
