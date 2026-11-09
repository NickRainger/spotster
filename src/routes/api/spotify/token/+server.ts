import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAccessToken } from '#lib/spotify/request-auth';

/** Short-lived access token for Web Playback SDK (host browser only). */
export const GET: RequestHandler = async ({ cookies }) => {
	const auth = await requireAccessToken(cookies);
	if (!auth.ok) return json({ error: auth.error }, { status: auth.status });
	return json({
		accessToken: auth.accessToken,
		expiresAt: auth.tokens.expiresAt,
		tier: auth.tokens.product
	});
};
