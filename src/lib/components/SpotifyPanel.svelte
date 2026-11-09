<script lang="ts">
	import { gameClient } from '#lib/ws/client';
	import { hostPlayer } from '#lib/spotify/player';
	import type { Track } from '#lib/game/types';

	interface Props {
		roomCode: string;
		disabled?: boolean;
		spotify: {
			connected: boolean;
			tier: 'premium' | 'free' | 'unknown';
			displayName: string | null;
			playlistName: string | null;
			playlistId: string | null;
			source: 'mock' | 'spotify';
		};
		deckRemaining: number;
	}

	let { roomCode, disabled = false, spotify, deckRemaining }: Props = $props();

	let configured = $state(true);
	let connected = $state(false);
	let tier = $state<'premium' | 'free' | 'unknown'>('unknown');
	let displayName = $state<string | null>(null);
	let playlists = $state<{ id: string; name: string; tracksTotal: number; image: string | null }[]>(
		[]
	);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchQ = $state('');
	let searchHits = $state<
		{
			id: string;
			uri: string;
			name: string;
			artists: string[];
			year: number | null;
			previewUrl: string | null;
		}[]
	>([]);
	let yearEdits = $state<Record<string, string>>({});
	let loadedTracks = $state<Track[]>([]);
	let showOverrides = $state(false);

	async function refreshSession() {
		const s = await fetch('/api/spotify/session').then((r) => r.json());
		configured = !!s.configured;
		connected = !!s.connected;
		tier = s.tier ?? 'unknown';
		displayName = s.displayName ?? null;
		gameClient.send({
			type: 'spotify_status',
			connected,
			tier,
			displayName
		});
		if (connected) {
			await loadPlaylists();
			void hostPlayer?.initFromSession();
		}
	}

	async function loadPlaylists() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/spotify/playlists').then((r) => r.json());
			if (res.error) throw new Error(res.error);
			playlists = res.playlists ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Playlists laden mislukt';
		} finally {
			loading = false;
		}
	}

	async function selectPlaylist(id: string, name: string) {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/spotify/playlist/${encodeURIComponent(id)}`).then((r) =>
				r.json()
			);
			if (res.error) throw new Error(res.error);
			const tracks: Track[] = (res.tracks ?? [])
				.filter((t: { year: number | null }) => t.year)
				.map(
					(
						t: {
							id: string;
							uri: string;
							name: string;
							artists: string[];
							year: number;
							previewUrl: string | null;
							image: string | null;
						},
						i: number
					) => ({
						id: t.id,
						title: t.name,
						artist: t.artists.join(', '),
						year: t.year,
						spotifyYear: t.year,
						spotifyUri: t.uri,
						previewUrl: t.previewUrl,
						imageUrl: t.image,
						mockColor: ['#e11d48', '#f59e0b', '#0ea5e9', '#22c55e', '#a855f7'][i % 5]
					})
				);
			if (tracks.length < 5) {
				throw new Error(
					`Te weinig tracks met jaartal (${tracks.length}). Kies een grotere playlist.`
				);
			}
			loadedTracks = tracks;
			yearEdits = Object.fromEntries(tracks.map((t) => [t.id, String(t.year)]));
			gameClient.send({
				type: 'set_deck',
				tracks,
				playlistId: id,
				playlistName: name,
				source: 'spotify'
			});
			await hostPlayer?.unlockAudio();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Playlist laden mislukt';
		} finally {
			loading = false;
		}
	}

	async function runSearch() {
		if (searchQ.trim().length < 2) return;
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(searchQ)}`).then((r) =>
				r.json()
			);
			if (res.error) throw new Error(res.error);
			searchHits = res.tracks ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Zoeken mislukt';
		} finally {
			loading = false;
		}
	}

	function addSearchTrack(t: (typeof searchHits)[0]) {
		if (!t.year) {
			error = 'Geen releasejaar op deze track';
			return;
		}
		const track: Track = {
			id: t.id,
			title: t.name,
			artist: t.artists.join(', '),
			year: t.year,
			spotifyYear: t.year,
			spotifyUri: t.uri,
			previewUrl: t.previewUrl,
			mockColor: '#2dd4bf'
		};
		const next = [...loadedTracks.filter((x) => x.id !== track.id), track];
		loadedTracks = next;
		yearEdits = { ...yearEdits, [track.id]: String(track.year) };
		gameClient.send({
			type: 'set_deck',
			tracks: next,
			playlistName: spotify.playlistName ?? 'Custom mix',
			playlistId: spotify.playlistId ?? 'custom',
			source: 'spotify'
		});
	}

	function applyOverride(trackId: string) {
		const raw = yearEdits[trackId];
		const year = raw === '' || raw == null ? null : Number(raw);
		if (year != null && (!Number.isFinite(year) || year < 1900 || year > 2099)) {
			error = 'Jaar moet tussen 1900–2099';
			return;
		}
		gameClient.send({ type: 'set_year_override', trackId, year });
		loadedTracks = loadedTracks.map((t) =>
			t.id === trackId ? { ...t, yearOverride: year, year: year ?? t.spotifyYear ?? t.year } : t
		);
	}

	function resetToMock() {
		gameClient.send({ type: 'set_deck', tracks: [], source: 'mock' });
		loadedTracks = [];
	}

	$effect(() => {
		void refreshSession();
	});
</script>

<div class="space-y-4 rounded-3xl border border-white/10 bg-base-200/50 p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="font-display text-2xl">Spotify</h2>
			<p class="text-sm text-white/50">Host playback in-browser · Premium of preview</p>
		</div>
		{#if connected}
			<span class="badge badge-lg border-0 bg-secondary/20 text-secondary">
				{tier === 'premium' ? 'Premium' : tier === 'free' ? 'Free / preview' : 'Connected'}
			</span>
		{:else if !configured}
			<span class="badge badge-warning badge-lg">Env niet gezet</span>
		{/if}
	</div>

	{#if !configured}
		<div class="rounded-2xl border border-warning/30 bg-warning/10 p-3 text-sm">
			<p class="font-semibold text-warning">Spotify OAuth niet geconfigureerd</p>
			<p class="mt-1 text-white/70">
				Zet in <code class="text-accent">.env</code>:
				<code class="text-accent">SPOTIFY_CLIENT_ID</code>, optioneel
				<code class="text-accent">SPOTIFY_CLIENT_SECRET</code>, en
				<code class="text-accent">SPOTIFY_REDIRECT_URI</code>
				(= <code class="text-xs">http://localhost:5173/api/spotify/callback</code>).
			</p>
			<p class="mt-2 text-white/50">Zonder secrets speel je door met het mock-deck.</p>
		</div>
	{:else if !connected}
		<a
			class="btn btn-primary"
			href="/api/spotify/login?returnTo={encodeURIComponent(`/room/${roomCode}`)}"
			class:btn-disabled={disabled}>Connect Spotify</a
		>
	{:else}
		<div class="flex flex-wrap items-center gap-2 text-sm">
			<span class="text-white/70">Ingelogd als <strong>{displayName ?? 'host'}</strong></span>
			<button
				class="btn btn-ghost btn-xs"
				disabled={disabled}
				onclick={async () => {
					await fetch('/api/spotify/session', { method: 'DELETE' });
					await refreshSession();
				}}>Disconnect</button
			>
			<button
				class="btn btn-ghost btn-xs"
				disabled={disabled}
				onclick={() => {
					void hostPlayer?.unlockAudio();
					void hostPlayer?.initFromSession();
				}}>Unlock audio</button
			>
		</div>
	{/if}

	{#if error}
		<p class="text-sm text-error">{error}</p>
	{/if}

	{#if connected}
		<div>
			<p class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Jouw playlists</p>
			{#if loading && !playlists.length}
				<span class="loading loading-spinner loading-sm text-primary"></span>
			{/if}
			<ul class="max-h-48 space-y-1 overflow-y-auto">
				{#each playlists as p}
					<li>
						<button
							type="button"
							class="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:border-primary/40"
							disabled={disabled || loading}
							onclick={() => selectPlaylist(p.id, p.name)}
						>
							<span class="truncate font-medium">{p.name}</span>
							<span class="text-xs text-white/40">{p.tracksTotal}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>

		<div class="flex gap-2">
			<input
				class="input input-bordered flex-1"
				placeholder="Zoek track…"
				bind:value={searchQ}
				disabled={disabled}
				onkeydown={(e) => e.key === 'Enter' && runSearch()}
			/>
			<button class="btn btn-outline" disabled={disabled || loading} onclick={runSearch}>Zoek</button>
		</div>
		{#if searchHits.length}
			<ul class="max-h-36 space-y-1 overflow-y-auto text-sm">
				{#each searchHits as t}
					<li class="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1">
						<span class="truncate"
							>{t.name}
							<span class="text-white/40">· {t.artists.join(', ')} · {t.year ?? '?'}</span></span
						>
						<button
							class="btn btn-ghost btn-xs"
							disabled={disabled || !t.year}
							onclick={() => addSearchTrack(t)}>+</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<div class="rounded-2xl border border-dashed border-white/15 bg-white/5 p-3 text-sm">
		<p>
			Deck:
			<strong>{spotify.source === 'spotify' ? spotify.playlistName ?? 'Spotify' : 'Mock hits'}</strong>
			· {deckRemaining || (spotify.source === 'spotify' ? loadedTracks.length : '40')} tracks
		</p>
		<div class="mt-2 flex flex-wrap gap-2">
			<button class="btn btn-ghost btn-xs" disabled={disabled} onclick={resetToMock}>Gebruik mock-deck</button>
			{#if spotify.source === 'spotify' && loadedTracks.length}
				<button class="btn btn-ghost btn-xs" onclick={() => (showOverrides = !showOverrides)}>
					Year overrides {showOverrides ? '−' : '+'}
				</button>
			{/if}
		</div>
		{#if showOverrides}
			<ul class="mt-2 max-h-40 space-y-1 overflow-y-auto">
				{#each loadedTracks.slice(0, 40) as t}
					<li class="flex items-center gap-2">
						<span class="min-w-0 flex-1 truncate text-xs">{t.title}</span>
						<input
							class="input input-bordered input-xs w-20"
							bind:value={yearEdits[t.id]}
							disabled={disabled}
						/>
						<button class="btn btn-ghost btn-xs" disabled={disabled} onclick={() => applyOverride(t.id)}
							>ok</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
