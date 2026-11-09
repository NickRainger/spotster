import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPlaylistTracks } from '#lib/spotify/api';
import { requireAccessToken } from '#lib/spotify/request-auth';

export const GET: RequestHandler = async ({ cookies, params }) => {
	const auth = await requireAccessToken(cookies);
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
	try {
		const tracks = await getPlaylistTracks(auth.accessToken, params.id);
		return json({ tracks });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Tracks fetch failed' }, { status: 502 });
	}
};
