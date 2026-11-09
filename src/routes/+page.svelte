<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { gameClient, loadSession } from '#lib/ws/client';

	let name = $state('');
	let joinCode = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let mode: 'home' | 'create' | 'join' = $state('home');

	onMount(() => {
		gameClient.connect();
		const unsub = gameClient.state.subscribe((s) => {
			if (s.error) error = s.error;
			if (s.room?.code) {
				busy = false;
				goto(`/room/${s.room.code}`);
			}
		});
		const sess = loadSession();
		if (sess?.name) name = sess.name;
		if (sess?.code) joinCode = sess.code;
		return () => unsub();
	});

	function withBusyTimeout(action: () => void) {
		error = null;
		busy = true;
		gameClient.clearError();
		action();
		setTimeout(() => {
			if (busy) {
				busy = false;
				error = 'Geen antwoord van de server. Vernieuw de pagina en probeer opnieuw.';
			}
		}, 8000);
	}

	function createRoom() {
		withBusyTimeout(() => gameClient.send({ type: 'create', name: name.trim() || 'Host' }));
	}

	function joinRoom() {
		withBusyTimeout(() =>
			gameClient.send({
				type: 'join',
				code: joinCode.trim().toUpperCase(),
				name: name.trim() || 'Speler'
			})
		);
	}
</script>

<main class="relative mx-auto flex min-h-[100svh] min-h-dvh w-full max-w-5xl flex-col px-5 pb-10 pt-8 sm:pt-14">
	<section class="anim-enter relative flex min-h-[70svh] flex-1 flex-col justify-center">
		<div class="pointer-events-none absolute left-1/2 top-8 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl anim-glow" aria-hidden="true"></div>

		<p class="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-secondary/90">party timeline</p>
		<h1 class="brand-word text-[clamp(3.5rem,16vw,8rem)] leading-[0.85]">spotster</h1>
		<p class="mt-5 max-w-md text-lg text-white/70">
			Zet hits op de tijdlijn. Lock in. Challenge met viesjes. Geen bord — wel chaos.
		</p>

		{#if mode === 'home'}
			<div class="mt-10 flex flex-wrap gap-3">
				<button class="btn btn-primary btn-lg px-8" onclick={() => (mode = 'create')}>Start avond</button>
				<button class="btn btn-ghost btn-lg border border-white/15" onclick={() => (mode = 'join')}
					>Join met code</button
				>
			</div>
		{:else}
			<div class="anim-enter mt-10 max-w-md space-y-3 rounded-3xl border border-white/10 bg-base-200/60 p-5 backdrop-blur">
				<label class="form-control">
					<span class="label-text">Jouw naam</span>
					<input
						class="input input-bordered input-lg"
						placeholder="bijv. Nick"
						bind:value={name}
						maxlength="20"
					/>
				</label>
				{#if mode === 'join'}
					<label class="form-control">
						<span class="label-text">Roomcode</span>
						<input
							class="input input-bordered input-lg uppercase tracking-[0.3em]"
							placeholder="ABC123"
							bind:value={joinCode}
							maxlength="6"
						/>
					</label>
				{/if}
				{#if error}
					<p class="text-sm text-error">{error}</p>
				{/if}
				<div class="flex flex-wrap gap-2 pt-1">
					{#if mode === 'create'}
						<button class="btn btn-primary" disabled={busy} onclick={createRoom}>
							{busy ? 'Bezig…' : 'Maak room'}
						</button>
					{:else}
						<button class="btn btn-primary" disabled={busy || joinCode.trim().length < 4} onclick={joinRoom}>
							{busy ? 'Bezig…' : 'Join'}
						</button>
					{/if}
					<button class="btn btn-ghost" onclick={() => (mode = 'home')}>Terug</button>
				</div>
			</div>
		{/if}
	</section>

	<footer class="mt-auto pt-10 text-xs text-white/35">
		vriendengroep only · mock deck · spotify later
	</footer>
</main>
