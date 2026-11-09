<script lang="ts">
	import type { HandoffState } from '#lib/game/types';

	interface Props {
		handoff: HandoffState;
		onAck: () => void;
	}

	let { handoff, onAck }: Props = $props();
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1220]/90 p-6 backdrop-blur-md anim-enter"
	role="dialog"
	aria-modal="true"
	aria-label="Geef door"
>
	<div class="pointer-events-none absolute inset-0 opacity-40">
		<div class="absolute left-1/4 top-1/3 h-48 w-48 rounded-full bg-primary/30 blur-3xl anim-glow"></div>
		<div class="absolute right-1/4 bottom-1/4 h-40 w-40 rounded-full bg-secondary/20 blur-3xl"></div>
	</div>

	<div class="relative w-full max-w-md text-center">
		<p class="text-xs font-semibold uppercase tracking-[0.35em] text-secondary">
			{handoff.kind === 'guesser'
				? 'beurt'
				: handoff.kind === 'challenger'
					? 'viesjes'
					: 'reveal'}
		</p>
		<p class="brand-word mt-3 text-5xl sm:text-6xl">
			{handoff.kind === 'reveal' ? 'spotster' : handoff.playerName}
		</p>
		<p class="mt-5 text-lg text-white/75">{handoff.message}</p>
		<p class="mt-2 text-sm text-white/40">Scherm is gedimd tot jij bevestigt — geen gluren.</p>
		<button class="btn btn-primary btn-lg mt-8 w-full max-w-xs" onclick={onAck}>
			{handoff.kind === 'reveal'
				? 'Toon reveal'
				: `Ik ben ${handoff.playerName} — start`}
		</button>
	</div>
</div>
