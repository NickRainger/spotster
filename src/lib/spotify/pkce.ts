/** PKCE helpers (browser + server) */

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
	const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let str = '';
	for (const b of arr) str += String.fromCharCode(b);
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(length = 64): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return toBase64Url(bytes).slice(0, length);
}

export async function sha256Base64Url(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return toBase64Url(digest);
}

export async function createPkcePair() {
	const verifier = randomString(64);
	const challenge = await sha256Base64Url(verifier);
	return { verifier, challenge };
}
