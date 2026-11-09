/**
 * Spotify tokens in an encrypted httpOnly cookie.
 * Works on Vercel serverless (no shared memory) and on long-lived Node.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getClientId, getClientSecret } from './config';
import { cookieOpts, SPOTIFY_SESSION_COOKIE } from './session-cookie';
import type { SpotifyTokens } from './token-store';

/** Minimal cookie jar (SvelteKit `cookies` API). */
export interface CookieJar {
	get(name: string): string | undefined;
	set(name: string, value: string, opts: Record<string, unknown>): void;
	delete(name: string, opts: { path?: string }): void;
}

function secretKey(): Buffer {
	const raw =
		(typeof process !== 'undefined' && process.env.SPOTIFY_COOKIE_SECRET) ||
		getClientSecret() ||
		getClientId() ||
		'spotster-dev-insecure';
	return createHash('sha256').update(raw).digest();
}

export function encryptTokens(tokens: SpotifyTokens): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
	const plaintext = Buffer.from(JSON.stringify(tokens), 'utf8');
	const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function decryptTokens(payload: string): SpotifyTokens | null {
	try {
		const buf = Buffer.from(payload, 'base64url');
		if (buf.length < 28) return null;
		const iv = buf.subarray(0, 12);
		const tag = buf.subarray(12, 28);
		const data = buf.subarray(28);
		const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv);
		decipher.setAuthTag(tag);
		const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
		return JSON.parse(plain) as SpotifyTokens;
	} catch {
		return null;
	}
}

export function productionCookie() {
	const secure =
		typeof process !== 'undefined' &&
		(process.env.NODE_ENV === 'production' || process.env.VERCEL === '1');
	return { ...cookieOpts(), secure, sameSite: 'lax' as const };
}

export function writeSpotifyCookie(cookies: CookieJar, tokens: SpotifyTokens) {
	cookies.set(SPOTIFY_SESSION_COOKIE, encryptTokens(tokens), productionCookie());
}

export function clearSpotifyCookie(cookies: CookieJar) {
	cookies.delete(SPOTIFY_SESSION_COOKIE, { path: '/' });
}

export function readSpotifyCookie(cookies: CookieJar): SpotifyTokens | null {
	const raw = cookies.get(SPOTIFY_SESSION_COOKIE);
	if (!raw) return null;
	return decryptTokens(raw);
}
