import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getValidAccessToken, searchTracks } from '#lib/spotify/api';
import { SPOTIFY_SESSION_COOKIE } from '#lib/spotify/session-cookie';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) return json({ tracks: [] });
	const sid = cookies.get(SPOTIFY_SESSION_COOKIE);
	if (!sid) return json({ error: 'Niet verbonden' }, { status: 401 });
	const token = await getValidAccessToken(sid);
	if (!token) return json({ error: 'Sessie verlopen' }, { status: 401 });
	try {
		const tracks = await searchTracks(token, q);
		return json({ tracks });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Search failed' }, { status: 502 });
	}
};
