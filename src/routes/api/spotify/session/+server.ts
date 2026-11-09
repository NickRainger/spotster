import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSessionSummary } from '#lib/spotify/api';
import { spotifyConfigured } from '#lib/spotify/config';
import { SPOTIFY_SESSION_COOKIE } from '#lib/spotify/session-cookie';
import { deleteTokens } from '#lib/spotify/token-store';

export const GET: RequestHandler = async ({ cookies }) => {
	const sid = cookies.get(SPOTIFY_SESSION_COOKIE);
	if (!sid) {
		return json({ connected: false, configured: spotifyConfigured() });
	}
	const summary = await getSessionSummary(sid);
	return json(summary);
};

export const DELETE: RequestHandler = async ({ cookies }) => {
	const sid = cookies.get(SPOTIFY_SESSION_COOKIE);
	if (sid) deleteTokens(sid);
	cookies.delete(SPOTIFY_SESSION_COOKIE, { path: '/' });
	return json({ connected: false, configured: spotifyConfigured() });
};
