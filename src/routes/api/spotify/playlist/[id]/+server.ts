import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPlaylistTracks, getValidAccessToken } from '#lib/spotify/api';
import { SPOTIFY_SESSION_COOKIE } from '#lib/spotify/session-cookie';

export const GET: RequestHandler = async ({ cookies, params }) => {
	const sid = cookies.get(SPOTIFY_SESSION_COOKIE);
	if (!sid) return json({ error: 'Niet verbonden' }, { status: 401 });
	const token = await getValidAccessToken(sid);
	if (!token) return json({ error: 'Sessie verlopen' }, { status: 401 });
	try {
		const tracks = await getPlaylistTracks(token, params.id);
		return json({ tracks });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Tracks fetch failed' }, { status: 502 });
	}
};
