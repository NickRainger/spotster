import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchTracks } from '#lib/spotify/api';
import { requireAccessToken } from '#lib/spotify/request-auth';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < 2) return json({ tracks: [] });
	const auth = await requireAccessToken(cookies);
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
	try {
		const tracks = await searchTracks(auth.accessToken, q);
		return json({ tracks });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Search failed' }, { status: 502 });
	}
};
