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
		/** CSS selector for fly-from origin (Now Playing). */
		flyFromSelector?: string;
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
		insertTrackId = null,
		flyFromSelector = '[data-now-playing]'
	}: Props = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);
	const slotEls = new Map<number, HTMLElement>();
	const cardEls = new Map<string, HTMLElement>();

	/** Last known year per track — only pop when the number actually changes */
	const lastYears = new Map<string, number>();
	let yearPopIds = $state<Record<string, boolean>>({});

	/** Do NOT use $state for in-flight highlight — reactive class updates wipe inline FLIP transforms. */
	let lastInsertProp: string | null | undefined = undefined;
	let prevCardIds: string[] = [];
	/** Layout offsets from previous paint (scroll-independent). Effect runs AFTER DOM update. */
	let lastOffsets = new Map<string, { left: number; top: number; width: number; height: number }>();
	let lastOrigin: DOMRect | null = null;
	let primed = false;
	let flipRunning = false;

	const ROOM_MS = 1100;
	const FLY_MS = 1200;
	const FLY_DELAY_MS = 90;

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

	function scrollSlotIntoView(slot: number | null | undefined, smooth = true) {
		if (slot == null || !scroller) return;
		const node = slotEls.get(slot) ?? cardEls.get(cards[slot]?.trackId ?? '');
		if (!node) return;
		const parent = scroller;
		const left = node.offsetLeft - parent.clientWidth / 2 + node.clientWidth / 2;
		parent.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
	}

	function snapshotRects() {
		const next = new Map<string, { left: number; top: number; width: number; height: number }>();
		for (const [id, el] of cardEls) {
			next.set(id, {
				left: el.offsetLeft,
				top: el.offsetTop,
				width: el.offsetWidth,
				height: el.offsetHeight
			});
		}
		lastOffsets = next;
		lastOrigin =
			typeof document !== 'undefined'
				? document.querySelector(flyFromSelector)?.getBoundingClientRect() ?? null
				: null;
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

	function nextFrame() {
		return new Promise<void>((r) => requestAnimationFrame(() => r()));
	}

	function clearInlineMotion(el: HTMLElement) {
		el.style.transition = '';
		el.style.transform = '';
		el.style.opacity = '';
		el.style.zIndex = '';
		el.style.filter = '';
	}

	/**
	 * Real FLIP insert (effect runs AFTER DOM update):
	 * FIRST = lastOffsets from previous paint (offsetLeft — ignore scroll)
	 * LAST  = current offsets after insert
	 * Neighbors ease-in-out make room; new card flies from Now Playing.
	 * Scroll-into-view only AFTER the animation so it cannot cancel FLIP.
	 */
	async function runFlipInsert(newId: string | null, nextIds: string[]) {
		if (flipRunning) {
			prevCardIds = nextIds;
			queueMicrotask(() => snapshotRects());
			return;
		}

		const first = new Map(lastOffsets);
		const origin = lastOrigin;

		prevCardIds = nextIds;
		await tick();
		updateShadows();

		const movers: { el: HTMLElement; dx: number; dy: number }[] = [];
		for (const id of nextIds) {
			if (id === newId) continue;
			const el = cardEls.get(id);
			const from = first.get(id);
			if (!el || !from) continue;
			const dx = from.left - el.offsetLeft;
			const dy = from.top - el.offsetTop;
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
			movers.push({ el, dx, dy });
		}

		const newEl = newId ? cardEls.get(newId) : null;
		let fly: { dx: number; dy: number; scale: number } | null = null;
		if (newEl) {
			const to = newEl.getBoundingClientRect();
			let dx = 0;
			let dy = -72;
			let scale = 0.65;
			if (origin) {
				dx = origin.left + origin.width / 2 - (to.left + to.width / 2);
				dy = origin.top + origin.height / 2 - (to.top + to.height / 2);
				scale = Math.min(1.15, Math.max(0.4, origin.width / Math.max(to.width, 1)));
			}
			fly = { dx, dy, scale };
		}

		if (!movers.length && !fly) {
			snapshotRects();
			if (newId) {
				const idx = nextIds.indexOf(newId);
				if (idx >= 0) scrollSlotIntoView(idx, true);
			}
			return;
		}

		flipRunning = true;
		const animations: Animation[] = [];

		// WAAPI — survives Svelte class patches better than CSS transitions
		for (const { el, dx, dy } of movers) {
			el.style.zIndex = '5';
			animations.push(
				el.animate(
					[
						{ transform: `translate(${dx}px, ${dy}px)` },
						{ transform: 'translate(0px, 0px)' }
					],
					{ duration: ROOM_MS, easing: 'ease-in-out', fill: 'both' }
				)
			);
		}

		if (newEl && fly) {
			newEl.classList.add('card-insert-live');
			newEl.style.zIndex = '40';
			const flyAnim = newEl.animate(
				[
					{
						transform: `translate(${fly.dx}px, ${fly.dy}px) scale(${fly.scale})`,
						opacity: 0.2,
						filter: 'brightness(1.35)'
					},
					{
						transform: 'translate(0px, 0px) scale(1)',
						opacity: 1,
						filter: 'brightness(1)'
					}
				],
				{
					duration: FLY_MS,
					delay: FLY_DELAY_MS,
					easing: 'ease-in-out',
					fill: 'both'
				}
			);
			animations.push(flyAnim);
		}

		const doneMs = Math.max(ROOM_MS, FLY_DELAY_MS + FLY_MS) + 80;
		window.setTimeout(() => {
			for (const a of animations) {
				try {
					a.finish();
					a.cancel();
				} catch {
					/* ignore */
				}
			}
			for (const { el } of movers) clearInlineMotion(el);
			if (newEl) {
				clearInlineMotion(newEl);
				newEl.classList.remove('card-insert-live');
			}
			flipRunning = false;
			if (newId) {
				const idx = nextIds.indexOf(newId);
				if (idx >= 0) scrollSlotIntoView(idx, true);
			}
			snapshotRects();
		}, doneMs);
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
			queueMicrotask(() => {
				updateShadows();
				snapshotRects();
			});
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
		} else if (!flipRunning) {
			queueMicrotask(() => {
				updateShadows();
				snapshotRects();
			});
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

			{@const yearPop = !!yearPopIds[card.trackId]}
			<div
				use:registerCard={card.trackId}
				class="timeline-card flex min-w-28 shrink-0 flex-col justify-between rounded-2xl border border-white/10 bg-base-200/80 px-3 py-2 shadow-lg backdrop-blur"
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
		will-change: transform, opacity;
		transform-origin: center center;
	}

	:global(.timeline-card.card-insert-live) {
		box-shadow:
			0 0 0 1px rgba(45, 212, 191, 0.35),
			0 12px 28px rgba(0, 0, 0, 0.35);
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
