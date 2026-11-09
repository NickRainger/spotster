import type { Handle } from '@sveltejs/kit/hooks';
import { setSpotifyEnv } from '#lib/spotify/config';

/** Load Spotify env from process (Vite/Node injects `.env` in dev). */
setSpotifyEnv({
	SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || process.env.PUBLIC_SPOTIFY_CLIENT_ID,
	PUBLIC_SPOTIFY_CLIENT_ID: process.env.PUBLIC_SPOTIFY_CLIENT_ID,
	SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
	SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI
});

export const handle: Handle = async ({ event, resolve }) => resolve(event);
