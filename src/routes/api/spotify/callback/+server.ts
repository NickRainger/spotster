import { isRedirect, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode } from '#lib/spotify/api';
import { PKCE_COOKIE } from '#lib/spotify/session-cookie';
import { writeSpotifyCookie } from '#lib/spotify/token-cookie';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const err = url.searchParams.get('error');

	const raw = cookies.get(PKCE_COOKIE);
	cookies.delete(PKCE_COOKIE, { path: '/' });

	let pkce: { verifier: string; state: string; returnTo: string } | null = null;
	try {
		pkce = raw ? JSON.parse(raw) : null;
	} catch {
		pkce = null;
	}

	if (err) {
		throw redirect(
			302,
			`${pkce?.returnTo || '/'}?spotify=error&reason=${encodeURIComponent(err)}`
		);
	}
	if (!code || !pkce || !state || state !== pkce.state) {
		throw redirect(302, `${pkce?.returnTo || '/'}?spotify=error&reason=invalid_state`);
	}

	try {
		const tokens = await exchangeCode({
			code,
			verifier: pkce.verifier,
			origin: url.origin
		});
		writeSpotifyCookie(cookies, tokens);
		throw redirect(302, `${pkce.returnTo || '/'}?spotify=connected`);
	} catch (e) {
		if (isRedirect(e)) throw e;
		const reason = e instanceof Error ? e.message : 'exchange_failed';
		throw redirect(
			302,
			`${pkce.returnTo || '/'}?spotify=error&reason=${encodeURIComponent(reason)}`
		);
	}
};
