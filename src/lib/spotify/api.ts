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
	/**
	 * Hint for UI: owned/liked usually load; followed often 403 under Spotify
	 * Development Mode. Always try the tracks endpoint on select — don't hard-block.
	 */
	kind: 'liked' | 'owned' | 'followed' | 'search';
	/** @deprecated prefer `kind`; kept for older clients */
	canLoadTracks: boolean;
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
		id?: string;
		display_name?: string;
		product?: string;
		email?: string;
	};
}

function toApiPath(urlOrPath: string): string {
	if (urlOrPath.startsWith('http')) return urlOrPath.replace(API, '');
	return urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
}

async function apiGet<T>(accessToken: string, path: string): Promise<T> {
	const res = await fetch(`${API}${toApiPath(path)}`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) {
		const text = await res.text();
		let detail = text;
		try {
			const j = JSON.parse(text) as { error?: { message?: string; status?: number } };
			detail = j.error?.message || text;
		} catch {
			/* keep raw */
		}
		const err = new Error(`Spotify ${res.status}: ${detail}`) as Error & { status?: number };
		err.status = res.status;
		throw err;
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
		items?: { total: number };
		collaborative?: boolean;
		owner?: { id?: string; display_name?: string };
	}[];
	next: string | null;
};

type PlaylistItemRow = {
	track?: Parameters<typeof mapTrack>[0] | boolean | null;
	item?: { track?: Parameters<typeof mapTrack>[0] | null } | Parameters<typeof mapTrack>[0] | null;
};

type TracksPage = {
	items: PlaylistItemRow[];
	next: string | null;
};

function trackFromPlaylistRow(row: PlaylistItemRow): SpotifyApiTrack | null {
	// Extended quota / classic: { track: TrackObject }
	if (row.track && typeof row.track === 'object') return mapTrack(row.track);
	// Dev-mode /items schema variants: { item: TrackObject } or { item: { track: TrackObject } }
	const nested = row.item;
	if (nested && typeof nested === 'object') {
		if ('track' in nested && nested.track && typeof nested.track === 'object') {
			return mapTrack(nested.track);
		}
		if ('id' in nested && 'uri' in nested) {
			return mapTrack(nested as Parameters<typeof mapTrack>[0]);
		}
	}
	return null;
}

export async function listPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
	const me = await fetchProfile(accessToken).catch(() => ({ id: undefined }));
	const myId = me.id;

	const out: SpotifyPlaylistSummary[] = [
		{
			id: 'liked',
			name: 'Liked Songs',
			image: null,
			tracksTotal: 0,
			owner: 'Jij',
			kind: 'liked',
			canLoadTracks: true
		}
	];
	try {
		const likedMeta = await apiGet<{ total?: number }>(accessToken, '/me/tracks?limit=1');
		out[0].tracksTotal = likedMeta.total ?? 0;
	} catch {
		/* liked stays with 0 — still selectable */
	}

	let url: string | null = '/me/playlists?limit=50';
	while (url) {
		const pageData: PlaylistPage = await apiGet<PlaylistPage>(accessToken, toApiPath(url));
		for (const p of pageData.items ?? []) {
			if (!p?.id) continue;
			// If profile id missing, assume owned so we still attempt track fetch
			const owned = !myId || p.owner?.id === myId;
			out.push({
				id: p.id,
				name: p.name,
				image: p.images?.[0]?.url ?? null,
				tracksTotal: p.tracks?.total ?? p.items?.total ?? 0,
				owner: p.owner?.display_name ?? '',
				kind: owned ? 'owned' : 'followed',
				// Always selectable — Spotify may still 403 followed lists; we probe on click
				canLoadTracks: true
			});
		}
		url = pageData.next ? toApiPath(pageData.next) : null;
		if (out.length > 200) break;
	}

	// Liked + owned first, then followed (library / “opgeslagen”)
	const rank = (k: SpotifyPlaylistSummary['kind']) =>
		k === 'liked' ? 2 : k === 'owned' ? 1 : 0;
	return out.sort((a, b) => rank(b.kind) - rank(a.kind) || a.name.localeCompare(b.name));
}

async function fetchTracksPage(
	accessToken: string,
	startPath: string
): Promise<SpotifyApiTrack[]> {
	const out: SpotifyApiTrack[] = [];
	let url: string | null = startPath;
	while (url) {
		const pageData: TracksPage = await apiGet<TracksPage>(accessToken, toApiPath(url));
		for (const row of pageData.items ?? []) {
			const t = trackFromPlaylistRow(row);
			if (t) out.push(t);
		}
		url = pageData.next ? toApiPath(pageData.next) : null;
		if (out.length > 500) break;
	}
	return out;
}

type SavedTracksPage = {
	items: { track: Parameters<typeof mapTrack>[0] }[];
	next: string | null;
	total?: number;
};

/** Liked Songs (/me/tracks) — not a normal playlist id. */
export async function getLikedTracks(accessToken: string): Promise<SpotifyApiTrack[]> {
	const out: SpotifyApiTrack[] = [];
	let url: string | null = '/me/tracks?limit=50';
	while (url) {
		const pageData: SavedTracksPage = await apiGet<SavedTracksPage>(accessToken, toApiPath(url));
		for (const row of pageData.items ?? []) {
			const t = mapTrack(row.track);
			if (t) out.push(t);
		}
		url = pageData.next ? toApiPath(pageData.next) : null;
		if (out.length > 500) break;
	}
	return out;
}

export async function getPlaylistTracks(
	accessToken: string,
	playlistId: string
): Promise<SpotifyApiTrack[]> {
	if (playlistId === 'liked' || playlistId === 'liked-songs') {
		return getLikedTracks(accessToken);
	}

	const id = encodeURIComponent(playlistId);
	// Spotify Dev Mode prefers /items; Extended Quota still serves /tracks.
	// 403 = not owner/collaborator (API policy) — not fixable client-side.
	const attempts = [
		`/playlists/${id}/items?limit=50&additional_types=track`,
		`/playlists/${id}/tracks?limit=100&additional_types=track`,
		`/playlists/${id}/tracks?limit=100&market=NL&additional_types=track`
	];

	let lastErr: unknown;
	for (const path of attempts) {
		try {
			return await fetchTracksPage(accessToken, path);
		} catch (e) {
			lastErr = e;
			const status = (e as { status?: number })?.status;
			if (status !== 403 && status !== 404) throw e;
		}
	}
	const err = new Error(
		'Spotify deelt tracks van deze lijst niet via de API (403) — typisch bij gevolgde/opgeslagen lijsten van anderen. Workaround: in Spotify de playlist openen → “Maak een kopie” / “Add to your profile”, daarna hier die kopie kiezen. Of kies Liked Songs / een lijst die jij bezit.'
	) as Error & { status?: number };
	err.status = 403;
	throw err;
}

export async function searchTracks(accessToken: string, q: string): Promise<SpotifyApiTrack[]> {
	const page = await apiGet<{
		tracks?: { items: Parameters<typeof mapTrack>[0][] };
	}>(accessToken, `/search?type=track&limit=20&q=${encodeURIComponent(q)}`);
	return (page.tracks?.items ?? []).map(mapTrack).filter((t): t is SpotifyApiTrack => !!t);
}

export async function searchPlaylists(
	accessToken: string,
	q: string
): Promise<SpotifyPlaylistSummary[]> {
	const page = await apiGet<{
		playlists?: {
			items: {
				id?: string;
				name?: string;
				images?: { url: string }[];
				tracks?: { total?: number };
				owner?: { display_name?: string };
			}[];
		};
	}>(accessToken, `/search?type=playlist&limit=20&q=${encodeURIComponent(q)}`);
	return (page.playlists?.items ?? [])
		.filter((p): p is NonNullable<typeof p> & { id: string; name: string } => !!p?.id && !!p.name)
		.map((p) => ({
			id: p.id,
			name: p.name,
			image: p.images?.[0]?.url ?? null,
			tracksTotal: p.tracks?.total ?? 0,
			owner: p.owner?.display_name ?? '',
			kind: 'search' as const,
			// Try on select — search hits often 403, but we don't pre-block
			canLoadTracks: true
		}));
}
