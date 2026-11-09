import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getClientId, getRedirectUri, SPOTIFY_SCOPES, spotifyConfigured } from '#lib/spotify/config';
import { createPkcePair, randomString } from '#lib/spotify/pkce';
import { cookieOpts, PKCE_COOKIE } from '#lib/spotify/session-cookie';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!spotifyConfigured()) {
		return new Response(
			JSON.stringify({
				error: 'Spotify niet geconfigureerd',
				hint: 'Zet SPOTIFY_CLIENT_ID (en optioneel SPOTIFY_CLIENT_SECRET) in .env'
			}),
			{ status: 503, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const { verifier, challenge } = await createPkcePair();
	const state = randomString(24);
	const returnTo = url.searchParams.get('returnTo') || '/';

	const secure =
		typeof process !== 'undefined' &&
		(process.env.NODE_ENV === 'production' || process.env.VERCEL === '1');
	cookies.set(PKCE_COOKIE, JSON.stringify({ verifier, state, returnTo }), {
		...cookieOpts(600),
		secure
	});

	const origin = url.origin;
	const params = new URLSearchParams({
		client_id: getClientId(),
		response_type: 'code',
		redirect_uri: getRedirectUri(origin),
		scope: SPOTIFY_SCOPES,
		state,
		code_challenge_method: 'S256',
		code_challenge: challenge
	});
	// Force consent screen so scopes refresh after Spotify Dashboard changes
	if (url.searchParams.get('force') === '1') {
		params.set('show_dialog', 'true');
	}

	// SvelteKit 3: externe redirect vereist { external: true }, anders 500
	throw redirect(302, `https://accounts.spotify.com/authorize?${params}`, {
		external: true
	});
};
