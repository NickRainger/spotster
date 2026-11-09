<script lang="ts">
	import { gameClient } from '#lib/ws/client';

	interface Props {
		players: { id: string; name: string; isHost: boolean; color: string }[];
		turnOrder: string[];
		disabled?: boolean;
	}

	let { players, turnOrder, disabled = false }: Props = $props();
	let newName = $state('');

	function add() {
		const n = newName.trim();
		if (!n) return;
		gameClient.send({ type: 'add_local_player', name: n });
		newName = '';
	}
</script>

<div class="rounded-3xl border border-secondary/30 bg-secondary/10 p-5">
	<h2 class="font-display text-2xl">Pass-and-play</h2>
	<p class="mt-1 text-sm text-white/60">
		Eén telefoon. Voeg iedereen toe — het scherm wisselt met “geef door”-schermen.
	</p>

	<ul class="mt-4 space-y-2">
		{#each turnOrder as pid, idx}
			{@const p = players.find((x) => x.id === pid)}
			{#if p}
				<li
					class="flex items-center gap-3 rounded-2xl border border-white/10 bg-base-100/40 px-3 py-2"
				>
					<span class="text-xs text-white/40">{idx + 1}</span>
					<span class="h-3 w-3 rounded-full" style="background:{p.color}"></span>
					<span class="flex-1 font-semibold"
						>{p.name}
						{#if p.isHost}<span class="text-xs text-primary">host/toestel</span>{/if}
					</span>
					{#if !p.isHost}
						<button
							class="btn btn-ghost btn-xs text-secondary"
							disabled={disabled}
							type="button"
							title="Maak host (Spotify blijft op dit toestel)"
							onclick={() => gameClient.send({ type: 'transfer_host', playerId: p.id })}
							>host</button
						>
						<button
							class="btn btn-ghost btn-xs text-error"
							disabled={disabled}
							onclick={() => gameClient.send({ type: 'remove_local_player', playerId: p.id })}
							>verwijder</button
						>
					{/if}
				</li>
			{/if}
		{/each}
	</ul>

	<div class="mt-4 flex gap-2">
		<input
			class="input input-bordered flex-1"
			placeholder="Naam speler"
			bind:value={newName}
			disabled={disabled}
			maxlength="20"
			onkeydown={(e) => e.key === 'Enter' && add()}
		/>
		<button class="btn btn-secondary" disabled={disabled || !newName.trim()} onclick={add}
			>Voeg toe</button
		>
	</div>
	<p class="mt-2 text-xs text-white/40">Minimaal 2 namen voor viesjes-rondes. Host = dit toestel.</p>
</div>
