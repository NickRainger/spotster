<script lang="ts">
	import { onMount } from 'svelte';
	import { hostPlayer, type HostPlayerStatus } from '#lib/spotify/player';
	import type { GamePhase, GameSettings, Track } from '#lib/game/types';
	import MockNowPlaying from './MockNowPlaying.svelte';
	import { PHASE_LABELS } from '#lib/game/engine';

	interface Props {
		isHost: boolean;
		phase: GamePhase;
		track: Track | null;
		settings: GameSettings;
		spotifySource: 'mock' | 'spotify';
	}

	let { isHost, phase, track, settings, spotifySource }: Props = $props();

	let status = $state<HostPlayerStatus>({
		mode: 'none',
		tier: 'unknown',
		deviceId: null,
		ready: false,
		playing: false,
		error: null,
		unlocked: false,
		needsGesture: false,
		busy: false
	});
	let lastPlayKey = $state<string | null>(null);

	const spotifyReady = $derived(spotifySource === 'spotify');

	const modeLabel = $derived(
		!spotifyReady
			? 'Spotify vereist'
			: status.mode === 'premium'
				? 'Spotify Web Playback'
				: status.mode === 'preview'
					? 'Spotify preview (30s)'
					: 'Spotify'
	);

	const playOpts = $derived(
		track
			? {
					uri: track.spotifyUri,
					previewUrl: track.previewUrl,
					playDurationSec: settings.playDurationSec,
					playOffsetSec: settings.playOffsetSec
				}
			: null
	);

	onMount(() => {
		if (!isHost || !hostPlayer) return;
		const unsub = hostPlayer.onStatus((s) => {
			status = s;
		});
		void hostPlayer.initFromSession();
		return () => {
			unsub();
			void hostPlayer?.pause();
		};
	});

	$effect(() => {
		if (!isHost || !hostPlayer || !spotifyReady) return;

		// Keep audio through reveal/score/waiting; only stop at lobby / game over.
		if (phase === 'lobby' || phase === 'GAME_OVER') {
			void hostPlayer.pause();
			lastPlayKey = null;
			return;
		}

		if (phase === 'HOST_PLAYING' && track && lastPlayKey !== `play:${track.id}`) {
			lastPlayKey = `play:${track.id}`;
			void hostPlayer.playTrack({
				uri: track.spotifyUri,
				previewUrl: track.previewUrl,
				playDurationSec: settings.playDurationSec,
				playOffsetSec: settings.playOffsetSec,
				fromUserGesture: status.unlocked
			});
		}
	});

	function onMainTap() {
		if (!hostPlayer || status.busy) return;
		void hostPlayer.togglePlay(playOpts ?? undefined);
	}

	function onSeekStart() {
		if (!hostPlayer) return;
		void hostPlayer.seek((settings.playOffsetSec ?? 0) * 1000);
	}
</script>

{#if isHost}
	<div class="space-y-3">
		{#if !spotifyReady}
			<div class="rounded-2xl border border-warning/40 bg-warning/10 p-4">
				<p class="font-display text-xl text-warning">Geen Spotify-deck</p>
				<p class="mt-1 text-sm text-white/70">
					Verbind Spotify en kies een playlist in de lobby. Er is geen mock-audio meer.
				</p>
			</div>
		{:else}
			{#if !status.unlocked}
				<button
					type="button"
					class="btn btn-primary btn-lg min-h-14 w-full text-base"
					disabled={status.busy}
					onclick={onMainTap}
				>
					Activeer Spotify-audio
				</button>
				<p class="text-sm text-warning">
					Eén tik ontgrendelt de browser — daarna starten nummers vanzelf.
				</p>
			{/if}

			<MockNowPlaying
				playing={status.playing}
				phaseLabel={PHASE_LABELS[phase]}
				{track}
				{modeLabel}
			/>

			{#if status.needsGesture && status.unlocked && track && phase === 'HOST_PLAYING'}
				<p class="text-sm text-warning">Autoplay geblokkeerd — tik Speel hieronder.</p>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="btn btn-lg min-h-14 min-w-36 text-base {status.playing
						? 'btn-outline'
						: 'btn-primary'}"
					disabled={status.busy || (!track && !lastPlayKey && !status.playing)}
					onclick={onMainTap}
				>
					{#if status.busy}
						<span class="loading loading-spinner loading-sm"></span>
					{:else if status.playing}
						Pauze
					{:else}
						Speel
					{/if}
				</button>
				{#if track && status.mode === 'premium'}
					<button
						type="button"
						class="btn btn-ghost btn-md min-h-12"
						disabled={status.busy}
						onclick={onSeekStart}>Naar start</button
					>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2 px-0.5 text-xs text-white/50 sm:text-sm">
				<span class="badge badge-sm badge-outline">{modeLabel}</span>
				{#if status.unlocked}
					<span class="text-secondary">unlocked</span>
				{:else}
					<span class="text-warning">locked</span>
				{/if}
				{#if status.ready && status.mode === 'premium'}
					<span class="text-secondary">device ready</span>
				{/if}
				<span
					>{settings.playDurationSec <= 0
						? 'onbeperkt'
						: `${settings.playDurationSec}s`}</span
				>
				{#if status.error}
					<span class="w-full text-warning sm:w-auto">{status.error}</span>
				{/if}
			</div>
		{/if}
	</div>
{:else}
	<MockNowPlaying
		playing={status.playing || phase === 'HOST_PLAYING' || phase === 'GUESSING'}
		phaseLabel={PHASE_LABELS[phase]}
		{track}
		modeLabel="Host speelt Spotify"
	/>
{/if}
