import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getValidAccessToken } from '#lib/spotify/api';
import { SPOTIFY_SESSION_COOKIE } from '#lib/spotify/session-cookie';
import { getTokens } from '#lib/spotify/token-store';

/** Short-lived access token for Web Playback SDK (host browser only). */
export const GET: RequestHandler = async ({ cookies }) => {
	const sid = cookies.get(SPOTIFY_SESSION_COOKIE);
	if (!sid) return json({ error: 'Niet verbonden' }, { status: 401 });
	const accessToken = await getValidAccessToken(sid);
	if (!accessToken) return json({ error: 'Sessie verlopen' }, { status: 401 });
	const tokens = getTokens(sid);
	return json({
		accessToken,
		expiresAt: tokens?.expiresAt ?? null,
		tier: tokens?.product ?? 'unknown'
	});
};
