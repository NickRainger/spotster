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
		compact?: boolean;
	}

	let { isHost, phase, track, settings, spotifySource, compact = false }: Props = $props();

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
				? 'Spotify'
				: status.mode === 'preview'
					? 'Preview'
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
</script>

{#if isHost}
	<div class={compact ? 'space-y-2' : 'space-y-3'}>
		{#if !spotifyReady}
			<div class="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
				Geen Spotify-deck — verbind in de lobby.
			</div>
		{:else}
			{#if !status.unlocked}
				<button
					type="button"
					class="btn btn-primary {compact ? 'btn-md min-h-11 w-full' : 'btn-lg min-h-14 w-full text-base'}"
					disabled={status.busy}
					onclick={onMainTap}
				>
					Activeer Spotify-audio
				</button>
			{/if}

			<div class="flex min-w-0 items-center gap-2">
				<div class="min-w-0 flex-1">
					<MockNowPlaying
						playing={status.playing}
						phaseLabel={PHASE_LABELS[phase]}
						{track}
						{modeLabel}
						{compact}
					/>
				</div>
				<button
					type="button"
					class="btn shrink-0 {compact
						? 'btn-md min-h-11 min-w-20'
						: 'btn-lg min-h-14 min-w-28 text-base'} {status.playing ? 'btn-outline' : 'btn-primary'}"
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
			</div>

			{#if status.error || (status.needsGesture && status.unlocked && track && phase === 'HOST_PLAYING')}
				<p class="text-xs text-warning">
					{status.error ?? 'Autoplay geblokkeerd — tik Speel.'}
				</p>
			{/if}
		{/if}
	</div>
{:else}
	<MockNowPlaying
		playing={status.playing || phase === 'HOST_PLAYING' || phase === 'GUESSING'}
		phaseLabel={PHASE_LABELS[phase]}
		{track}
		modeLabel="Host speelt"
		{compact}
	/>
{/if}
