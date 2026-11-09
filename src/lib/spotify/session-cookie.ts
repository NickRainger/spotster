import { randomString } from './pkce';

export const SPOTIFY_SESSION_COOKIE = 'spotster_spotify_sid';
export const PKCE_COOKIE = 'spotster_spotify_pkce';

export function newSessionId() {
	return randomString(32);
}

export function cookieOpts(maxAge = 60 * 60 * 24 * 30) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: false,
		maxAge
	};
}
