<script lang="ts">
	import { onMount } from 'svelte';
	import type { ChallengeClaim, TimelineCard } from '#lib/game/types';

	interface Props {
		cards: TimelineCard[];
		interactive?: boolean;
		selectedSlot?: number | null;
		lockedSlot?: number | null;
		claims?: ChallengeClaim[];
		playerColors?: Record<string, string>;
		onSelectSlot?: (slot: number) => void;
		dimYears?: boolean;
	}

	let {
		cards,
		interactive = false,
		selectedSlot = null,
		lockedSlot = null,
		claims = [],
		playerColors = {},
		onSelectSlot,
		dimYears = false
	}: Props = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);

	function claimAt(slot: number) {
		return claims.find((c) => c.slotIndex === slot);
	}

	function updateShadows() {
		const el = scroller;
		if (!el) {
			canScrollLeft = false;
			canScrollRight = false;
			return;
		}
		const max = el.scrollWidth - el.clientWidth;
		const left = el.scrollLeft;
		// 2px slack for subpixel rounding on mobile
		canScrollLeft = left > 2;
		canScrollRight = max > 2 && left < max - 2;
	}

	onMount(() => {
		updateShadows();
		const el = scroller;
		if (!el) return;

		const onScroll = () => updateShadows();
		el.addEventListener('scroll', onScroll, { passive: true });

		const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateShadows()) : null;
		ro?.observe(el);

		return () => {
			el.removeEventListener('scroll', onScroll);
			ro?.disconnect();
		};
	});

	$effect(() => {
		// Re-measure when card count / interactivity changes
		void cards.length;
		void interactive;
		queueMicrotask(updateShadows);
	});
</script>

<div
	class="timeline-fade relative min-w-0 w-full"
	class:shadow-left={canScrollLeft}
	class:shadow-right={canScrollRight}
>
	<div
		bind:this={scroller}
		class="timeline-scroll flex items-stretch gap-1 overflow-x-auto px-1 py-3"
		onscroll={updateShadows}
	>
		{#each [...Array(cards.length + 1).keys()] as slot (slot)}
			{@const claim = claimAt(slot)}
			<button
				type="button"
				class="slot-btn relative flex min-w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed transition
					{interactive ? 'cursor-pointer hover:border-primary hover:bg-primary/10' : 'cursor-default opacity-80'}
					{selectedSlot === slot || lockedSlot === slot
					? 'border-primary bg-primary/20 shadow-[0_0_20px_rgba(255,92,51,0.25)]'
					: 'border-white/15 bg-white/5'}"
				disabled={!interactive}
				onclick={() => interactive && onSelectSlot?.(slot)}
				aria-label={`Slot ${slot}`}
			>
				<span class="font-display text-xs text-white/50"
					>{slot === 0 ? '<' : slot === cards.length ? '>' : '·'}</span
				>
				{#if claim}
					<span
						class="absolute -top-2 h-3 w-3 rounded-full ring-2 ring-base-100"
						style="background:{playerColors[claim.playerId] ?? '#fff'}"
						title="Viesje"
					></span>
				{/if}
			</button>

			{#if slot < cards.length}
				{@const card = cards[slot]}
				<div
					class="anim-enter flex min-w-28 shrink-0 flex-col justify-between rounded-2xl border border-white/10 bg-base-200/80 px-3 py-2 shadow-lg backdrop-blur"
					style="animation-delay: {slot * 40}ms"
				>
					<p
						class="font-display text-2xl leading-none text-accent {dimYears
							? 'blur-sm select-none'
							: ''}"
					>
						{card.revealed ? card.year : '????'}
					</p>
					<div class="mt-2">
						<p class="line-clamp-2 text-sm font-semibold leading-tight">{card.title}</p>
						<p class="line-clamp-1 text-xs text-white/50">{card.artist}</p>
					</div>
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.slot-btn {
		min-height: 5.5rem;
	}

	.timeline-fade::before,
	.timeline-fade::after {
		content: '';
		pointer-events: none;
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2.5rem;
		z-index: 2;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.timeline-fade::before {
		left: 0;
		background: linear-gradient(
			to right,
			rgba(10, 14, 24, 1) 0%,
			rgba(10, 14, 24, 0.75) 40%,
			transparent 100%
		);
		box-shadow: inset 10px 0 12px -8px rgba(255, 92, 51, 0.35);
	}

	.timeline-fade::after {
		right: 0;
		background: linear-gradient(
			to left,
			rgba(10, 14, 24, 1) 0%,
			rgba(10, 14, 24, 0.75) 40%,
			transparent 100%
		);
		box-shadow: inset -10px 0 12px -8px rgba(255, 92, 51, 0.35);
	}

	.timeline-fade.shadow-left::before,
	.timeline-fade.shadow-right::after {
		opacity: 1;
	}
</style>
