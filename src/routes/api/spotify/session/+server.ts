import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessionSummaryFromTokens } from '#lib/spotify/api';
import { spotifyConfigured } from '#lib/spotify/config';
import { loadFreshTokens } from '#lib/spotify/request-auth';
import { clearSpotifyCookie } from '#lib/spotify/token-cookie';

export const GET: RequestHandler = async ({ cookies }) => {
	const tokens = await loadFreshTokens(cookies);
	return json(sessionSummaryFromTokens(tokens, spotifyConfigured()));
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	clearSpotifyCookie(cookies);
	return json({ connected: false, configured: spotifyConfigured() });
};
