/** Spotify env helpers. Prefer SvelteKit `$env/dynamic/private` in +server routes. */

export type SpotifyEnv = {
	SPOTIFY_CLIENT_ID?: string;
	PUBLIC_SPOTIFY_CLIENT_ID?: string;
	SPOTIFY_CLIENT_SECRET?: string;
	SPOTIFY_REDIRECT_URI?: string;
};

let runtimeEnv: SpotifyEnv = {};

/** Call once from server hooks/routes with `$env/dynamic/private` (+ public). */
export function setSpotifyEnv(env: SpotifyEnv) {
	runtimeEnv = { ...runtimeEnv, ...env };
}

function read(key: keyof SpotifyEnv): string {
	const fromRuntime = runtimeEnv[key];
	if (fromRuntime) return fromRuntime.trim();
	if (typeof process !== 'undefined' && process.env[key]) {
		return String(process.env[key]).trim();
	}
	return '';
}

export function spotifyConfigured(): boolean {
	return Boolean(getClientId());
}

export function getClientId(): string {
	return read('SPOTIFY_CLIENT_ID') || read('PUBLIC_SPOTIFY_CLIENT_ID');
}

export function getClientSecret(): string {
	return read('SPOTIFY_CLIENT_SECRET');
}

export function getRedirectUri(origin?: string): string {
	const fromEnv = read('SPOTIFY_REDIRECT_URI');
	if (fromEnv) return fromEnv;
	if (origin) return `${origin.replace(/\/$/, '')}/api/spotify/callback`;
	return 'http://localhost:5173/api/spotify/callback';
}

export const SPOTIFY_SCOPES = [
	'user-read-email',
	'user-read-private',
	'playlist-read-private',
	'playlist-read-collaborative',
	'user-library-read',
	'streaming',
	'user-read-playback-state',
	'user-modify-playback-state'
].join(' ');
