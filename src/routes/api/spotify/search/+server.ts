import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchPlaylists, searchTracks } from '#lib/spotify/api';
import { requireAccessToken } from '#lib/spotify/request-auth';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const type = (url.searchParams.get('type') || 'all').toLowerCase();
	if (q.length < 2) return json({ tracks: [], playlists: [] });
	const auth = await requireAccessToken(cookies);
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
	try {
		const wantTracks = type === 'track' || type === 'all';
		const wantPlaylists = type === 'playlist' || type === 'all';
		const [tracks, playlists] = await Promise.all([
			wantTracks ? searchTracks(auth.accessToken, q) : Promise.resolve([]),
			wantPlaylists ? searchPlaylists(auth.accessToken, q) : Promise.resolve([])
		]);
		return json({ tracks, playlists });
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Search failed' }, { status: 502 });
	}
};
