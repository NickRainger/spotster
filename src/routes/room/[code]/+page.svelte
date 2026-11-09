<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import SettingsPanel from '#lib/components/SettingsPanel.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import MockNowPlaying from '#lib/components/MockNowPlaying.svelte';
	import { PHASE_LABELS } from '#lib/game/engine';
	import type { GameSettings } from '#lib/game/types';
	import { gameClient, loadSession } from '#lib/ws/client';

	let name = $state('Speler');
	let joined = $state(false);
	let selectedSlot = $state<number | null>(null);
	let challengeTargetId = $state<string | null>(null);
	let challengeSlot = $state<number | null>(null);
	let showSettings = $state(true);
	let challengeLeft = $state(0);

	const code = $derived(page.params.code?.toUpperCase() ?? '');

	let snap = $state({
		connected: false,
		room: null as import('#lib/game/types').RoomPublic | null,
		playerId: null as string | null,
		error: null as string | null,
		lastKicked: null as string | null
	});

	const me = $derived(snap.room?.players.find((p) => p.id === snap.playerId) ?? null);
	const isHost = $derived(!!me?.isHost);
	const isActive = $derived(snap.room?.turn.activePlayerId === snap.playerId);
	const activePlayer = $derived(
		snap.room?.players.find((p) => p.id === snap.room?.turn.activePlayerId) ?? null
	);
	const phase = $derived(snap.room?.phase ?? 'lobby');
	const inGame = $derived(phase !== 'lobby');
	const colorMap = $derived(
		Object.fromEntries((snap.room?.players ?? []).map((p) => [p.id, p.color])) as Record<
			string,
			string
		>
	);

	onMount(() => {
		gameClient.connect();
		const unsub = gameClient.state.subscribe((s) => {
			snap = {
				connected: s.connected,
				room: s.room,
				playerId: s.playerId,
				error: s.error,
				lastKicked: s.lastKicked
			};
			if (s.room && s.room.code === code) joined = true;
			if (s.lastKicked) {
				joined = false;
			}
		});

		const sess = loadSession();
		if (sess?.name) name = sess.name;

		// Auto join / reconnect
		if (sess?.code === code && sess.sessionToken) {
			gameClient.send({ type: 'reconnect', code, sessionToken: sess.sessionToken });
			joined = true;
		} else if (sess?.code === code) {
			gameClient.send({ type: 'join', code, name: sess.name || name });
		}

		const tick = setInterval(() => {
			const ends = snap.room?.turn.challengeEndsAt;
			if (ends) challengeLeft = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
			else challengeLeft = 0;
		}, 200);

		return () => {
			unsub();
			clearInterval(tick);
		};
	});

	function doJoin() {
		gameClient.clearError();
		gameClient.send({ type: 'join', code, name: name.trim() || 'Speler' });
	}

	function patchSettings(partial: Partial<GameSettings>) {
		gameClient.send({ type: 'update_settings', settings: partial });
	}

	function movePlayer(id: string, dir: -1 | 1) {
		if (!snap.room || !isHost) return;
		const order = [...snap.room.turnOrder];
		const i = order.indexOf(id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= order.length) return;
		[order[i], order[j]] = [order[j], order[i]];
		gameClient.send({ type: 'reorder', playerIds: order });
	}

	function lockIn() {
		if (selectedSlot == null) return;
		gameClient.send({ type: 'lock_slot', slotIndex: selectedSlot });
		selectedSlot = null;
	}

	function placeChallenge() {
		if (challengeSlot == null) return;
		gameClient.send({ type: 'challenge', slotIndex: challengeSlot });
		challengeSlot = null;
	}

	$effect(() => {
		if (phase === 'CHALLENGE_WINDOW' && !isActive && me) {
			challengeTargetId = me.id;
		}
	});
</script>

{#if snap.lastKicked}
	<main class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5">
		<h1 class="brand-word text-5xl">spotster</h1>
		<p class="mt-4 text-error">{snap.lastKicked}</p>
		<a class="btn btn-primary mt-6 w-fit" href="/">Terug naar home</a>
	</main>
{:else if !joined}
	<main class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5">
		<p class="text-sm uppercase tracking-[0.3em] text-secondary">room {code}</p>
		<h1 class="brand-word mt-2 text-6xl">spotster</h1>
		<label class="form-control mt-8">
			<span class="label-text">Jouw naam</span>
			<input class="input input-bordered input-lg" bind:value={name} maxlength="20" />
		</label>
		{#if snap.error}<p class="mt-2 text-sm text-error">{snap.error}</p>{/if}
		<button class="btn btn-primary btn-lg mt-4" onclick={doJoin}>Join room</button>
		<a class="btn btn-ghost mt-2" href="/">Annuleer</a>
	</main>
{:else if snap.room}
	{@const room = snap.room}
	<main class="mx-auto min-h-dvh w-full max-w-6xl px-4 pb-24 pt-4 sm:px-6">
		<header class="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
					{inGame ? PHASE_LABELS[phase] : 'lobby'}
				</p>
				<h1 class="brand-word text-4xl sm:text-5xl">spotster</h1>
			</div>
			<div class="text-right">
				<p class="font-display text-3xl tracking-[0.2em] text-accent">{room.code}</p>
				<p class="text-xs text-white/40">
					{snap.connected ? 'live' : 'reconnect…'} · {room.deckRemaining} tracks
				</p>
			</div>
		</header>

		{#if snap.error}
			<div class="alert alert-warning mt-3 text-sm" role="alert">
				<span>{snap.error}</span>
				<button class="btn btn-ghost btn-xs" onclick={() => gameClient.clearError()}>ok</button>
			</div>
		{/if}

		{#if !inGame}
			<!-- LOBBY -->
			<section class="anim-enter mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
				<div class="space-y-4">
					<div class="rounded-3xl border border-white/10 bg-base-200/50 p-5">
						<div class="mb-4 flex items-center justify-between">
							<h2 class="font-display text-2xl">Spelers</h2>
							<span class="badge badge-outline">{room.players.length}</span>
						</div>
						<ul class="space-y-2">
							{#each room.turnOrder as pid, idx}
								{@const p = room.players.find((x) => x.id === pid)}
								{#if p}
									<li
										class="flex items-center gap-3 rounded-2xl border border-white/10 bg-base-100/40 px-3 py-2"
									>
										<span class="h-3 w-3 rounded-full" style="background:{p.color}"></span>
										<span class="flex-1 font-semibold"
											>{p.name}
											{#if p.isHost}<span class="text-xs text-primary">host</span>{/if}
											{#if !p.connected}<span class="text-xs text-warning">offline</span>{/if}
										</span>
										{#if isHost}
											<div class="join">
												<button
													class="btn btn-ghost btn-xs join-item"
													onclick={() => movePlayer(p.id, -1)}
													disabled={idx === 0}>↑</button
												>
												<button
													class="btn btn-ghost btn-xs join-item"
													onclick={() => movePlayer(p.id, 1)}
													disabled={idx === room.turnOrder.length - 1}>↓</button
												>
												{#if !p.isHost}
													<button
														class="btn btn-ghost btn-xs join-item text-error"
														onclick={() => gameClient.send({ type: 'kick', playerId: p.id })}
														>kick</button
													>
												{/if}
											</div>
										{/if}
									</li>
								{/if}
							{/each}
						</ul>
						<p class="mt-3 text-xs text-white/40">Volgorde = speelbeurten. Host kan herordenen.</p>
					</div>

					{#if isHost}
						<div class="flex flex-wrap gap-2">
							<button class="btn btn-primary btn-lg" onclick={() => gameClient.send({ type: 'start' })}
								>Start spel</button
							>
							<button
								class="btn btn-outline"
								onclick={() =>
									gameClient.send({
										type: 'set_play_mode',
										mode: room.playMode === 'multi' ? 'single' : 'multi'
									})}
							>
								Mode: {room.playMode}
								{#if room.playMode === 'single'}
									<span class="badge badge-warning badge-sm">HIT-5 stub</span>
								{/if}
							</button>
						</div>
					{:else}
						<p class="text-white/60">Wachten tot {room.players.find((p) => p.isHost)?.name ?? 'host'} start…</p>
					{/if}
				</div>

				<div class="rounded-3xl border border-white/10 bg-base-200/50 p-5">
					<button
						class="mb-4 flex w-full items-center justify-between"
						onclick={() => (showSettings = !showSettings)}
					>
						<h2 class="font-display text-2xl">Settings</h2>
						<span class="text-white/40">{showSettings ? '−' : '+'}</span>
					</button>
					{#if showSettings}
						<SettingsPanel
							settings={room.settings}
							disabled={!isHost}
							onChange={patchSettings}
						/>
					{/if}
				</div>
			</section>
		{:else}
			<!-- GAME -->
			<section class="anim-enter mt-5 space-y-5">
				<MockNowPlaying
					playing={phase === 'HOST_PLAYING' || phase === 'GUESSING' || phase === 'GUESS_LOCKED' || phase === 'CHALLENGE_WINDOW'}
					phaseLabel={PHASE_LABELS[phase]}
				/>

				{#if phase === 'GAME_OVER'}
					<div class="rounded-3xl border border-accent/40 bg-accent/10 p-6 text-center">
						<p class="text-sm uppercase tracking-[0.3em] text-accent">winner</p>
						<p class="font-display mt-2 text-4xl">
							{room.players.find((p) => p.id === room.winnerId)?.name ?? '???'}
						</p>
						{#if isHost}
							<button class="btn btn-primary mt-4" onclick={() => gameClient.send({ type: 'start' })}
								>Nog een ronde</button
							>
						{/if}
					</div>
				{/if}

				{#if room.turn.lastResolve && (phase === 'RESOLVE' || phase === 'REVEAL' || phase === 'CHECK_WIN')}
					<div class="rounded-2xl border border-white/10 bg-base-200/70 p-4">
						<p class="font-display text-xl">{room.turn.lastResolve.message}</p>
						<p class="mt-1 text-white/60">
							{room.turn.lastResolve.title} — {room.turn.lastResolve.artist} ({room.turn.lastResolve.year})
						</p>
					</div>
				{:else if phase === 'REVEAL' && room.turn.track}
					<div class="rounded-2xl border border-primary/30 bg-primary/10 p-4">
						<p class="font-display text-3xl text-accent">{room.turn.track.year}</p>
						<p class="text-lg font-semibold">{room.turn.track.title}</p>
						<p class="text-white/60">{room.turn.track.artist}</p>
					</div>
				{/if}

				<!-- Active player timeline / lock -->
				<div class="rounded-3xl border border-white/10 bg-base-200/40 p-4">
					<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
						<h2 class="font-display text-xl">
							{isActive ? 'Jouw tijdlijn' : `Tijdlijn van ${activePlayer?.name ?? '…'}`}
						</h2>
						{#if me}
							<span class="badge badge-lg border-0 bg-primary/20 text-primary"
								>{me.tokens} viesje{me.tokens === 1 ? '' : 's'}</span
							>
						{/if}
					</div>

					{#if isActive && (phase === 'GUESSING' || phase === 'HOST_PLAYING')}
						<Timeline
							cards={me?.timeline ?? []}
							interactive
							selectedSlot={selectedSlot}
							onSelectSlot={(s) => (selectedSlot = s)}
						/>
						<div class="mt-3 flex flex-wrap gap-2">
							<button class="btn btn-primary" disabled={selectedSlot == null} onclick={lockIn}
								>Lock in</button
							>
							<button
								class="btn btn-outline"
								onclick={() => gameClient.send({ type: 'skip_turn' })}
								disabled={(me?.tokens ?? 0) < room.settings.skipCost}
							>
								Skip (−{room.settings.skipCost})
							</button>
						</div>
					{:else if isActive}
						<Timeline cards={me?.timeline ?? []} lockedSlot={room.turn.lockedSlot} />
					{:else if activePlayer}
						<Timeline
							cards={activePlayer.timeline}
							lockedSlot={room.turn.lockedSlot}
							claims={[]}
						/>
					{/if}
				</div>

				<!-- Challenge: place viesje on YOUR timeline slot -->
				{#if phase === 'CHALLENGE_WINDOW' && !isActive && me}
					<div class="rounded-3xl border border-secondary/30 bg-secondary/10 p-4">
						<div class="mb-2 flex items-center justify-between">
							<h2 class="font-display text-xl">Challenge — viesje op jouw slot</h2>
							{#if challengeLeft > 0}
								<span class="font-display text-2xl text-secondary">{challengeLeft}s</span>
							{/if}
						</div>
						<p class="mb-2 text-sm text-white/60">
							Denk je dat jij het jaar beter plaatst? Claim een slot op <em>jouw</em> tijdlijn.
						</p>
						<Timeline
							cards={me.timeline}
							interactive={me.tokens > 0 && !room.turn.claims.some((c) => c.playerId === me.id)}
							selectedSlot={challengeSlot}
							claims={room.turn.claims.filter((c) => c.playerId === me.id)}
							playerColors={colorMap}
							onSelectSlot={(s) => (challengeSlot = s)}
						/>
						<button
							class="btn btn-secondary mt-3"
							disabled={challengeSlot == null || me.tokens < 1}
							onclick={placeChallenge}>Plaats viesje</button
						>
					</div>
				{:else if phase === 'CHALLENGE_WINDOW' && isActive}
					<div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/70">
						Anderen mogen challengen…
						{#if challengeLeft > 0}
							<span class="font-display text-secondary"> {challengeLeft}s</span>
						{/if}
					</div>
				{/if}

				<!-- All players strip -->
				<div class="grid gap-3 sm:grid-cols-2">
					{#each room.players as p}
						{#if room.turnOrder.includes(p.id)}
							<div
								class="rounded-2xl border px-3 py-3
								{p.id === room.turn.activePlayerId ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-base-200/30'}"
							>
								<div class="mb-1 flex items-center gap-2">
									<span class="h-2.5 w-2.5 rounded-full" style="background:{p.color}"></span>
									<span class="font-semibold">{p.name}</span>
									<span class="text-xs text-white/40">{p.timeline.length}/{room.settings.winAt}</span>
									<span class="ml-auto text-xs text-primary">{p.tokens}◆</span>
								</div>
								<Timeline cards={p.timeline} claims={room.turn.claims.filter((c) => c.playerId === p.id)} playerColors={colorMap} />
							</div>
						{/if}
					{/each}
				</div>

				<!-- Actions row -->
				<div class="flex flex-wrap gap-2">
					{#if me && room.settings.threeForOneEnabled}
						<button
							class="btn btn-outline btn-sm"
							onclick={() => gameClient.send({ type: 'three_for_one' })}
							disabled={me.tokens < room.settings.threeForOneCost}
						>
							3-voor-1 (−{room.settings.threeForOneCost})
						</button>
					{/if}
					{#if me && room.settings.tokenEarnMode !== 'off'}
						<button class="btn btn-outline btn-sm" onclick={() => gameClient.send({ type: 'request_token' })}
							>Viesje vragen (titel/artiest)</button
						>
					{/if}
					{#if isHost && room.settings.tokenEarnMode === 'host'}
						{#each room.players.filter((p) => p.id !== me?.id) as p}
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => gameClient.send({ type: 'token_earn_approve', playerId: p.id })}
								>+1 viesje {p.name}</button
							>
						{/each}
					{/if}
					{#if isHost && (room.settings.challengeMode === 'host-reveal' || room.settings.challengeMode === 'both') && phase === 'CHALLENGE_WINDOW'}
						<button class="btn btn-accent btn-sm" onclick={() => gameClient.send({ type: 'host_reveal' })}
							>Reveal nu</button
						>
					{/if}
					{#if isHost}
						<button class="btn btn-ghost btn-sm" onclick={() => gameClient.send({ type: 'host_skip_turn' })}
							>Skip beurt</button
						>
					{/if}
					<button
						class="btn btn-ghost btn-sm text-error"
						onclick={() => {
							gameClient.send({ type: 'leave' });
							goto('/');
						}}>Leave</button
					>
				</div>
			</section>
		{/if}
	</main>
{:else}
	<main class="grid min-h-dvh place-items-center">
		<span class="loading loading-spinner loading-lg text-primary"></span>
	</main>
{/if}
