<script lang="ts">
	import type { Track } from '#lib/game/types';

	interface Props {
		playing: boolean;
		phaseLabel: string;
		track?: Track | null;
		modeLabel?: string;
		compact?: boolean;
	}
	let { playing, phaseLabel, track = null, modeLabel = 'Audio', compact = false }: Props = $props();
</script>

{#if compact}
	<div
		class="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/10 bg-base-200/70 px-2.5 py-2"
	>
		{#if track?.imageUrl}
			<img
				src={track.imageUrl}
				alt=""
				class="h-10 w-10 shrink-0 rounded-lg object-cover {playing ? 'ring-1 ring-primary' : ''}"
			/>
		{:else}
			<div
				class="vinyl-ring relative h-10 w-10 shrink-0 rounded-full {playing ? 'spin-vinyl' : ''}"
				aria-hidden="true"
			>
				<span class="absolute inset-[38%] rounded-full bg-primary"></span>
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-semibold leading-tight text-white">
				{track?.title ?? (playing ? 'Speelt…' : 'Geen nummer')}
			</p>
			<p class="truncate text-xs text-white/45">
				{#if track}
					{track.artist}
				{:else}
					{phaseLabel}
				{/if}
				· {modeLabel}
			</p>
		</div>
		{#if playing}
			<span class="shrink-0 text-[10px] font-bold uppercase tracking-wider text-primary">live</span>
		{/if}
	</div>
{:else}
	<div
		class="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a1020] via-base-200 to-[#0b1220] p-5"
	>
		<div
			class="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-primary/20 blur-3xl anim-glow"
		></div>
		<div class="flex items-center gap-4">
			{#if track?.imageUrl}
				<img
					src={track.imageUrl}
					alt=""
					class="h-20 w-20 shrink-0 rounded-xl object-cover {playing ? 'ring-2 ring-primary' : ''}"
				/>
			{:else}
				<div
					class="vinyl-ring relative h-20 w-20 shrink-0 rounded-full {playing ? 'spin-vinyl' : ''}"
					aria-hidden="true"
				>
					<span class="absolute inset-[38%] rounded-full bg-primary"></span>
				</div>
			{/if}
			<div class="min-w-0">
				<p class="text-xs font-semibold uppercase tracking-[0.25em] text-secondary">{phaseLabel}</p>
				<p class="font-display truncate text-2xl text-white">
					{#if track}
						{track.title}
					{:else}
						{playing ? 'Nummer speelt…' : 'Wachten op beat'}
					{/if}
				</p>
				<p class="truncate text-sm text-white/50">
					{#if track}
						{track.artist}{#if track.year}
							· {track.year}{/if} · {modeLabel}
					{:else}
						{modeLabel}
					{/if}
				</p>
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
{/if}
