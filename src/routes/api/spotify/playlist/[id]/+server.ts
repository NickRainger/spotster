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
		const msg = e instanceof Error ? e.message : 'Tracks fetch failed';
		const status = (e as { status?: number })?.status === 403 ? 403 : 502;
		const hint =
			status === 403
				? ' Spotify Dashboard → Settings → User Management: voeg je account toe (dev mode), of kies een andere playlist.'
				: '';
		return json({ error: msg + hint }, { status });
	}
};
