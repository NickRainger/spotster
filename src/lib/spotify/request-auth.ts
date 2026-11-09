import { ensureFreshTokens } from './api';
import { spotifyConfigured } from './config';
import {
	clearSpotifyCookie,
	readSpotifyCookie,
	writeSpotifyCookie,
	type CookieJar
} from './token-cookie';
import type { SpotifyTokens } from './token-store';

export async function loadFreshTokens(cookies: CookieJar): Promise<SpotifyTokens | null> {
	const current = readSpotifyCookie(cookies);
	if (!current) return null;
	try {
		const { tokens, refreshed } = await ensureFreshTokens(current);
		if (refreshed) writeSpotifyCookie(cookies, tokens);
		return tokens;
	} catch {
		clearSpotifyCookie(cookies);
		return null;
	}
}

export async function requireAccessToken(cookies: CookieJar): Promise<
	{ ok: true; accessToken: string; tokens: SpotifyTokens } | { ok: false; status: number; error: string }
> {
	if (!spotifyConfigured()) {
		return { ok: false, status: 503, error: 'Spotify niet geconfigureerd' };
	}
	const tokens = await loadFreshTokens(cookies);
	if (!tokens) return { ok: false, status: 401, error: 'Niet verbonden' };
	return { ok: true, accessToken: tokens.accessToken, tokens };
}
