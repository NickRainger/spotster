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

	type PlaylistRow = {
		id: string;
		name: string;
		tracksTotal: number;
		image: string | null;
		owner?: string;
		canLoadTracks?: boolean;
	};

	type TrackHit = {
		id: string;
		uri: string;
		name: string;
		artists: string[];
		year: number | null;
		previewUrl: string | null;
		image?: string | null;
	};

	let { roomCode, disabled = false, spotify, deckRemaining }: Props = $props();

	let configured = $state(true);
	let connected = $state(false);
	let tier = $state<'premium' | 'free' | 'unknown'>('unknown');
	let displayName = $state<string | null>(null);
	let playlists = $state<PlaylistRow[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let playlistQuery = $state('');
	let trackQuery = $state('');
	let playlistHits = $state<PlaylistRow[]>([]);
	let searchHits = $state<TrackHit[]>([]);
	let yearEdits = $state<Record<string, string>>({});
	let loadedTracks = $state<Track[]>([]);
	let showOverrides = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let selectedPlaylistId = $state<string | null>(null);

	const activePlaylistId = $derived(spotify.playlistId || selectedPlaylistId);
	const activePlaylistName = $derived(
		spotify.source === 'spotify' ? spotify.playlistName : null
	);

	const filteredPlaylists = $derived.by(() => {
		const q = playlistQuery.trim().toLowerCase();
		const base = playlists.filter((p) => p.canLoadTracks !== false);
		const followed = playlists.filter((p) => p.canLoadTracks === false);
		const pool = q
			? playlists.filter(
					(p) =>
						p.name.toLowerCase().includes(q) ||
						(p.owner ?? '').toLowerCase().includes(q)
				)
			: [...base, ...followed];
		return pool;
	});

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

	async function selectPlaylist(id: string, name: string, canLoad = true) {
		if (!canLoad && id !== 'liked') {
			error =
				'Spotify geeft geen tracks van playlists die je niet bezit. Kies Liked Songs of een lijst van jou (geen gevolgd/zoekresultaat).';
			return;
		}
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/spotify/playlist/${encodeURIComponent(id)}`);
			const body = await res.json();
			if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
			const tracks: Track[] = (body.tracks ?? [])
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
			selectedPlaylistId = id;
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

	async function runPlaylistSearch() {
		const q = playlistQuery.trim();
		if (q.length < 2) {
			playlistHits = [];
			return;
		}
		loading = true;
		error = null;
		try {
			const res = await fetch(
				`/api/spotify/search?type=playlist&q=${encodeURIComponent(q)}`
			).then((r) => r.json());
			if (res.error) throw new Error(res.error);
			playlistHits = res.playlists ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Playlist zoeken mislukt';
		} finally {
			loading = false;
		}
	}

	function onPlaylistQueryInput() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			void runPlaylistSearch();
		}, 350);
	}

	async function runSearch() {
		if (trackQuery.trim().length < 2) return;
		loading = true;
		error = null;
		try {
			const res = await fetch(
				`/api/spotify/search?type=track&q=${encodeURIComponent(trackQuery)}`
			).then((r) => r.json());
			if (res.error) throw new Error(res.error);
			searchHits = res.tracks ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Zoeken mislukt';
		} finally {
			loading = false;
		}
	}

	function addSearchTrack(t: TrackHit) {
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
			imageUrl: t.image ?? null,
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
		selectedPlaylistId = null;
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
				<code class="text-accent">SPOTIFY_REDIRECT_URI</code>.
			</p>
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
			<a
				class="btn btn-ghost btn-xs"
				href="/api/spotify/login?force=1&returnTo={encodeURIComponent(`/room/${roomCode}`)}"
				>Reconnect</a
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
		<p class="text-xs text-white/40">
			Tracks laden alleen van <strong class="text-white/60">Liked Songs</strong> en playlists die jij
			bezit (Spotify-API-regel).
		</p>
	{/if}

	{#if error}
		<p class="text-sm text-error whitespace-pre-wrap">{error}</p>
	{/if}

	{#if connected}
		<div class="space-y-2">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
				Zoek playlist
			</p>
			<input
				class="input input-bordered w-full"
				placeholder="Zoek in jouw lijst of op Spotify…"
				bind:value={playlistQuery}
				disabled={disabled}
				oninput={onPlaylistQueryInput}
				onkeydown={(e) => e.key === 'Enter' && runPlaylistSearch()}
			/>
		</div>

		<div>
			<p class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
				{playlistHits.length ? 'Zoekresultaten' : 'Opgeslagen playlists'}
			</p>
			{#if loading && !playlists.length && !playlistHits.length}
				<span class="loading loading-spinner loading-sm text-primary"></span>
			{/if}
			{#if activePlaylistName && spotify.source === 'spotify'}
				<div
					class="mb-3 flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary/15 px-3 py-2.5"
					role="status"
				>
					<span class="badge badge-primary badge-sm shrink-0">Geselecteerd</span>
					<span class="min-w-0 truncate font-semibold text-primary-content/95"
						>{activePlaylistName}</span
					>
					<span class="shrink-0 text-xs text-white/50"
						>{deckRemaining || loadedTracks.length || '—'} tracks</span
					>
				</div>
			{/if}
			<ul class="max-h-64 space-y-1.5 overflow-y-auto">
				{#each playlistHits.length ? playlistHits : filteredPlaylists as p (p.id + p.name)}
					{@const loadable = p.id === 'liked' || p.canLoadTracks !== false}
					{@const selected = activePlaylistId === p.id && spotify.source === 'spotify'}
					<li>
						<button
							type="button"
							aria-pressed={selected}
							class="flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition disabled:opacity-50
								{selected
								? 'border-primary bg-primary/20 ring-2 ring-primary/50'
								: loadable
									? 'border-white/10 bg-white/5 hover:border-primary/40'
									: 'border-white/5 bg-white/[0.03] opacity-70'}"
							disabled={disabled || loading}
							onclick={() => selectPlaylist(p.id, p.name, loadable)}
						>
							{#if p.image}
								<img
									src={p.image}
									alt=""
									class="h-12 w-12 shrink-0 rounded-lg object-cover {selected
										? 'ring-2 ring-primary'
										: ''}"
									loading="lazy"
								/>
							{:else}
								<div
									class="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-xs font-bold
										{selected ? 'bg-primary text-primary-content' : 'bg-secondary/20 text-secondary'}"
								>
									{p.id === 'liked' ? '♥' : p.name.slice(0, 1)}
								</div>
							{/if}
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-2">
									<span class="truncate font-medium">{p.name}</span>
									{#if selected}
										<span class="badge badge-primary badge-xs shrink-0">actief</span>
									{/if}
								</span>
								<span class="block truncate text-xs text-white/40">
									{p.owner ? `${p.owner} · ` : ''}{p.tracksTotal || '—'} tracks
									{#if !loadable}
										· alleen metadata (geen tracks)
									{/if}
								</span>
							</span>
							{#if selected}
								<span class="shrink-0 text-primary" aria-hidden="true">✓</span>
							{/if}
						</button>
					</li>
				{:else}
					<li class="px-1 text-sm text-white/40">Geen playlists gevonden</li>
				{/each}
			</ul>
		</div>

		<div class="space-y-2">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Zoek track</p>
			<div class="flex gap-2">
				<input
					class="input input-bordered flex-1"
					placeholder="Artiest of titel…"
					bind:value={trackQuery}
					disabled={disabled}
					onkeydown={(e) => e.key === 'Enter' && runSearch()}
				/>
				<button class="btn btn-outline" disabled={disabled || loading} onclick={runSearch}
					>Zoek</button
				>
			</div>
		</div>
		{#if searchHits.length}
			<ul class="max-h-48 space-y-1.5 overflow-y-auto">
				{#each searchHits as t}
					<li
						class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2"
					>
						{#if t.image}
							<img
								src={t.image}
								alt=""
								class="h-11 w-11 shrink-0 rounded-md object-cover"
								loading="lazy"
							/>
						{:else}
							<div class="h-11 w-11 shrink-0 rounded-md bg-white/10"></div>
						{/if}
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-medium">{t.name}</span>
							<span class="block truncate text-xs text-white/40"
								>{t.artists.join(', ')} · {t.year ?? '?'}</span
							>
						</span>
						<button
							class="btn btn-ghost btn-sm"
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
			<button class="btn btn-ghost btn-xs" disabled={disabled} onclick={resetToMock}
				>Gebruik mock-deck</button
			>
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
						<button
							class="btn btn-ghost btn-xs"
							disabled={disabled}
							onclick={() => applyOverride(t.id)}>ok</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
