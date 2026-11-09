import { getClientId, getClientSecret, getRedirectUri } from './config';
import type { SpotifyTokens } from './token-store';
import { isExpired } from './token-store';

const AUTH = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

export interface SpotifyPlaylistSummary {
	id: string;
	name: string;
	image: string | null;
	tracksTotal: number;
	owner: string;
}

export interface SpotifyApiTrack {
	id: string;
	uri: string;
	name: string;
	artists: string[];
	album: string;
	releaseDate: string | null;
	year: number | null;
	previewUrl: string | null;
	durationMs: number;
	image: string | null;
}

export async function exchangeCode(opts: {
	code: string;
	verifier: string;
	origin?: string;
}): Promise<SpotifyTokens> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code: opts.code,
		redirect_uri: getRedirectUri(opts.origin),
		client_id: getClientId(),
		code_verifier: opts.verifier
	});
	const secret = getClientSecret();
	const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
	if (secret) {
		headers.Authorization = `Basic ${Buffer.from(`${getClientId()}:${secret}`).toString('base64')}`;
	}
	const res = await fetch(`${AUTH}/api/token`, { method: 'POST', headers, body });
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Token exchange failed: ${res.status} ${text}`);
	}
	const json = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	const profile = await fetchProfile(json.access_token);
	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token,
		expiresAt: Date.now() + json.expires_in * 1000,
		displayName: profile.display_name ?? null,
		product: profile.product === 'premium' ? 'premium' : profile.product === 'free' ? 'free' : 'unknown',
		email: profile.email ?? null
	};
}

export async function refreshTokens(tokens: SpotifyTokens): Promise<SpotifyTokens> {
	const body = new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: tokens.refreshToken,
		client_id: getClientId()
	});
	const secret = getClientSecret();
	const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
	if (secret) {
		headers.Authorization = `Basic ${Buffer.from(`${getClientId()}:${secret}`).toString('base64')}`;
	}
	const res = await fetch(`${AUTH}/api/token`, { method: 'POST', headers, body });
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Refresh failed: ${res.status} ${text}`);
	}
	const json = (await res.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in: number;
	};
	return {
		...tokens,
		accessToken: json.access_token,
		refreshToken: json.refresh_token ?? tokens.refreshToken,
		expiresAt: Date.now() + json.expires_in * 1000
	};
}

/** Ensure access token is fresh; returns updated tokens if refreshed. */
export async function ensureFreshTokens(
	tokens: SpotifyTokens
): Promise<{ tokens: SpotifyTokens; refreshed: boolean }> {
	if (!isExpired(tokens)) return { tokens, refreshed: false };
	const next = await refreshTokens(tokens);
	return { tokens: next, refreshed: true };
}

export function sessionSummaryFromTokens(tokens: SpotifyTokens | null, configured: boolean) {
	if (!tokens) return { connected: false as const, configured };
	return {
		connected: true as const,
		configured: true,
		displayName: tokens.displayName,
		tier: tokens.product,
		email: tokens.email
	};
}

async function fetchProfile(accessToken: string) {
	const res = await fetch(`${API}/me`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error('Failed to fetch Spotify profile');
	return (await res.json()) as {
		display_name?: string;
		product?: string;
		email?: string;
	};
}

async function apiGet<T>(accessToken: string, path: string): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Spotify API ${path}: ${res.status} ${text}`);
	}
	return (await res.json()) as T;
}

function yearFromRelease(date: string | null | undefined): number | null {
	if (!date) return null;
	const y = Number(date.slice(0, 4));
	return Number.isFinite(y) && y > 1900 && y < 2100 ? y : null;
}

function mapTrack(item: {
	id?: string;
	uri?: string;
	name?: string;
	artists?: { name: string }[];
	album?: { name?: string; release_date?: string; images?: { url: string }[] };
	preview_url?: string | null;
	duration_ms?: number;
} | null): SpotifyApiTrack | null {
	if (!item?.id || !item.uri) return null;
	const releaseDate = item.album?.release_date ?? null;
	return {
		id: item.id,
		uri: item.uri,
		name: item.name ?? 'Unknown',
		artists: (item.artists ?? []).map((a) => a.name),
		album: item.album?.name ?? '',
		releaseDate,
		year: yearFromRelease(releaseDate),
		previewUrl: item.preview_url ?? null,
		durationMs: item.duration_ms ?? 0,
		image: item.album?.images?.[0]?.url ?? null
	};
}

type PlaylistPage = {
	items: {
		id: string;
		name: string;
		images?: { url: string }[];
		tracks?: { total: number };
		owner?: { display_name?: string };
	}[];
	next: string | null;
};

type TracksPage = {
	items: { track: Parameters<typeof mapTrack>[0] }[];
	next: string | null;
};

export async function listPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
	const out: SpotifyPlaylistSummary[] = [];
	let url: string | null = '/me/playlists?limit=50';
	while (url) {
		const pageData: PlaylistPage = await apiGet<PlaylistPage>(accessToken, url.replace(API, ''));
		for (const p of pageData.items ?? []) {
			out.push({
				id: p.id,
				name: p.name,
				image: p.images?.[0]?.url ?? null,
				tracksTotal: p.tracks?.total ?? 0,
				owner: p.owner?.display_name ?? ''
			});
		}
		url = pageData.next ? pageData.next.replace(API, '') : null;
		if (out.length > 200) break;
	}
	return out;
}

export async function getPlaylistTracks(accessToken: string, playlistId: string): Promise<SpotifyApiTrack[]> {
	const out: SpotifyApiTrack[] = [];
	let url: string | null = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&market=from_token`;
	while (url) {
		const pageData: TracksPage = await apiGet<TracksPage>(accessToken, url.replace(API, ''));
		for (const row of pageData.items ?? []) {
			const t = mapTrack(row.track);
			if (t) out.push(t);
		}
		url = pageData.next ? pageData.next.replace(API, '') : null;
		if (out.length > 500) break;
	}
	return out;
}

export async function searchTracks(accessToken: string, q: string): Promise<SpotifyApiTrack[]> {
	const page = await apiGet<{
		tracks?: { items: Parameters<typeof mapTrack>[0][] };
	}>(accessToken, `/search?type=track&limit=20&q=${encodeURIComponent(q)}`);
	return (page.tracks?.items ?? []).map(mapTrack).filter((t): t is SpotifyApiTrack => !!t);
}
