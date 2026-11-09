<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import SettingsPanel from '#lib/components/SettingsPanel.svelte';
	import Timeline from '#lib/components/Timeline.svelte';
	import SpotifyPanel from '#lib/components/SpotifyPanel.svelte';
	import HostPlayback from '#lib/components/HostPlayback.svelte';
	import PassHandoff from '#lib/components/PassHandoff.svelte';
	import SingleDeviceLobby from '#lib/components/SingleDeviceLobby.svelte';
	import { PHASE_LABELS } from '#lib/game/engine';
	import type { GameSettings } from '#lib/game/types';
	import { gameClient, loadSession } from '#lib/ws/client';

	let name = $state('Speler');
	let joined = $state(false);
	let waitingRoom = $state(false);
	let selectedSlot = $state<number | null>(null);
	let challengeSlot = $state<number | null>(null);
	let showSettings = $state(false);
	let showMusic = $state(true);
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
	const isSingle = $derived(snap.room?.playMode === 'single');
	const handoff = $derived(snap.room?.handoff ?? null);
	const privacyLocked = $derived(!!isSingle && !!handoff);

	const seatId = $derived.by(() => {
		const room = snap.room;
		if (!room) return snap.playerId;
		if (!isSingle) return snap.playerId;
		if (room.phase === 'CHALLENGE_WINDOW') return room.challengeSeatId;
		return room.turn.activePlayerId;
	});

	const seatPlayer = $derived(snap.room?.players.find((p) => p.id === seatId) ?? null);
	const isActiveSeat = $derived(seatId != null && seatId === snap.room?.turn.activePlayerId);
	const isChallengeSeat = $derived(
		isSingle &&
			snap.room?.phase === 'CHALLENGE_WINDOW' &&
			seatId != null &&
			seatId === snap.room.challengeSeatId &&
			!handoff
	);
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

	/** Hide other players' full timelines during private single-device seats */
	const showAllTimelines = $derived(
		!isSingle ||
			phase === 'REVEAL' ||
			phase === 'RESOLVE' ||
			phase === 'CHECK_WIN' ||
			phase === 'GAME_OVER' ||
			phase === 'WAITING_TURN'
	);

	onMount(() => {
		gameClient.connect();
		let waitTimer: ReturnType<typeof setTimeout> | null = null;

		const unsub = gameClient.state.subscribe((s) => {
			snap = {
				connected: s.connected,
				room: s.room,
				playerId: s.playerId,
				error: s.error,
				lastKicked: s.lastKicked
			};
			if (s.room && s.room.code === code) {
				joined = true;
				waitingRoom = false;
				if (waitTimer) {
					clearTimeout(waitTimer);
					waitTimer = null;
				}
			}
			if (s.lastKicked) {
				joined = false;
				waitingRoom = false;
			}
			// Stale session / reconnect fail → back to join form, never infinite spinner
			if (s.error && waitingRoom && !s.room) {
				joined = false;
				waitingRoom = false;
				if (waitTimer) {
					clearTimeout(waitTimer);
					waitTimer = null;
				}
			}
		});

		const sess = loadSession();
		if (sess?.name) name = sess.name;

		if (sess?.code === code && sess.sessionToken) {
			waitingRoom = true;
			gameClient.send({ type: 'reconnect', code, sessionToken: sess.sessionToken });
			waitTimer = setTimeout(() => {
				if (!snap.room) {
					waitingRoom = false;
					joined = false;
					gameClient.state.update((s) => ({
						...s,
						error: s.error ?? 'Room niet bereikbaar (server herstart?). Join opnieuw.'
					}));
				}
			}, 8000);
		} else if (sess?.code === code) {
			waitingRoom = true;
			gameClient.send({ type: 'join', code, name: sess.name || name });
			waitTimer = setTimeout(() => {
				if (!snap.room) {
					waitingRoom = false;
					joined = false;
					gameClient.state.update((s) => ({
						...s,
						error: s.error ?? 'Kon niet joinen. Probeer opnieuw.'
					}));
				}
			}, 8000);
		}

		const tick = setInterval(() => {
			const ends = snap.room?.turn.challengeEndsAt;
			if (ends) challengeLeft = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
			else challengeLeft = 0;
		}, 200);

		return () => {
			unsub();
			clearInterval(tick);
			if (waitTimer) clearTimeout(waitTimer);
		};
	});

	function doJoin() {
		gameClient.clearError();
		waitingRoom = true;
		joined = false;
		gameClient.send({ type: 'join', code, name: name.trim() || 'Speler' });
		setTimeout(() => {
			if (!snap.room) {
				waitingRoom = false;
				gameClient.state.update((s) => ({
					...s,
					error: s.error ?? 'Kon niet joinen. Check de code of maak een nieuwe room.'
				}));
			}
		}, 8000);
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

	function asId(): string | undefined {
		return isSingle && seatId ? seatId : undefined;
	}

	function leaveRoom() {
		gameClient.send({ type: 'leave' });
		goto('/');
	}

	function lockIn() {
		if (selectedSlot == null) return;
		gameClient.send({ type: 'lock_slot', slotIndex: selectedSlot, asPlayerId: asId() });
		selectedSlot = null;
	}

	function placeChallenge() {
		if (challengeSlot == null) return;
		gameClient.send({ type: 'challenge', slotIndex: challengeSlot, asPlayerId: asId() });
		challengeSlot = null;
	}
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
	{#if privacyLocked && handoff}
		<PassHandoff handoff={handoff} onAck={() => gameClient.send({ type: 'handoff_ack' })} />
	{/if}

	<main
		class="mx-auto min-h-dvh w-full max-w-7xl px-5 pb-24 pt-4 sm:px-8 lg:px-10
			{privacyLocked ? 'pointer-events-none select-none blur-sm brightness-50' : ''}"
	>
		<header class="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
					{inGame ? PHASE_LABELS[phase] : 'lobby'}
					{#if isSingle}
						· single-device
					{/if}
				</p>
				<h1 class="brand-word text-4xl sm:text-5xl">spotster</h1>
			</div>
			<div class="flex flex-col items-end gap-2">
				<p class="font-display text-3xl tracking-[0.2em] text-accent">{room.code}</p>
				<p class="text-xs text-white/40">
					{snap.connected ? 'live' : 'reconnect…'} · {room.deckRemaining} tracks
				</p>
				<button class="btn btn-ghost btn-xs text-error" type="button" onclick={leaveRoom}
					>Leave</button
				>
			</div>
		</header>

		{#if snap.error}
			<div class="alert alert-warning mt-3 text-sm" role="alert">
				<span>{snap.error}</span>
				<button class="btn btn-ghost btn-xs" onclick={() => gameClient.clearError()}>ok</button>
			</div>
		{/if}

		{#if !inGame}
			<section class="anim-enter mt-10 space-y-12 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-20 lg:gap-y-12 lg:space-y-0">
				<div class="space-y-10">
					{#if isHost}
						<div class="flex flex-wrap gap-2">
							<button
								class="btn btn-sm {room.playMode === 'multi' ? 'btn-primary' : 'btn-ghost border border-white/15'}"
								onclick={() => gameClient.send({ type: 'set_play_mode', mode: 'multi' })}
								>Multi-device</button
							>
							<button
								class="btn btn-sm {room.playMode === 'single' ? 'btn-secondary' : 'btn-ghost border border-white/15'}"
								onclick={() => gameClient.send({ type: 'set_play_mode', mode: 'single' })}
								>Single-device</button
							>
						</div>
					{/if}

					<div>
						<div class="mb-4 flex items-baseline justify-between gap-3">
							<h2 class="font-display text-3xl">Spelers</h2>
							<span class="text-sm text-white/40">{room.players.length}</span>
						</div>
						{#if isSingle && isHost}
							<SingleDeviceLobby players={room.players} turnOrder={room.turnOrder} />
						{:else}
							<ul class="divide-y divide-white/10 border-y border-white/10">
								{#each room.turnOrder as pid, idx}
									{@const p = room.players.find((x) => x.id === pid)}
									{#if p}
										<li class="flex items-center gap-3 py-3.5">
											<span class="h-2.5 w-2.5 rounded-full" style="background:{p.color}"></span>
											<span class="flex-1 font-semibold"
												>{p.name}
												{#if p.isHost}<span class="ml-1 text-xs font-normal text-primary">host</span>{/if}
												{#if !p.connected}<span class="ml-1 text-xs font-normal text-warning">offline</span>{/if}
											</span>
											{#if isHost && !isSingle}
												<div class="flex gap-1">
													<button
														class="btn btn-ghost btn-xs"
														onclick={() => movePlayer(p.id, -1)}
														disabled={idx === 0}>↑</button
													>
													<button
														class="btn btn-ghost btn-xs"
														onclick={() => movePlayer(p.id, 1)}
														disabled={idx === room.turnOrder.length - 1}>↓</button
													>
													{#if !p.isHost}
														<button
															class="btn btn-ghost btn-xs text-error"
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
							<p class="mt-2 text-xs text-white/40">Volgorde = speelbeurten</p>
						{/if}
					</div>

					{#if isHost}
						<div class="space-y-3">
							<button
								class="btn btn-primary btn-lg px-10"
								onclick={() => gameClient.send({ type: 'start' })}
								disabled={isSingle && room.turnOrder.length < 1}
								>Start spel</button
							>
							<p class="text-sm text-white/45">
								Muziek:
								{#if room.spotify?.source === 'spotify' && room.spotify.playlistName}
									<span class="text-secondary">{room.spotify.playlistName}</span>
								{:else}
									<span class="text-white/60">mock-deck</span> — kies rechts een playlist
								{/if}
							</p>
						</div>
					{:else}
						<p class="text-white/60">
							Wachten tot {room.players.find((p) => p.isHost)?.name ?? 'host'} start…
						</p>
					{/if}

					<div>
						<button
							type="button"
							class="mb-3 flex w-full items-baseline justify-between gap-3 text-left"
							onclick={() => (showSettings = !showSettings)}
						>
							<div>
								<h2 class="font-display text-2xl">Regels</h2>
								{#if !showSettings}
									<p class="text-sm text-white/40">
										{room.settings.rulesVariant} · win op {room.settings.winAt} · {room.settings
											.challengeSeconds}s challenge
									</p>
								{/if}
							</div>
							<span class="text-sm text-white/40">{showSettings ? 'verberg' : 'pas aan'}</span>
						</button>
						{#if showSettings}
							<SettingsPanel settings={room.settings} disabled={!isHost} onChange={patchSettings} />
						{/if}
					</div>
				</div>

				{#if isHost}
					<div>
						<button
							type="button"
							class="mb-3 flex w-full items-baseline justify-between gap-3 text-left"
							onclick={() => (showMusic = !showMusic)}
						>
							<h2 class="font-display text-2xl">Muziek</h2>
							<span class="text-sm text-white/40">{showMusic ? 'verberg' : 'toon'}</span>
						</button>
						{#if showMusic}
							<SpotifyPanel
								roomCode={room.code}
								spotify={room.spotify ?? {
									connected: false,
									tier: 'unknown',
									displayName: null,
									playlistName: null,
									playlistId: null,
									source: 'mock'
								}}
								deckRemaining={room.deckRemaining}
							/>
						{/if}
					</div>
				{/if}
			</section>
		{:else}
			<!-- GAME -->
			<section class="anim-enter mt-5 space-y-6">
				<HostPlayback
					isHost={isHost || !!isSingle}
					{phase}
					track={room.turn.track}
					settings={room.settings}
					spotifySource={room.spotify?.source ?? 'mock'}
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

				{#if !privacyLocked && room.turn.lastResolve && (phase === 'RESOLVE' || phase === 'REVEAL' || phase === 'CHECK_WIN')}
					<div class="border-l-4 border-accent pl-4">
						<p class="font-display text-xl">{room.turn.lastResolve.message}</p>
						<p class="mt-1 text-white/60">
							{room.turn.lastResolve.title} — {room.turn.lastResolve.artist} ({room.turn.lastResolve
								.year})
						</p>
					</div>
				{:else if !privacyLocked && phase === 'REVEAL' && room.turn.track}
					<div class="border-l-4 border-primary pl-4">
						<p class="font-display text-3xl text-accent">{room.turn.track.year}</p>
						<p class="text-lg font-semibold">{room.turn.track.title}</p>
						<p class="text-white/60">{room.turn.track.artist}</p>
					</div>
				{/if}

				{#if !privacyLocked}
					{@const myBoard = isSingle ? seatPlayer : me}
					{@const myBoardIsActive =
						!!myBoard && myBoard.id === room.turn.activePlayerId}
					{@const canGuess =
						!!myBoard &&
						myBoardIsActive &&
						(phase === 'GUESSING' || phase === 'HOST_PLAYING')}
					{@const canChallenge =
						phase === 'CHALLENGE_WINDOW' &&
						!!activePlayer &&
						!!myBoard &&
						!myBoardIsActive &&
						((isSingle && isChallengeSeat) || !isSingle) &&
						myBoard.tokens > 0 &&
						!room.turn.claims.some((c) => c.playerId === myBoard.id)}
					{@const others = room.players.filter(
						(p) =>
							room.turnOrder.includes(p.id) &&
							p.id !== myBoard?.id &&
							!(phase === 'CHALLENGE_WINDOW' && p.id === room.turn.activePlayerId)
					)}

					<!-- JOUW BORD -->
					{#if myBoard}
						<section
							class="relative space-y-3 border-y-2 py-5"
							style="border-color:{myBoard.color}"
							aria-label="Jouw bord"
						>
							<div class="flex flex-wrap items-end justify-between gap-3">
								<div>
									<p
										class="text-xs font-semibold uppercase tracking-[0.3em]"
										style="color:{myBoard.color}"
									>
										Jouw bord
									</p>
									<h2 class="font-display text-3xl sm:text-4xl">{myBoard.name}</h2>
									<p class="text-sm text-white/45">
										{myBoard.timeline.length}/{room.settings.winAt} kaarten
										{#if myBoardIsActive && phase !== 'CHALLENGE_WINDOW'}
											· <span class="text-primary">jij bent aan de beurt</span>
										{:else if myBoardIsActive && phase === 'CHALLENGE_WINDOW'}
											· <span class="text-white/50">wacht op viesjes van anderen</span>
										{/if}
									</p>
								</div>
								<span
									class="rounded-full px-3 py-1 text-sm font-semibold"
									style="background:{myBoard.color}33;color:{myBoard.color}"
								>
									{myBoard.tokens} viesje{myBoard.tokens === 1 ? '' : 's'}
								</span>
							</div>

							<Timeline
								cards={myBoard.timeline}
								interactive={canGuess}
								selectedSlot={canGuess ? selectedSlot : null}
								lockedSlot={myBoardIsActive ? room.turn.lockedSlot : null}
								claims={myBoardIsActive ? room.turn.claims : []}
								playerColors={colorMap}
								onSelectSlot={(s) => {
									if (canGuess) selectedSlot = s;
								}}
							/>

							{#if canGuess}
								<div class="flex flex-wrap gap-2">
									<button class="btn btn-primary" disabled={selectedSlot == null} onclick={lockIn}
										>Lock in op jouw bord</button
									>
									<button
										class="btn btn-outline"
										onclick={() => gameClient.send({ type: 'skip_turn', asPlayerId: asId() })}
										disabled={myBoard.tokens < room.settings.skipCost}
									>
										Skip (−{room.settings.skipCost})
									</button>
								</div>
							{:else if phase === 'CHALLENGE_WINDOW' && myBoardIsActive}
								<p class="text-sm text-white/50">
									Jouw lock staat — viesjes komen op <em>jouw</em> bord
									{#if challengeLeft > 0}
										<span class="font-display text-secondary"> · {challengeLeft}s</span>
									{/if}
								</p>
							{/if}
						</section>
					{/if}

					<!-- CHALLENGE: viesjes op bord van actieve speler (niet op jouw eigen bord) -->
					{#if phase === 'CHALLENGE_WINDOW' && activePlayer && !privacyLocked && !myBoardIsActive}
						<section
							class="space-y-3 rounded-2xl border-2 border-secondary/40 bg-secondary/5 p-4 sm:p-5"
							aria-label="Challenge op bord van actieve speler"
						>
							<div class="flex flex-wrap items-end justify-between gap-3">
								<div>
									<p class="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
										Challenge · bord van {activePlayer.name}
									</p>
									<h2 class="font-display text-2xl sm:text-3xl">{activePlayer.name}</h2>
									<p class="text-sm text-white/55">
										Leg een viesje op een slot op <strong>dit</strong> bord (waar jij denkt dat het
										nummer hoort) — niet op jouw eigen bord.
									</p>
								</div>
								{#if challengeLeft > 0}
									<span class="font-display text-3xl text-secondary">{challengeLeft}s</span>
								{/if}
							</div>

							<Timeline
								cards={activePlayer.timeline}
								interactive={canChallenge}
								selectedSlot={canChallenge ? challengeSlot : null}
								lockedSlot={room.turn.lockedSlot}
								claims={room.turn.claims}
								playerColors={colorMap}
								onSelectSlot={(s) => {
									if (canChallenge) challengeSlot = s;
								}}
							/>

							{#if canChallenge}
								<div class="flex flex-wrap gap-2">
									<button
										class="btn btn-secondary"
										disabled={challengeSlot == null}
										onclick={placeChallenge}>Plaats viesje hier</button
									>
									{#if isSingle && myBoard}
										<button
											class="btn btn-outline"
											onclick={() =>
												gameClient.send({
													type: 'skip_challenge',
													asPlayerId: myBoard.id
												})}>Geen viesje</button
										>
									{/if}
								</div>
							{:else if isSingle && !isChallengeSeat}
								<p class="text-sm text-white/50">Wachten op challenge-seat…</p>
							{:else if myBoard && room.turn.claims.some((c) => c.playerId === myBoard.id)}
								<p class="text-sm text-secondary">Viesje geplaatst — wachten…</p>
							{/if}
						</section>
					{:else if !isSingle && activePlayer && me && activePlayer.id !== me.id && (phase === 'HOST_PLAYING' || phase === 'GUESSING' || phase === 'GUESS_LOCKED')}
						<section class="opacity-70" aria-label="Bord van actieve speler">
							<p class="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-white/35">
								Nu aan zet · niet jouw bord
							</p>
							<div class="mb-2 flex items-center gap-2">
								<span class="h-2.5 w-2.5 rounded-full" style="background:{activePlayer.color}"
								></span>
								<h3 class="font-display text-xl text-white/70">{activePlayer.name}</h3>
								<span class="text-xs text-white/35"
									>{activePlayer.timeline.length}/{room.settings.winAt}</span
								>
							</div>
							<Timeline
								cards={activePlayer.timeline}
								lockedSlot={room.turn.lockedSlot}
								dimYears
							/>
						</section>
					{/if}

					<!-- Andere spelers — secundair (actieve tijdens challenge zit hierboven) -->
					{#if others.length}
						<section class="space-y-3 pt-2" aria-label="Andere spelers">
							<p class="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
								Andere spelers
							</p>
							<div class="grid gap-4 sm:grid-cols-2">
								{#each others as p}
									<div class="border-l-2 border-white/15 pl-3">
										<div class="mb-1 flex items-center gap-2">
											<span class="h-2 w-2 rounded-full" style="background:{p.color}"></span>
											<span class="text-sm font-semibold text-white/75">{p.name}</span>
											<span class="ml-auto text-xs text-white/35"
												>{p.timeline.length}/{room.settings.winAt} · {p.tokens}◆</span
											>
										</div>
										{#if showAllTimelines}
											<div class="origin-left scale-[0.92] opacity-80">
												<Timeline cards={p.timeline} dimYears />
											</div>
										{:else}
											<p class="py-3 text-xs text-white/30">verborgen · privacy</p>
										{/if}
									</div>
								{/each}
							</div>
						</section>
					{/if}
				{/if}

				{#if !privacyLocked}
					<div class="flex flex-wrap gap-2">
						{#if seatPlayer && room.settings.threeForOneEnabled}
							<button
								class="btn btn-outline btn-sm"
								onclick={() =>
									gameClient.send({ type: 'three_for_one', asPlayerId: asId() })}
								disabled={seatPlayer.tokens < room.settings.threeForOneCost}
							>
								3-voor-1 (−{room.settings.threeForOneCost})
							</button>
						{/if}
						{#if isHost && (room.settings.challengeMode === 'host-reveal' || room.settings.challengeMode === 'both' || isSingle) && phase === 'CHALLENGE_WINDOW'}
							<button class="btn btn-accent btn-sm" onclick={() => gameClient.send({ type: 'host_reveal' })}
								>Reveal nu</button
							>
						{/if}
						{#if isHost}
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => gameClient.send({ type: 'host_skip_turn' })}>Skip beurt</button
							>
						{/if}
						<button class="btn btn-ghost btn-sm text-error" type="button" onclick={leaveRoom}
							>Leave</button
						>
					</div>
				{/if}
			</section>
		{/if}
	</main>
{:else if waitingRoom}
	<main class="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
		<span class="loading loading-spinner loading-lg text-primary"></span>
		<p class="text-sm text-white/60">Room {code} laden…</p>
		{#if snap.error}
			<p class="text-sm text-error">{snap.error}</p>
			<button
				class="btn btn-primary"
				onclick={() => {
					waitingRoom = false;
					joined = false;
				}}>Terug</button
			>
		{/if}
		<a class="btn btn-ghost btn-sm" href="/">Home</a>
	</main>
{:else}
	<main class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-5">
		<p class="text-sm uppercase tracking-[0.3em] text-secondary">room {code}</p>
		<h1 class="brand-word text-5xl">spotster</h1>
		<p class="text-white/60">Geen actieve sessie voor deze room.</p>
		{#if snap.error}<p class="text-sm text-error">{snap.error}</p>{/if}
		<button class="btn btn-primary" onclick={() => (joined = false)}>Join met naam</button>
		<a class="btn btn-ghost" href="/">Home</a>
	</main>
{/if}
