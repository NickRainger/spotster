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
		class="mx-auto min-h-dvh w-full max-w-6xl px-4 pb-24 pt-4 sm:px-6
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
			<section class="anim-enter mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
				<div class="space-y-4">
					{#if isHost}
						<div class="flex flex-wrap gap-2">
							<button
								class="btn {room.playMode === 'multi' ? 'btn-primary' : 'btn-outline'}"
								onclick={() => gameClient.send({ type: 'set_play_mode', mode: 'multi' })}
								>Multi-device</button
							>
							<button
								class="btn {room.playMode === 'single' ? 'btn-secondary' : 'btn-outline'}"
								onclick={() => gameClient.send({ type: 'set_play_mode', mode: 'single' })}
								>Single-device</button
							>
						</div>
					{/if}

					{#if isSingle && isHost}
						<SingleDeviceLobby players={room.players} turnOrder={room.turnOrder} />
					{:else}
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
											{#if isHost && !isSingle}
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
							<p class="mt-3 text-xs text-white/40">
								{isSingle
									? 'Schakel naar single-device als host om namen toe te voegen.'
									: 'Volgorde = speelbeurten. Host kan herordenen.'}
							</p>
						</div>
					{/if}

					{#if isHost}
						<div class="flex flex-wrap gap-2">
							<button
								class="btn btn-primary btn-lg"
								onclick={() => gameClient.send({ type: 'start' })}
								disabled={isSingle && room.turnOrder.length < 1}
								>Start spel</button
							>
						</div>
						{#if room.spotify}
							<p class="text-xs text-white/40">
								Audio: {room.spotify.source === 'spotify'
									? `${room.spotify.playlistName ?? 'Spotify'} (${room.spotify.tier})`
									: 'mock-deck'}
							</p>
						{/if}
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
					{:else}
						<p class="text-white/60">
							Wachten tot {room.players.find((p) => p.isHost)?.name ?? 'host'} start…
						</p>
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
						<SettingsPanel settings={room.settings} disabled={!isHost} onChange={patchSettings} />
					{/if}
				</div>
			</section>
		{:else}
			<!-- GAME -->
			<section class="anim-enter mt-5 space-y-5">
				{#if isSingle && seatPlayer && !privacyLocked}
					<div class="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm">
						Nu aan zet: <strong class="font-display text-lg">{seatPlayer.name}</strong>
						{#if phase === 'CHALLENGE_WINDOW'}
							<span class="text-white/50">— viesjes</span>
						{/if}
					</div>
				{/if}

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
					<div class="rounded-2xl border border-white/10 bg-base-200/70 p-4">
						<p class="font-display text-xl">{room.turn.lastResolve.message}</p>
						<p class="mt-1 text-white/60">
							{room.turn.lastResolve.title} — {room.turn.lastResolve.artist} ({room.turn.lastResolve
								.year})
						</p>
					</div>
				{:else if !privacyLocked && phase === 'REVEAL' && room.turn.track}
					<div class="rounded-2xl border border-primary/30 bg-primary/10 p-4">
						<p class="font-display text-3xl text-accent">{room.turn.track.year}</p>
						<p class="text-lg font-semibold">{room.turn.track.title}</p>
						<p class="text-white/60">{room.turn.track.artist}</p>
					</div>
				{/if}

				<!-- Active / seat timeline -->
				{#if !privacyLocked}
					<div class="rounded-3xl border border-white/10 bg-base-200/40 p-4">
						<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
							<h2 class="font-display text-xl">
								{#if isSingle}
									Tijdlijn van {seatPlayer?.name ?? activePlayer?.name ?? '…'}
								{:else if isActiveSeat}
									Jouw tijdlijn
								{:else}
									Tijdlijn van {activePlayer?.name ?? '…'}
								{/if}
							</h2>
							{#if seatPlayer}
								<span class="badge badge-lg border-0 bg-primary/20 text-primary"
									>{seatPlayer.tokens} viesje{seatPlayer.tokens === 1 ? '' : 's'}</span
								>
							{/if}
						</div>

						{#if (isActiveSeat || (isSingle && seatId === room.turn.activePlayerId)) && (phase === 'GUESSING' || phase === 'HOST_PLAYING')}
							{@const cards = isSingle
								? (activePlayer?.timeline ?? [])
								: (me?.timeline ?? [])}
							<Timeline
								cards={cards}
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
									onclick={() =>
										gameClient.send({ type: 'skip_turn', asPlayerId: asId() })}
									disabled={(seatPlayer?.tokens ?? 0) < room.settings.skipCost}
								>
									Skip (−{room.settings.skipCost})
								</button>
							</div>
						{:else if isActiveSeat || (isSingle && seatId === room.turn.activePlayerId)}
							<Timeline
								cards={isSingle ? (activePlayer?.timeline ?? []) : (me?.timeline ?? [])}
								lockedSlot={room.turn.lockedSlot}
							/>
						{:else if activePlayer && !isSingle}
							<Timeline cards={activePlayer.timeline} lockedSlot={room.turn.lockedSlot} />
						{/if}
					</div>
				{/if}

				<!-- Challenge -->
				{#if !privacyLocked && phase === 'CHALLENGE_WINDOW'}
					{#if isChallengeSeat && seatPlayer}
						<div class="rounded-3xl border border-secondary/30 bg-secondary/10 p-4">
							<div class="mb-2 flex items-center justify-between">
								<h2 class="font-display text-xl">Challenge — {seatPlayer.name}</h2>
								{#if challengeLeft > 0}
									<span class="font-display text-2xl text-secondary">{challengeLeft}s</span>
								{/if}
							</div>
							<p class="mb-2 text-sm text-white/60">
								Plaats een viesje op <em>jouw</em> tijdlijn, of sla over. Anderen kijken niet mee.
							</p>
							<Timeline
								cards={seatPlayer.timeline}
								interactive={seatPlayer.tokens > 0 &&
									!room.turn.claims.some((c) => c.playerId === seatPlayer.id)}
								selectedSlot={challengeSlot}
								claims={room.turn.claims.filter((c) => c.playerId === seatPlayer.id)}
								playerColors={colorMap}
								onSelectSlot={(s) => (challengeSlot = s)}
							/>
							<div class="mt-3 flex flex-wrap gap-2">
								<button
									class="btn btn-secondary"
									disabled={challengeSlot == null || seatPlayer.tokens < 1}
									onclick={placeChallenge}>Plaats viesje</button
								>
								<button
									class="btn btn-outline"
									onclick={() =>
										gameClient.send({ type: 'skip_challenge', asPlayerId: seatPlayer.id })}
									>Geen viesje</button
								>
							</div>
						</div>
					{:else if !isSingle && me && me.id !== room.turn.activePlayerId}
						<div class="rounded-3xl border border-secondary/30 bg-secondary/10 p-4">
							<div class="mb-2 flex items-center justify-between">
								<h2 class="font-display text-xl">Challenge — viesje op jouw slot</h2>
								{#if challengeLeft > 0}
									<span class="font-display text-2xl text-secondary">{challengeLeft}s</span>
								{/if}
							</div>
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
					{:else if isSingle}
						<div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/70">
							Wachten op challenge-seat…
						</div>
					{:else}
						<div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-white/70">
							Anderen mogen challengen…
							{#if challengeLeft > 0}
								<span class="font-display text-secondary"> {challengeLeft}s</span>
							{/if}
						</div>
					{/if}
				{/if}

				<!-- Player strip: public scores; dim private timelines in single -->
				{#if !privacyLocked}
					<div class="grid gap-3 sm:grid-cols-2">
						{#each room.players as p}
							{#if room.turnOrder.includes(p.id)}
								<div
									class="rounded-2xl border px-3 py-3
									{p.id === room.turn.activePlayerId
										? 'border-primary/50 bg-primary/10'
										: 'border-white/10 bg-base-200/30'}"
								>
									<div class="mb-1 flex items-center gap-2">
										<span class="h-2.5 w-2.5 rounded-full" style="background:{p.color}"></span>
										<span class="font-semibold">{p.name}</span>
										<span class="text-xs text-white/40"
											>{p.timeline.length}/{room.settings.winAt}</span
										>
										<span class="ml-auto text-xs text-primary">{p.tokens}◆</span>
									</div>
									{#if showAllTimelines || p.id === seatId || p.id === room.turn.activePlayerId}
										<Timeline
											cards={p.timeline}
											claims={room.turn.claims.filter((c) => c.playerId === p.id)}
											playerColors={colorMap}
										/>
									{:else}
										<p class="py-4 text-center text-xs text-white/35">verborgen · privacy</p>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
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
						<button
							class="btn btn-ghost btn-sm text-error"
							onclick={() => {
								gameClient.send({ type: 'leave' });
								goto('/');
							}}>Leave</button
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
