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
	import JoinQrOverlay from '#lib/components/JoinQrOverlay.svelte';
	import { PHASE_LABELS } from '#lib/game/engine';
	import type { GameSettings } from '#lib/game/types';
	import { gameClient, loadSession } from '#lib/ws/client';
	import { hostPlayer } from '#lib/spotify/player';

	let name = $state('');
	let joined = $state(false);
	let waitingRoom = $state(false);
	let selectedSlot = $state<number | null>(null);
	let challengeSlot = $state<number | null>(null);
	let showJoinQr = $state(false);
	let challengeLeft = $state(0);

	const code = $derived(page.params.code?.toUpperCase() ?? '');

	let snap = $state({
		connected: false,
		room: null as import('#lib/game/types').RoomPublic | null,
		playerId: null as string | null,
		error: null as string | null,
		notice: null as string | null,
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
				notice: s.notice,
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
		// Name input stays empty — no session prefill

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
		const locked = snap.room?.turn.lockedSlot;
		if (locked != null && challengeSlot === locked) {
			gameClient.state.update((s) => ({
				...s,
				error: 'Niet op dezelfde plek als de actieve speler — kies een ander slot'
			}));
			return;
		}
		if (snap.room?.turn.claims.some((c) => c.slotIndex === challengeSlot)) {
			gameClient.state.update((s) => ({
				...s,
				error: 'Dat slot heeft al een viesje'
			}));
			return;
		}
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
			<input
				class="input input-bordered input-lg"
				placeholder="bijv. Nick"
				bind:value={name}
				maxlength="20"
			/>
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
		class="game-shell min-h-dvh w-full pb-28 pt-3 sm:pb-24 sm:pt-4
			{privacyLocked ? 'pointer-events-none select-none blur-sm brightness-50' : ''}"
	>
		<header class="mb-4 flex min-w-0 flex-wrap items-end justify-between gap-3 border-b border-primary/30 pb-4">
			<div class="min-w-0">
				<p class="game-label">
					{inGame ? PHASE_LABELS[phase] : 'lobby'}
					{#if isSingle}
						· single-device
					{/if}
				</p>
				<h1 class="brand-word mt-1 text-4xl sm:text-5xl">spotster</h1>
			</div>
			<div class="flex shrink-0 flex-col items-end gap-2">
				<p class="font-display text-3xl tracking-[0.2em] text-accent">{room.code}</p>
				<p class="text-xs text-white/50">
					{snap.connected ? 'live' : 'reconnect…'} · {room.deckRemaining} tracks
				</p>
				<div class="flex flex-wrap justify-end gap-1">
					{#if isHost && !inGame}
						<button
							class="btn btn-secondary btn-sm min-h-10"
							type="button"
							onclick={() => (showJoinQr = true)}>QR join</button
						>
					{/if}
					<button class="btn btn-ghost btn-xs text-error" type="button" onclick={leaveRoom}
						>Leave</button
					>
				</div>
			</div>
		</header>

		<JoinQrOverlay code={room.code} open={showJoinQr} onClose={() => (showJoinQr = false)} />

		{#if snap.error}
			<div class="alert alert-warning mt-3 text-sm" role="alert">
				<span>{snap.error}</span>
				<button class="btn btn-ghost btn-xs" onclick={() => gameClient.clearError()}>ok</button>
			</div>
		{/if}
		{#if snap.notice}
			<div class="alert alert-info mt-3 text-sm" role="status">
				<span>{snap.notice}</span>
				<button class="btn btn-ghost btn-xs" onclick={() => gameClient.clearNotice()}>ok</button>
			</div>
		{/if}

		{#if !inGame}
			<section class="anim-enter mt-4 grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
				<div class="flex min-w-0 flex-col gap-4">
					{#if isHost}
						<div class="game-section">
							<h2 class="game-h">Modus <span class="game-h-sub">hoe speel je</span></h2>
							<div class="grid grid-cols-2 gap-2">
								<button
									class="btn min-h-12 text-base {room.playMode === 'multi' ? 'btn-primary' : 'btn-ghost border border-primary/25 bg-base-100/40'}"
									onclick={() => gameClient.send({ type: 'set_play_mode', mode: 'multi' })}
									>Multi-device</button
								>
								<button
									class="btn min-h-12 text-base {room.playMode === 'single' ? 'btn-secondary' : 'btn-ghost border border-primary/25 bg-base-100/40'}"
									onclick={() => gameClient.send({ type: 'set_play_mode', mode: 'single' })}
									>Single-device</button
								>
							</div>
						</div>
					{/if}

					<div class="game-section">
						<div class="mb-3 flex items-baseline justify-between gap-3">
							<h2 class="game-h mb-0">Spelers <span class="game-h-sub">volgorde = beurten</span></h2>
							<span class="text-sm font-semibold text-primary">{room.players.length}</span>
						</div>
						{#if isSingle && isHost}
							<SingleDeviceLobby players={room.players} turnOrder={room.turnOrder} />
						{:else}
							<ul class="divide-y divide-primary/15 rounded-xl border border-primary/20 bg-base-100/40">
								{#each room.turnOrder as pid, idx}
									{@const p = room.players.find((x) => x.id === pid)}
									{#if p}
										<li class="flex min-w-0 items-center gap-3 px-3 py-3.5">
											<span class="h-3 w-3 shrink-0 rounded-full" style="background:{p.color}"></span>
											<span class="min-w-0 flex-1 truncate font-semibold"
												>{p.name}
												{#if p.isHost}<span class="ml-1 text-xs font-normal text-primary">host</span>{/if}
												{#if !p.connected}<span class="ml-1 text-xs font-normal text-warning">offline</span>{/if}
											</span>
											{#if isHost && !isSingle}
												<div class="flex shrink-0 gap-1">
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
															class="btn btn-ghost btn-xs text-secondary"
															type="button"
															onclick={() =>
																gameClient.send({ type: 'transfer_host', playerId: p.id })}
															title="Maak deze speler host / DJ"
															>host</button
														>
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
						{/if}
					</div>

					{#if isHost}
						{@const spotifyReady =
							room.spotify?.source === 'spotify' &&
							!!room.spotify.playlistName &&
							room.deckRemaining >= 5}
						<div class="game-section space-y-3">
							<h2 class="game-h">Start <span class="game-h-sub">klaar voor de avond</span></h2>
							<button
								class="btn btn-secondary btn-lg min-h-12 w-full text-base"
								type="button"
								onclick={() => (showJoinQr = true)}>Toon QR om te joinen</button
							>
							<button
								class="btn btn-primary btn-lg min-h-14 w-full px-10 text-base"
								onclick={() => {
									// Same tap unlocks Web Playback / HTMLAudio so the first track can auto-start
									void hostPlayer?.unlockAudio();
									void hostPlayer?.initFromSession();
									gameClient.send({ type: 'start' });
								}}
								disabled={(isSingle && room.turnOrder.length < 1) || !spotifyReady}
								>Start spel</button
							>
							{#if !spotifyReady}
								<p class="text-base text-warning">
									Verbind Spotify en kies een playlist (min. 5 tracks) vóór Start — geen mock-deck.
								</p>
							{:else}
								<p class="text-base text-white/70">
									Muziek: <span class="text-secondary">{room.spotify?.playlistName}</span>
									· {room.deckRemaining} tracks
								</p>
							{/if}
						</div>
					{:else}
						<div class="game-section">
							<h2 class="game-h">Wachten</h2>
							<p class="text-white/70">
								Wachten tot {room.players.find((p) => p.isHost)?.name ?? 'host'} start…
							</p>
						</div>
					{/if}

					<div class="game-section">
						<h2 class="game-h">Regels <span class="game-h-sub">alles zichtbaar · host kan wijzigen</span></h2>
						<SettingsPanel settings={room.settings} disabled={!isHost} onChange={patchSettings} />
					</div>
				</div>

				{#if isHost}
					<div class="game-section min-w-0">
						<h2 class="game-h">Muziek <span class="game-h-sub">Spotify deck</span></h2>
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
					</div>
				{/if}
			</section>
		{:else}
			<!-- GAME -->
			<section class="anim-enter mt-3 flex min-w-0 flex-col gap-3">
				{#if phase === 'GAME_OVER'}
					<div class="rounded-3xl border border-accent/40 bg-accent/10 p-6 text-center">
						<p class="text-sm uppercase tracking-[0.3em] text-accent">winner</p>
						<p class="font-display mt-2 text-4xl">
							{room.players.find((p) => p.id === room.winnerId)?.name ?? '???'}
						</p>
						{#if isHost}
							<button
								class="btn btn-primary mt-4"
								onclick={() => {
									void hostPlayer?.unlockAudio();
									gameClient.send({ type: 'start' });
								}}>Nog een ronde</button
							>
						{/if}
					</div>
				{:else if activePlayer}
					{@const turnIsMine =
						(isSingle ? seatId === activePlayer.id : me?.id === activePlayer.id)}
					<header
						class="turn-banner min-w-0 rounded-2xl border-2 px-4 py-5 text-center sm:px-6 sm:py-6"
						style="border-color:{activePlayer.color}; background: color-mix(in srgb, {activePlayer.color} 18%, #0a0e18)"
						aria-live="polite"
					>
						<p
							class="text-xs font-bold uppercase tracking-[0.35em] sm:text-sm"
							style="color:{activePlayer.color}"
						>
							Aan de beurt
						</p>
						<p
							class="font-display mt-1 break-words text-[clamp(2.75rem,14vw,5.5rem)] leading-[0.9] tracking-tight"
							style="color:{activePlayer.color}"
						>
							{activePlayer.name}
						</p>
						<p class="mt-2 text-base text-white/70 sm:text-lg">
							{PHASE_LABELS[phase]}
							{#if turnIsMine}
								· <span class="text-primary font-semibold">dat ben jij</span>
							{/if}
							· {activePlayer.timeline.length}/{room.settings.winAt}
						</p>
					</header>
				{/if}

				<!-- Compact now-playing / host audio -->
				<div class="now-playing-compact min-w-0">
					<HostPlayback
						isHost={isHost || !!isSingle}
						{phase}
						track={room.turn.track}
						settings={room.settings}
						spotifySource={room.spotify?.source ?? 'mock'}
						titleConfirmPaused={!!room.titleConfirm}
						compact
					/>
				</div>

				{#if room.titleConfirm}
					<section
						class="anim-enter rounded-2xl border-2 border-secondary bg-secondary/15 px-4 py-4"
						aria-live="polite"
					>
						<p class="game-label text-secondary">Gepauzeerd · viesje-check</p>
						{#if isHost}
							<p class="font-display mt-1 text-2xl leading-tight text-white sm:text-3xl">
								{room.titleConfirm.playerName} claimt titel/artiest
							</p>
							<p class="mt-1 text-sm text-white/65">
								Speler noemt titel of artiest. Keur goed voor +1 viesje, of wijs af. Muziek &amp;
								timers staan stil.
							</p>
							<div class="mt-3 flex flex-wrap gap-2">
								<button
									type="button"
									class="btn btn-secondary btn-md min-h-12"
									onclick={() =>
										gameClient.send({
											type: 'token_earn_approve',
											playerId: room.titleConfirm!.playerId
										})}
								>
									Goedkeuren → +1 viesje
								</button>
								<button
									type="button"
									class="btn btn-outline btn-md min-h-12"
									onclick={() => gameClient.send({ type: 'token_earn_deny' })}
								>
									Afwijzen
								</button>
							</div>
						{:else}
							<p class="font-display mt-1 text-2xl leading-tight text-white sm:text-3xl">
								Wachten op host…
							</p>
							<p class="mt-1 text-sm text-white/65">
								{room.titleConfirm.playerName} wacht op bevestiging van titel/artiest. Spel &amp;
								muziek pauzeren.
							</p>
						{/if}
					</section>
				{/if}

				{#if !privacyLocked && room.turn.lastResolve && (phase === 'RESOLVE' || phase === 'CHECK_WIN')}
					{@const r = room.turn.lastResolve}
					{@const tone = r.stolenBy ? 'stolen' : r.correct || r.activeKept ? 'good' : 'miss'}
					<div
						class="score-banner anim-enter rounded-2xl border-2 px-4 py-4
							{tone === 'good'
							? 'border-success bg-success/15 text-success'
							: tone === 'stolen'
								? 'border-warning bg-warning/15 text-warning'
								: 'border-error bg-error/15 text-error'}"
						role="status"
					>
						<p class="text-xs font-bold uppercase tracking-[0.28em] opacity-80">
							{tone === 'good' ? 'Goed' : tone === 'stolen' ? 'Gestolen' : 'Fout'}
						</p>
						<p class="font-display mt-1 text-2xl leading-tight sm:text-3xl">{r.message}</p>
						<p class="mt-2 text-sm text-white/75">
							{r.title} — {r.artist} ({r.year})
						</p>
					</div>
				{:else if !privacyLocked && phase === 'REVEAL' && room.turn.track}
					<div class="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3">
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
							p.id !== room.turn.activePlayerId
					)}
					{@const insertId =
						room.turn.lastResolve && (phase === 'RESOLVE' || phase === 'CHECK_WIN')
							? (room.turn.lastResolve.trackId ?? room.turn.track?.id ?? null)
							: null}

					<!-- 1) ACTIEVE SPELER BORD — onder de grote turn-banner -->
					{#if activePlayer && myBoardIsActive}
						<section
							class="game-section relative min-w-0 space-y-3 border-l-4"
							style="border-left-color:{activePlayer.color}"
							aria-label="Jouw bord · aan de beurt"
						>
							<div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
								<p class="text-sm font-semibold text-white/80">
									Jouw bord
									{#if phase === 'CHALLENGE_WINDOW'}
										· <span class="text-white/50">wacht op viesjes</span>
									{/if}
								</p>
								<span
									class="rounded-full px-3 py-1 text-sm font-semibold"
									style="background:{activePlayer.color}33;color:{activePlayer.color}"
								>
									{activePlayer.tokens} viesje{activePlayer.tokens === 1 ? '' : 's'}
								</span>
							</div>

							<Timeline
								cards={activePlayer.timeline}
								interactive={canGuess}
								selectedSlot={canGuess ? selectedSlot : null}
								lockedSlot={room.turn.lockedSlot}
								claims={room.turn.claims}
								playerColors={colorMap}
								insertTrackId={room.turn.lastResolve?.activeKept ? insertId : null}
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
										disabled={activePlayer.tokens < room.settings.skipCost}
									>
										Skip (−{room.settings.skipCost})
									</button>
								</div>
							{:else if phase === 'CHALLENGE_WINDOW'}
								<p class="text-sm text-white/50">
									Jouw lock staat — viesjes komen op <em>jouw</em> bord
									{#if challengeLeft > 0}
										<span class="font-display text-secondary"> · {challengeLeft}s</span>
									{/if}
								</p>
							{/if}
						</section>
					{:else if activePlayer && phase === 'CHALLENGE_WINDOW'}
						<section
							class="game-section min-w-0 space-y-3 border-l-4 border-secondary/60"
							style="border-left-color: var(--spotster-teal)"
							aria-label="Challenge op actief bord"
						>
							<div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
								<p class="text-sm text-white/70">
									Challenge · leg een viesje op <strong class="text-secondary">dit</strong> bord
								</p>
								{#if challengeLeft > 0}
									<span class="font-display text-2xl text-secondary">{challengeLeft}s</span>
								{/if}
							</div>

							<Timeline
								cards={activePlayer.timeline}
								interactive={canChallenge}
								challengePick
								selectedSlot={canChallenge ? challengeSlot : null}
								lockedSlot={room.turn.lockedSlot}
								claims={room.turn.claims}
								playerColors={colorMap}
								onSelectSlot={(s) => {
									if (!canChallenge) return;
									if (room.turn.lockedSlot != null && s === room.turn.lockedSlot) return;
									if (room.turn.claims.some((c) => c.slotIndex === s)) return;
									challengeSlot = s;
								}}
							/>

							{#if canChallenge}
								<p class="text-xs text-white/50">
									Max 1 viesje · niet op de <span class="text-primary">lock</span> van
									{activePlayer.name}
								</p>
								<div class="flex flex-wrap gap-2">
									<button
										class="btn btn-secondary"
										disabled={challengeSlot == null ||
											challengeSlot === room.turn.lockedSlot}
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
					{:else if activePlayer}
						<section
							class="game-section min-w-0 space-y-2 border-l-4"
							style="border-left-color:{activePlayer.color}"
							aria-label="Bord van actieve speler"
						>
							<div class="flex min-w-0 items-center justify-between gap-2">
								<p class="text-sm text-white/60">Bord van {activePlayer.name}</p>
								<span
									class="rounded-full px-3 py-1 text-sm font-semibold"
									style="background:{activePlayer.color}33;color:{activePlayer.color}"
								>
									{activePlayer.tokens} viesje{activePlayer.tokens === 1 ? '' : 's'}
								</span>
							</div>
							<div class="min-w-0">
								<Timeline
									cards={activePlayer.timeline}
									lockedSlot={room.turn.lockedSlot}
									claims={room.turn.claims}
									playerColors={colorMap}
								/>
							</div>
						</section>
					{/if}

					<!-- 2) JOUW BORD — alleen als jij niet de actieve speler bent -->
					{#if myBoard && !myBoardIsActive}
						<section
							class="game-section relative min-w-0 space-y-3 border-l-4 opacity-95"
							style="border-left-color:{myBoard.color}"
							aria-label="Jouw bord"
						>
							<div class="flex min-w-0 flex-wrap items-end justify-between gap-3">
								<div class="min-w-0">
									<p class="game-label" style="color:{myBoard.color}">Jouw bord</p>
									<h2
										class="game-h mb-0 text-white"
										style="color:{myBoard.color}; text-shadow:none"
									>
										{myBoard.name}
									</h2>
									<p class="mt-1 text-sm text-white/60">
										{myBoard.timeline.length}/{room.settings.winAt} kaarten
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
								insertTrackId={room.turn.lastResolve?.stolenBy === myBoard.id
									? insertId
									: null}
							/>
						</section>
					{/if}

					<!-- 3) Andere spelers — onder actieve (+ jouw bord) -->
					{#if others.length}
						<section class="game-section min-w-0 space-y-3" aria-label="Andere spelers">
							<h2 class="game-h">Andere spelers</h2>
							<div class="grid min-w-0 gap-4 sm:grid-cols-2">
								{#each others as p}
									<div class="min-w-0 border-l-2 border-primary/25 pl-3">
										<div class="mb-1 flex min-w-0 items-center gap-2">
											<span class="h-2 w-2 shrink-0 rounded-full" style="background:{p.color}"></span>
											<span class="truncate text-sm font-semibold text-white/80">{p.name}</span>
											<span class="ml-auto shrink-0 text-xs text-white/45"
												>{p.timeline.length}/{room.settings.winAt} · {p.tokens}◆</span
											>
										</div>
										{#if showAllTimelines}
											<div class="min-w-0 grayscale">
												<Timeline
													cards={p.timeline}
													insertTrackId={room.turn.lastResolve?.stolenBy === p.id
														? insertId
														: null}
												/>
											</div>
										{:else}
											<p class="py-3 text-sm text-white/40">verborgen · privacy</p>
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
								title="Koop een zichtbare kaart uit het deck voor viesjes"
							>
								Koop kaart (−{room.settings.threeForOneCost} viesjes)
							</button>
						{/if}
						{#if seatPlayer && room.settings.tokenEarnMode !== 'off'}
							<button
								class="btn btn-ghost btn-sm border border-secondary/30"
								type="button"
								onclick={() =>
									gameClient.send({ type: 'request_token', asPlayerId: asId() })}
								disabled={seatPlayer.tokens >= room.settings.tokensMax || !!room.titleConfirm}
							>
								{room.titleConfirm?.playerId === seatPlayer.id
									? 'Wachten op host…'
									: 'Vraag viesje (liedje goed)'}
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

					{#if isHost && room.settings.tokenEarnMode === 'host' && !room.titleConfirm}
						<div class="game-section min-w-0 space-y-3">
							<h2 class="game-h">
								Liedje goed?
								<span class="game-h-sub">keur titel / artiest goed → +1 viesje</span>
							</h2>
							<p class="text-sm text-white/55">
								Of laat de speler op “Vraag viesje” drukken — dan pauzeert het spel tot jij
								bevestigt. Je kunt hier ook direct +1 geven.
							</p>
							<div class="flex flex-col gap-2">
								{#each room.players.filter((p) => room.turnOrder.includes(p.id)) as p}
									<button
										type="button"
										class="btn btn-secondary btn-md min-h-12 w-full justify-between gap-3 sm:w-auto"
										disabled={p.tokens >= room.settings.tokensMax}
										onclick={() =>
											gameClient.send({ type: 'token_earn_approve', playerId: p.id })}
									>
										<span class="flex min-w-0 items-center gap-2">
											<span
												class="h-2.5 w-2.5 shrink-0 rounded-full"
												style="background:{p.color}"
											></span>
											<span class="truncate font-semibold">{p.name}</span>
										</span>
										<span class="shrink-0 text-sm">+1 viesje · nu {p.tokens}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if isHost}
						<div class="game-section min-w-0 space-y-3">
							<h2 class="game-h">
								Host overdragen
								<span class="game-h-sub">Spotify-login blijft op oude host-browser</span>
							</h2>
							<p class="text-sm text-white/55">
								Nieuwe host krijgt DJ/settings. Die moet zelf Connect Spotify doen op hun toestel.
							</p>
							<div class="flex flex-col gap-2">
								{#each room.players.filter((p) => !p.isHost) as p}
									<button
										type="button"
										class="btn btn-outline btn-md min-h-11 w-full justify-between"
										onclick={() => gameClient.send({ type: 'transfer_host', playerId: p.id })}
									>
										<span class="flex items-center gap-2">
											<span class="h-2.5 w-2.5 rounded-full" style="background:{p.color}"></span>
											{p.name}
										</span>
										<span class="text-sm text-secondary">Maak host</span>
									</button>
								{/each}
							</div>
						</div>

						<details class="game-section min-w-0">
							<summary class="game-h cursor-pointer select-none">
								Settings mid-game
								<span class="game-h-sub">o.a. start-offset · speelduur · challenge</span>
							</summary>
							<div class="mt-3">
								<SettingsPanel
									settings={room.settings}
									mode="ingame"
									disabled={!isHost}
									onChange={patchSettings}
								/>
							</div>
						</details>
					{/if}
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
