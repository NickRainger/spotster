<script lang="ts">
	interface Props {
		playing: boolean;
		phaseLabel: string;
	}
	let { playing, phaseLabel }: Props = $props();
</script>

<div
	class="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a1020] via-base-200 to-[#0b1220] p-5"
>
	<div class="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-primary/20 blur-3xl anim-glow"></div>
	<div class="flex items-center gap-4">
		<div
			class="vinyl-ring relative h-20 w-20 shrink-0 rounded-full {playing ? 'spin-vinyl' : ''}"
			aria-hidden="true"
		>
			<span class="absolute inset-[38%] rounded-full bg-primary"></span>
		</div>
		<div>
			<p class="text-xs font-semibold uppercase tracking-[0.25em] text-secondary">{phaseLabel}</p>
			<p class="font-display text-2xl text-white">
				{playing ? 'Nummer speelt…' : 'Wachten op beat'}
			</p>
			<p class="text-sm text-white/50">Mock audio — Spotify komt in HIT-4</p>
		</div>
	</div>
	{#if playing}
		<div class="mt-4 flex h-8 items-end gap-1">
			{#each Array(16) as _, i}
				<span
					class="inline-block w-1.5 rounded-full bg-primary/80"
					style="height:{(30 + ((i * 37) % 70)) * 0.35}%; animation: pulse-glow {0.6 +
						(i % 5) * 0.15}s ease-in-out {i * 0.05}s infinite"
				></span>
			{/each}
		</div>
	{/if}
</div>
