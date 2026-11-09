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
		error: null
	});
	let lastPlayKey = $state<string | null>(null);

	const activePlayPhases: GamePhase[] = [
		'HOST_PLAYING',
		'GUESSING',
		'GUESS_LOCKED',
		'CHALLENGE_WINDOW'
	];

	const modeLabel = $derived(
		status.mode === 'premium'
			? 'Spotify Web Playback'
			: status.mode === 'preview'
				? 'Spotify preview (30s)'
				: spotifySource === 'spotify'
					? 'Spotify (fallback mock)'
					: 'Mock-deck'
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
		if (!isHost || !hostPlayer) return;
		const shouldPlay = activePlayPhases.includes(phase) && !!track;

		if (!shouldPlay) {
			if (phase === 'REVEAL' || phase === 'RESOLVE' || phase === 'WAITING_TURN' || phase === 'lobby') {
				void hostPlayer.pause();
				lastPlayKey = null;
			}
			return;
		}

		// Start playback when entering HOST_PLAYING for this track
		if (phase === 'HOST_PLAYING' && track && lastPlayKey !== `play:${track.id}`) {
			lastPlayKey = `play:${track.id}`;
			void hostPlayer.playTrack({
				uri: track.spotifyUri,
				previewUrl: track.previewUrl,
				playDurationSec: settings.playDurationSec,
				playOffsetSec: settings.playOffsetSec,
				mockFallback: () => {
					/* visual still shows track art */
				}
			});
		}
	});
</script>

{#if isHost}
	<div class="space-y-2">
		<MockNowPlaying
			playing={status.playing || activePlayPhases.includes(phase)}
			phaseLabel={PHASE_LABELS[phase]}
			{track}
			{modeLabel}
		/>
		<div class="flex flex-wrap items-center gap-2 px-1 text-xs text-white/50">
			<span class="badge badge-sm badge-outline">{modeLabel}</span>
			{#if status.ready && status.mode === 'premium'}
				<span class="text-secondary">device ready</span>
			{:else if status.mode === 'none' || !status.ready}
				<span class="text-warning">player init…</span>
			{/if}
			<span>{settings.playDurationSec}s · offset {settings.playOffsetSec}s</span>
			{#if status.error}
				<span class="text-warning">{status.error}</span>
			{/if}
			<button class="btn btn-ghost btn-xs" onclick={() => hostPlayer?.unlockAudio()}>Unlock</button>
			<button class="btn btn-ghost btn-xs" onclick={() => hostPlayer?.pause()}>Pause</button>
		</div>
		{#if spotifySource === 'spotify' && status.mode !== 'premium' && status.mode !== 'preview'}
			<p class="px-1 text-xs text-white/40">
				Tip: klik <strong>Unlock</strong> in de lobby of hier, daarna speelt Spotify bij Start.
			</p>
		{/if}
	</div>
{:else}
	<MockNowPlaying
		playing={activePlayPhases.includes(phase)}
		phaseLabel={PHASE_LABELS[phase]}
		{track}
		modeLabel="Host speelt audio"
	/>
{/if}
