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
		const key = shouldPlay && track ? `${track.id}:${phase === 'HOST_PLAYING' ? 'start' : 'cont'}` : null;

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
					/* visual mock via MockNowPlaying */
				}
			});
		}
		void key;
	});
</script>

{#if isHost}
	<div class="space-y-2">
		<MockNowPlaying
			playing={status.playing || activePlayPhases.includes(phase)}
			phaseLabel={PHASE_LABELS[phase]}
		/>
		<div class="flex flex-wrap items-center gap-2 px-1 text-xs text-white/50">
			<span class="badge badge-sm badge-outline">
				{status.mode === 'premium'
					? 'Web Playback'
					: status.mode === 'preview'
						? 'Preview audio'
						: status.mode === 'mock' || spotifySource === 'mock'
							? 'Mock audio'
							: 'Audio'}
			</span>
			{#if status.tier !== 'unknown'}
				<span>{status.tier}</span>
			{/if}
			<span>{settings.playDurationSec}s · offset {settings.playOffsetSec}s</span>
			{#if status.error}
				<span class="text-warning">{status.error}</span>
			{/if}
			<button class="btn btn-ghost btn-xs" onclick={() => hostPlayer?.unlockAudio()}>Unlock</button>
			<button class="btn btn-ghost btn-xs" onclick={() => hostPlayer?.pause()}>Pause</button>
		</div>
	</div>
{:else}
	<MockNowPlaying
		playing={activePlayPhases.includes(phase)}
		phaseLabel={PHASE_LABELS[phase]}
	/>
{/if}
