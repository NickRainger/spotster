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
		/** Challenge mode: block locked + already-claimed slots (Hitster rule). */
		challengePick?: boolean;
		/** Animate this trackId as newly inserted */
		insertTrackId?: string | null;
	}

	let {
		cards,
		interactive = false,
		selectedSlot = null,
		lockedSlot = null,
		claims = [],
		playerColors = {},
		onSelectSlot,
		dimYears = false,
		challengePick = false,
		insertTrackId = null
	}: Props = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);
	const slotEls = new Map<number, HTMLElement>();

	function registerSlot(node: HTMLElement, slot: number) {
		slotEls.set(slot, node);
		return {
			destroy() {
				if (slotEls.get(slot) === node) slotEls.delete(slot);
			}
		};
	}

	function claimAt(slot: number) {
		return claims.find((c) => c.slotIndex === slot);
	}

	function isBlocked(slot: number) {
		if (!challengePick) return false;
		if (lockedSlot != null && slot === lockedSlot) return true;
		return claims.some((c) => c.slotIndex === slot);
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
		canScrollLeft = left > 2;
		canScrollRight = max > 2 && left < max - 2;
	}

	function scrollSlotIntoView(slot: number | null | undefined) {
		if (slot == null || !scroller) return;
		const node = slotEls.get(slot);
		if (!node) return;
		const parent = scroller;
		const left = node.offsetLeft - parent.clientWidth / 2 + node.clientWidth / 2;
		parent.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
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
		void cards.length;
		void interactive;
		void insertTrackId;
		queueMicrotask(() => {
			updateShadows();
			if (insertTrackId) {
				const idx = cards.findIndex((c) => c.trackId === insertTrackId);
				if (idx >= 0) scrollSlotIntoView(idx);
			}
		});
	});

	$effect(() => {
		const slot = selectedSlot ?? lockedSlot;
		queueMicrotask(() => scrollSlotIntoView(slot));
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
			{@const blocked = isBlocked(slot)}
			{@const isLocked = lockedSlot === slot}
			{@const canPick = interactive && !blocked}
			<button
				type="button"
				use:registerSlot={slot}
				class="slot-btn relative flex min-w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed transition
					{canPick ? 'cursor-pointer hover:border-primary hover:bg-primary/10' : 'cursor-default'}
					{selectedSlot === slot
					? 'border-secondary bg-secondary/20 shadow-[0_0_20px_rgba(45,212,191,0.25)]'
					: isLocked
						? 'border-primary bg-primary/25 shadow-[0_0_16px_rgba(255,92,51,0.3)]'
						: blocked
							? 'border-white/10 bg-white/[0.03] opacity-45'
							: 'border-white/15 bg-white/5'}
					{!interactive && !isLocked ? 'opacity-80' : ''}"
				disabled={!canPick}
				onclick={() => canPick && onSelectSlot?.(slot)}
				aria-label={isLocked
					? `Slot ${slot} — lock van actieve speler`
					: blocked
						? `Slot ${slot} — al een viesje`
						: `Slot ${slot}`}
				title={isLocked
					? 'Lock van de actieve speler — viesje moet ergens anders'
					: blocked
						? 'Al bezet door een viesje'
						: undefined}
			>
				<span class="font-display text-xs text-white/50"
					>{slot === 0 ? '<' : slot === cards.length ? '>' : '·'}</span
				>
				{#if isLocked}
					<span
						class="absolute -bottom-1 rounded px-1 text-[9px] font-bold uppercase tracking-wide text-primary"
						>lock</span
					>
				{/if}
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
				{@const isInsert = !!insertTrackId && card.trackId === insertTrackId}
				<div
					class="timeline-card anim-enter flex min-w-28 shrink-0 flex-col justify-between rounded-2xl border border-white/10 bg-base-200/80 px-3 py-2 shadow-lg backdrop-blur
						{isInsert ? 'card-insert ring-2 ring-success/70' : ''}"
					style="animation-delay: {isInsert ? '0ms' : `${Math.min(slot, 8) * 30}ms`}"
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

	.timeline-card {
		transition:
			transform 0.55s cubic-bezier(0.22, 1, 0.36, 1),
			margin 0.55s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.45s ease;
	}

	.card-insert {
		animation: card-drop-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	@keyframes card-drop-in {
		from {
			opacity: 0;
			transform: translateY(-18px) scale(0.86);
		}
		60% {
			opacity: 1;
			transform: translateY(3px) scale(1.03);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.timeline-fade::before,
	.timeline-fade::after {
		content: '';
		pointer-events: none;
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2.75rem;
		z-index: 2;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.timeline-fade::before {
		left: 0;
		background: linear-gradient(
			to right,
			rgba(0, 0, 0, 0.92) 0%,
			rgba(0, 0, 0, 0.55) 45%,
			transparent 100%
		);
	}

	.timeline-fade::after {
		right: 0;
		background: linear-gradient(
			to left,
			rgba(0, 0, 0, 0.92) 0%,
			rgba(0, 0, 0, 0.55) 45%,
			transparent 100%
		);
	}

	.timeline-fade.shadow-left::before,
	.timeline-fade.shadow-right::after {
		opacity: 1;
	}
</style>
