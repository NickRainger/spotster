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
		needsGesture: false
	});
	let lastPlayKey = $state<string | null>(null);

	const activePlayPhases: GamePhase[] = [
		'HOST_PLAYING',
		'GUESSING',
		'GUESS_LOCKED',
		'CHALLENGE_WINDOW'
	];

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

		if (!activePlayPhases.includes(phase) || !track) {
			if (phase === 'REVEAL' || phase === 'RESOLVE' || phase === 'WAITING_TURN' || phase === 'lobby') {
				void hostPlayer.pause();
				lastPlayKey = null;
			}
			return;
		}

		if (phase === 'HOST_PLAYING' && lastPlayKey !== `play:${track.id}`) {
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

	function onPlayTap() {
		if (!hostPlayer || !playOpts) return;
		void hostPlayer.playFromUserGesture(playOpts);
	}

	function onPauseTap() {
		void hostPlayer?.pause();
	}

	function onResumeTap() {
		if (status.needsGesture || !status.unlocked) {
			onPlayTap();
			return;
		}
		void hostPlayer?.resume();
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
			<MockNowPlaying
				playing={status.playing}
				phaseLabel={PHASE_LABELS[phase]}
				{track}
				{modeLabel}
			/>

			{#if status.needsGesture && track && activePlayPhases.includes(phase)}
				<button
					type="button"
					class="btn btn-primary btn-lg min-h-14 w-full text-base sm:w-auto"
					onclick={onPlayTap}
				>
					Speel dit nummer
				</button>
				<p class="text-sm text-warning">
					Browser blokkeert autoplay — één tik start Spotify.
				</p>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				{#if status.playing}
					<button type="button" class="btn btn-outline btn-md min-h-12 min-w-24" onclick={onPauseTap}
						>Pauze</button
					>
				{:else if track && activePlayPhases.includes(phase)}
					<button type="button" class="btn btn-primary btn-md min-h-12 min-w-24" onclick={onResumeTap}
						>Speel</button
					>
				{/if}
				<button
					type="button"
					class="btn btn-ghost btn-md min-h-12"
					onclick={() => hostPlayer?.unlockAudio()}>Unlock</button
				>
				{#if track && status.mode === 'premium'}
					<button
						type="button"
						class="btn btn-ghost btn-md min-h-12"
						onclick={() => hostPlayer?.seek((settings.playOffsetSec ?? 0) * 1000)}
						>Naar start</button
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
		playing={activePlayPhases.includes(phase)}
		phaseLabel={PHASE_LABELS[phase]}
		{track}
		modeLabel="Host speelt Spotify"
	/>
{/if}
