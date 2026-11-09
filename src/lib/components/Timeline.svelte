<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { ChallengeClaim, TimelineCard } from '#lib/game/types';

	interface Props {
		cards: TimelineCard[];
		interactive?: boolean;
		selectedSlot?: number | null;
		lockedSlot?: number | null;
		claims?: ChallengeClaim[];
		playerColors?: Record<string, string>;
		onSelectSlot?: (slot: number) => void;
		/** @deprecated Years are always visible (HIT-13). Kept for call-site compat. */
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
		dimYears: _dimYears = false,
		challengePick = false,
		insertTrackId = null
	}: Props = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);
	const slotEls = new Map<number, HTMLElement>();
	const cardEls = new Map<string, HTMLElement>();

	/** Last known year per track — only pop when the number actually changes */
	const lastYears = new Map<string, number>();
	let yearPopIds = $state<Record<string, boolean>>({});

	/** One-shot insert animation id (cleared after anim) */
	let animInsertId = $state<string | null>(null);
	let lastInsertProp: string | null | undefined = undefined;
	let prevCardIds: string[] = [];
	let primed = false;
	let flipRunning = false;

	function registerSlot(node: HTMLElement, slot: number) {
		slotEls.set(slot, node);
		return {
			update(next: number) {
				for (const [s, el] of slotEls) {
					if (el === node) slotEls.delete(s);
				}
				slotEls.set(next, node);
			},
			destroy() {
				for (const [s, el] of slotEls) {
					if (el === node) slotEls.delete(s);
				}
			}
		};
	}

	function registerCard(node: HTMLElement, trackId: string) {
		cardEls.set(trackId, node);
		return {
			update(next: string) {
				for (const [id, el] of cardEls) {
					if (el === node) cardEls.delete(id);
				}
				cardEls.set(next, node);
			},
			destroy() {
				for (const [id, el] of cardEls) {
					if (el === node) cardEls.delete(id);
				}
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

	function syncYearPops(list: TimelineCard[]) {
		const next: Record<string, boolean> = {};
		for (const card of list) {
			const prev = lastYears.get(card.trackId);
			if (prev !== undefined && prev !== card.year) {
				next[card.trackId] = true;
			}
			lastYears.set(card.trackId, card.year);
		}
		for (const id of [...lastYears.keys()]) {
			if (!list.some((c) => c.trackId === id)) lastYears.delete(id);
		}
		if (!Object.keys(next).length) return;
		yearPopIds = next;
		window.setTimeout(() => {
			yearPopIds = {};
		}, 700);
	}

	async function runFlipInsert(newId: string | null, nextIds: string[]) {
		if (flipRunning) {
			prevCardIds = nextIds;
			return;
		}

		const first = new Map<string, number>();
		for (const id of prevCardIds) {
			const el = cardEls.get(id);
			if (el) first.set(id, el.getBoundingClientRect().left);
		}

		prevCardIds = nextIds;
		await tick();
		updateShadows();

		if (newId) {
			animInsertId = newId;
			const idx = nextIds.indexOf(newId);
			if (idx >= 0) scrollSlotIntoView(idx);
			window.setTimeout(() => {
				if (animInsertId === newId) animInsertId = null;
			}, 950);
		}

		const movers: HTMLElement[] = [];
		for (const id of nextIds) {
			if (id === newId) continue;
			const el = cardEls.get(id);
			const from = first.get(id);
			if (!el || from == null) continue;
			const to = el.getBoundingClientRect().left;
			const dx = from - to;
			if (Math.abs(dx) < 1) continue;
			el.style.transition = 'none';
			el.style.transform = `translateX(${dx}px)`;
			movers.push(el);
		}

		if (!movers.length && !newId) return;

		flipRunning = true;
		void scroller?.offsetWidth;
		requestAnimationFrame(() => {
			for (const el of movers) {
				el.style.transition = 'transform 0.85s ease-in-out';
				el.style.transform = 'translateX(0)';
			}
			window.setTimeout(() => {
				for (const el of movers) {
					el.style.transition = '';
					el.style.transform = '';
				}
				flipRunning = false;
			}, 900);
		});
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
		const list = cards;
		const ids = list.map((c) => c.trackId);
		const insertProp = insertTrackId;

		if (!primed) {
			primed = true;
			prevCardIds = ids;
			lastInsertProp = insertProp;
			for (const c of list) lastYears.set(c.trackId, c.year);
			queueMicrotask(() => updateShadows());
			return;
		}

		syncYearPops(list);

		let newId: string | null = null;
		if (insertProp && insertProp !== lastInsertProp && ids.includes(insertProp)) {
			newId = insertProp;
		} else if (!insertProp && ids.some((id) => !prevCardIds.includes(id))) {
			newId = ids.find((id) => !prevCardIds.includes(id)) ?? null;
		}
		lastInsertProp = insertProp;

		const orderChanged =
			ids.length !== prevCardIds.length || ids.some((id, i) => id !== prevCardIds[i]);

		if (orderChanged || newId) {
			void runFlipInsert(newId, ids);
		} else {
			queueMicrotask(() => updateShadows());
		}
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
		{#each cards as card, index (card.trackId)}
			{@const slot = index}
			{@const claim = claimAt(slot)}
			{@const blocked = isBlocked(slot)}
			{@const isLocked = lockedSlot === slot}
			{@const canPick = interactive && !blocked}
			<button
				type="button"
				use:registerSlot={slot}
				class="slot-btn relative flex min-w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed transition-colors duration-200
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
				<span class="font-display text-xs text-white/50">{slot === 0 ? '<' : '·'}</span>
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

			{@const isInsert = animInsertId === card.trackId}
			{@const yearPop = !!yearPopIds[card.trackId]}
			<div
				use:registerCard={card.trackId}
				class="timeline-card flex min-w-28 shrink-0 flex-col justify-between rounded-2xl border border-white/10 bg-base-200/80 px-3 py-2 shadow-lg backdrop-blur
					{isInsert ? 'card-insert ring-2 ring-success/60' : ''}"
				data-track={card.trackId}
			>
				<p class="font-display text-2xl leading-none text-accent" class:year-pop={yearPop}>
					{card.year}
				</p>
				<div class="mt-2">
					<p class="line-clamp-2 text-sm font-semibold leading-tight">{card.title}</p>
					<p class="line-clamp-1 text-xs text-white/50">{card.artist}</p>
				</div>
			</div>
		{/each}

		<!-- Trailing slot (after last card) -->
		{#if true}
			{@const endSlot = cards.length}
			{@const endClaim = claimAt(endSlot)}
			{@const endBlocked = isBlocked(endSlot)}
			{@const endLocked = lockedSlot === endSlot}
			{@const endPick = interactive && !endBlocked}
			<button
				type="button"
				use:registerSlot={endSlot}
				class="slot-btn relative flex min-w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed transition-colors duration-200
					{endPick ? 'cursor-pointer hover:border-primary hover:bg-primary/10' : 'cursor-default'}
					{selectedSlot === endSlot
					? 'border-secondary bg-secondary/20 shadow-[0_0_20px_rgba(45,212,191,0.25)]'
					: endLocked
						? 'border-primary bg-primary/25 shadow-[0_0_16px_rgba(255,92,51,0.3)]'
						: endBlocked
							? 'border-white/10 bg-white/[0.03] opacity-45'
							: 'border-white/15 bg-white/5'}
					{!interactive && !endLocked ? 'opacity-80' : ''}"
				disabled={!endPick}
				onclick={() => endPick && onSelectSlot?.(endSlot)}
				aria-label={endLocked
					? `Slot ${endSlot} — lock van actieve speler`
					: endBlocked
						? `Slot ${endSlot} — al een viesje`
						: `Slot ${endSlot}`}
				title={endLocked
					? 'Lock van de actieve speler — viesje moet ergens anders'
					: endBlocked
						? 'Al bezet door een viesje'
						: undefined}
			>
				<span class="font-display text-xs text-white/50">&gt;</span>
				{#if endLocked}
					<span
						class="absolute -bottom-1 rounded px-1 text-[9px] font-bold uppercase tracking-wide text-primary"
						>lock</span
					>
				{/if}
				{#if endClaim}
					<span
						class="absolute -top-2 h-3 w-3 rounded-full ring-2 ring-base-100"
						style="background:{playerColors[endClaim.playerId] ?? '#fff'}"
						title="Viesje"
					></span>
				{/if}
			</button>
		{/if}
	</div>
</div>

<style>
	.slot-btn {
		min-height: 5.5rem;
	}

	.timeline-card {
		will-change: transform;
	}

	/* New card: ease-in-out into place — no flashy bounce */
	.card-insert {
		animation: card-ease-in 0.85s ease-in-out both;
	}

	@keyframes card-ease-in {
		0% {
			opacity: 0;
			transform: scale(0.72);
			filter: brightness(1.15);
		}
		45% {
			opacity: 1;
			filter: brightness(1.05);
		}
		100% {
			opacity: 1;
			transform: scale(1);
			filter: brightness(1);
		}
	}

	/* Only when the year number itself changes */
	.year-pop {
		animation: year-change 0.65s ease-in-out both;
	}

	@keyframes year-change {
		0% {
			opacity: 0.35;
			transform: translateY(6px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
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
