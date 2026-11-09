import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPlaylists } from '#lib/spotify/api';
import { requireAccessToken } from '#lib/spotify/request-auth';

export const GET: RequestHandler = async ({ cookies }) => {
	const auth = await requireAccessToken(cookies);
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
	try {
		const playlists = await listPlaylists(auth.accessToken);
		return json({ playlists });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Playlist fetch failed' }, { status: 502 });
	}
};
