import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getValidAccessToken, listPlaylists } from '#lib/spotify/api';
import { SPOTIFY_SESSION_COOKIE } from '#lib/spotify/session-cookie';

export const GET: RequestHandler = async ({ cookies }) => {
	const sid = cookies.get(SPOTIFY_SESSION_COOKIE);
	if (!sid) return json({ error: 'Niet verbonden' }, { status: 401 });
	const token = await getValidAccessToken(sid);
	if (!token) return json({ error: 'Sessie verlopen' }, { status: 401 });
	try {
		const playlists = await listPlaylists(token);
		return json({ playlists });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Playlist fetch failed' }, { status: 502 });
	}
};
