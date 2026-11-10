<script lang="ts">
	import Timeline from '#lib/components/Timeline.svelte';
	import type { TimelineCard } from '#lib/game/types';

	let cards = $state<TimelineCard[]>([
		{ trackId: 'a', year: 1977, title: 'Hotel California', artist: 'Eagles', revealed: true },
		{ trackId: 'b', year: 1983, title: 'Billie Jean', artist: 'Michael Jackson', revealed: true },
		{ trackId: 'c', year: 1991, title: 'Smells Like Teen Spirit', artist: 'Nirvana', revealed: true },
		{ trackId: 'd', year: 2019, title: 'Bad Guy', artist: 'Billie Eilish', revealed: true }
	]);
	let insertTrackId = $state<string | null>(null);
	let npTitle = $state('Levitating');
	let npArtist = $state('Dua Lipa');
	let npYear = $state(2020);
	let seq = $state(0);

	function insertMiddle() {
		seq += 1;
		const id = `n${seq}`;
		npTitle = seq % 2 ? 'Levitating' : 'Blinding Lights';
		npArtist = seq % 2 ? 'Dua Lipa' : 'The Weeknd';
		npYear = seq % 2 ? 2020 : 2019;
		const card: TimelineCard = {
			trackId: id,
			year: npYear === 2020 ? 2003 : 1987,
			title: npTitle,
			artist: npArtist,
			revealed: true
		};
		const next = [...cards, card].sort((a, b) => a.year - b.year);
		cards = next;
		insertTrackId = id;
		window.setTimeout(() => {
			if (insertTrackId === id) insertTrackId = null;
		}, 1600);
	}
</script>

<main class="min-h-dvh bg-[#0a0e18] px-4 py-8 text-white">
	<p class="text-xs font-bold uppercase tracking-[0.3em] text-secondary">dev · insert FLIP</p>
	<h1 class="font-display mt-2 text-4xl">Kaart vliegt vanaf Now Playing</h1>
	<p class="mt-2 max-w-xl text-sm text-white/55">
		Bestaande kaarten maken met ease-in-out ruimte; nieuwe kaart komt uit de Now Playing-balk.
	</p>

	<div class="mt-8 max-w-xl">
		<div
			data-now-playing
			class="flex items-center gap-3 rounded-xl border border-white/10 bg-base-200/80 px-3 py-3"
		>
			<div class="vinyl-ring relative h-12 w-12 shrink-0 rounded-full spin-vinyl" aria-hidden="true">
				<span class="absolute inset-[38%] rounded-full bg-primary"></span>
			</div>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-semibold">{npTitle}</p>
				<p class="truncate text-xs text-white/45">{npArtist} · {npYear} · live</p>
			</div>
		</div>
	</div>

	<section class="mt-10 max-w-4xl">
		<p class="mb-2 text-sm text-white/50">Deck van Nick</p>
		<Timeline {cards} {insertTrackId} />
	</section>

	<button class="btn btn-primary btn-lg mt-8 min-h-14" type="button" onclick={insertMiddle}>
		Insert kaart (FLIP)
	</button>
</main>
