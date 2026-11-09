<script lang="ts">
	import type { GameSettings, RulesVariant } from '#lib/game/types';

	interface Props {
		settings: GameSettings;
		disabled?: boolean;
		onChange: (partial: Partial<GameSettings>) => void;
	}

	let { settings, disabled = false, onChange }: Props = $props();
	let advanced = $state(false);

	const variants: { id: RulesVariant; label: string }[] = [
		{ id: 'original', label: 'Original' },
		{ id: 'pro', label: 'Pro' },
		{ id: 'expert', label: 'Expert' },
		{ id: 'teams', label: 'Teams' }
	];
</script>

<div class="space-y-6">
	<div>
		<p class="mb-3 text-sm text-white/55">Kies een tempo. Fine-tune alleen als je wilt.</p>
		<div class="flex flex-wrap gap-2">
			{#each variants as v}
				<button
					type="button"
					class="btn btn-sm {settings.rulesVariant === v.id ? 'btn-primary' : 'btn-ghost border border-white/15'}"
					{disabled}
					onclick={() => onChange({ rulesVariant: v.id })}
				>
					{v.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="flex flex-wrap items-end gap-6">
		<label class="form-control w-28">
			<span class="label-text text-white/50">Win op</span>
			<input
				type="number"
				class="input input-bordered"
				min="3"
				max="30"
				value={settings.winAt}
				{disabled}
				onchange={(e) => onChange({ winAt: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="form-control w-36">
			<span class="label-text text-white/50">Challenge (sec)</span>
			<input
				type="number"
				class="input input-bordered"
				min="3"
				max="60"
				value={settings.challengeSeconds}
				{disabled}
				onchange={(e) => onChange({ challengeSeconds: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="label cursor-pointer gap-2 pb-2">
			<input
				type="checkbox"
				class="toggle toggle-primary toggle-sm"
				checked={settings.hostPlays}
				{disabled}
				onchange={(e) => onChange({ hostPlays: e.currentTarget.checked })}
			/>
			<span class="label-text">Host speelt mee</span>
		</label>
	</div>

	<button
		type="button"
		class="text-sm text-white/45 underline-offset-4 hover:text-white/70 hover:underline"
		onclick={() => (advanced = !advanced)}
	>
		{advanced ? 'Minder opties' : 'Meer opties'}
	</button>

	{#if advanced}
		<div class="space-y-4 border-t border-white/10 pt-4">
			<div class="grid gap-3 sm:grid-cols-3">
				<label class="form-control">
					<span class="label-text text-white/50">Startkaarten</span>
					<input
						type="number"
						class="input input-bordered"
						min="1"
						max="5"
						value={settings.startCards}
						{disabled}
						onchange={(e) => onChange({ startCards: Number(e.currentTarget.value) })}
					/>
				</label>
				<label class="form-control">
					<span class="label-text text-white/50">Viesjes start</span>
					<input
						type="number"
						class="input input-bordered"
						min="0"
						max="10"
						value={settings.tokensStart}
						{disabled}
						onchange={(e) => onChange({ tokensStart: Number(e.currentTarget.value) })}
					/>
				</label>
				<label class="form-control">
					<span class="label-text text-white/50">Viesjes max</span>
					<input
						type="number"
						class="input input-bordered"
						min="0"
						max="15"
						value={settings.tokensMax}
						{disabled}
						onchange={(e) => onChange({ tokensMax: Number(e.currentTarget.value) })}
					/>
				</label>
			</div>

			<div class="grid gap-3 sm:grid-cols-2">
				<label class="form-control">
					<span class="label-text text-white/50">Challenge-modus</span>
					<select
						class="select select-bordered"
						value={settings.challengeMode}
						{disabled}
						onchange={(e) =>
							onChange({
								challengeMode: e.currentTarget.value as GameSettings['challengeMode']
							})}
					>
						<option value="timer">Timer</option>
						<option value="host-reveal">Host reveal</option>
						<option value="both">Timer + host reveal</option>
					</select>
				</label>
				<label class="form-control">
					<span class="label-text text-white/50">Token verdienen</span>
					<select
						class="select select-bordered"
						value={settings.tokenEarnMode}
						{disabled}
						onchange={(e) =>
							onChange({
								tokenEarnMode: e.currentTarget.value as GameSettings['tokenEarnMode']
							})}
					>
						<option value="host">Host keurt goed</option>
						<option value="votes">Stemmen (stub)</option>
						<option value="off">Uit</option>
					</select>
				</label>
			</div>

			<div class="flex flex-wrap items-end gap-4">
				<label class="label cursor-pointer gap-2">
					<input
						type="checkbox"
						class="toggle toggle-primary toggle-sm"
						checked={settings.threeForOneEnabled}
						{disabled}
						onchange={(e) => onChange({ threeForOneEnabled: e.currentTarget.checked })}
					/>
					<span class="label-text">3-voor-1</span>
				</label>
				{#if settings.threeForOneEnabled}
					<label class="form-control w-24">
						<span class="label-text text-white/50">Kosten</span>
						<input
							type="number"
							class="input input-bordered input-sm"
							min="1"
							max="10"
							value={settings.threeForOneCost}
							{disabled}
							onchange={(e) => onChange({ threeForOneCost: Number(e.currentTarget.value) })}
						/>
					</label>
				{/if}
				<label class="form-control w-28">
					<span class="label-text text-white/50">Skip-kosten</span>
					<input
						type="number"
						class="input input-bordered input-sm"
						min="0"
						max="5"
						value={settings.skipCost}
						{disabled}
						onchange={(e) => onChange({ skipCost: Number(e.currentTarget.value) })}
					/>
				</label>
			</div>

			<div class="grid gap-3 sm:grid-cols-2">
				<label class="form-control">
					<span class="label-text text-white/50">Speelduur (sec)</span>
					<input
						type="number"
						class="input input-bordered"
						min="5"
						max="120"
						value={settings.playDurationSec}
						{disabled}
						onchange={(e) => onChange({ playDurationSec: Number(e.currentTarget.value) })}
					/>
				</label>
				<label class="form-control">
					<span class="label-text text-white/50">Start-offset (sec)</span>
					<input
						type="number"
						class="input input-bordered"
						min="0"
						max="180"
						value={settings.playOffsetSec}
						{disabled}
						onchange={(e) => onChange({ playOffsetSec: Number(e.currentTarget.value) })}
					/>
				</label>
			</div>
		</div>
	{/if}
</div>
