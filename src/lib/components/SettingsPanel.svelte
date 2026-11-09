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
		<p class="mb-3 text-base text-white/60">Kies een tempo. Fine-tune alleen als je wilt.</p>
		<div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
			{#each variants as v}
				<button
					type="button"
					class="btn min-h-12 text-base {settings.rulesVariant === v.id
						? 'btn-primary'
						: 'btn-ghost border border-white/15'}"
					{disabled}
					onclick={() => onChange({ rulesVariant: v.id })}
				>
					{v.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-end sm:gap-6">
		<label class="form-control w-full sm:w-28">
			<span class="label-text text-base text-white/55">Win op</span>
			<input
				type="number"
				inputmode="numeric"
				class="input input-bordered input-lg"
				min="3"
				max="30"
				value={settings.winAt}
				{disabled}
				onchange={(e) => onChange({ winAt: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="form-control w-full sm:w-36">
			<span class="label-text text-base text-white/55">Challenge (sec)</span>
			<input
				type="number"
				inputmode="numeric"
				class="input input-bordered input-lg"
				min="3"
				max="60"
				value={settings.challengeSeconds}
				{disabled}
				onchange={(e) => onChange({ challengeSeconds: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="label col-span-2 min-h-12 cursor-pointer justify-start gap-3 py-2 sm:col-span-1 sm:pb-2">
			<input
				type="checkbox"
				class="toggle toggle-primary toggle-lg"
				checked={settings.hostPlays}
				{disabled}
				onchange={(e) => onChange({ hostPlays: e.currentTarget.checked })}
			/>
			<span class="label-text text-base">Host speelt mee</span>
		</label>
	</div>

	<button
		type="button"
		class="btn btn-ghost min-h-12 w-full justify-start px-0 text-base text-white/55 underline-offset-4 hover:bg-transparent hover:text-white/80 hover:underline sm:w-auto"
		onclick={() => (advanced = !advanced)}
	>
		{advanced ? 'Minder opties' : 'Meer opties'}
	</button>

	{#if advanced}
		<div class="space-y-4 border-t border-white/10 pt-4">
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<label class="form-control">
					<span class="label-text text-base text-white/55">Startkaarten</span>
					<input
						type="number"
						inputmode="numeric"
						class="input input-bordered input-lg"
						min="1"
						max="5"
						value={settings.startCards}
						{disabled}
						onchange={(e) => onChange({ startCards: Number(e.currentTarget.value) })}
					/>
				</label>
				<label class="form-control">
					<span class="label-text text-base text-white/55">Viesjes start</span>
					<input
						type="number"
						inputmode="numeric"
						class="input input-bordered input-lg"
						min="0"
						max="10"
						value={settings.tokensStart}
						{disabled}
						onchange={(e) => onChange({ tokensStart: Number(e.currentTarget.value) })}
					/>
				</label>
				<label class="form-control">
					<span class="label-text text-base text-white/55">Viesjes max</span>
					<input
						type="number"
						inputmode="numeric"
						class="input input-bordered input-lg"
						min="0"
						max="15"
						value={settings.tokensMax}
						{disabled}
						onchange={(e) => onChange({ tokensMax: Number(e.currentTarget.value) })}
					/>
				</label>
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<label class="form-control">
					<span class="label-text text-base text-white/55">Challenge-modus</span>
					<select
						class="select select-bordered select-lg"
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
					<span class="label-text text-base text-white/55">Token verdienen</span>
					<select
						class="select select-bordered select-lg"
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

			<div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
				<label class="label min-h-12 cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="toggle toggle-primary toggle-lg"
						checked={settings.threeForOneEnabled}
						{disabled}
						onchange={(e) => onChange({ threeForOneEnabled: e.currentTarget.checked })}
					/>
					<span class="label-text text-base">3-voor-1</span>
				</label>
				{#if settings.threeForOneEnabled}
					<label class="form-control w-full sm:w-28">
						<span class="label-text text-base text-white/55">Kosten</span>
						<input
							type="number"
							inputmode="numeric"
							class="input input-bordered input-lg"
							min="1"
							max="10"
							value={settings.threeForOneCost}
							{disabled}
							onchange={(e) => onChange({ threeForOneCost: Number(e.currentTarget.value) })}
						/>
					</label>
				{/if}
				<label class="form-control w-full sm:w-28">
					<span class="label-text text-base text-white/55">Skip-kosten</span>
					<input
						type="number"
						inputmode="numeric"
						class="input input-bordered input-lg"
						min="0"
						max="5"
						value={settings.skipCost}
						{disabled}
						onchange={(e) => onChange({ skipCost: Number(e.currentTarget.value) })}
					/>
				</label>
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<label class="form-control">
					<span class="label-text text-base text-white/55">Speelduur (sec)</span>
					<input
						type="number"
						inputmode="numeric"
						class="input input-bordered input-lg"
						min="5"
						max="120"
						value={settings.playDurationSec}
						{disabled}
						onchange={(e) => onChange({ playDurationSec: Number(e.currentTarget.value) })}
					/>
				</label>
				<label class="form-control">
					<span class="label-text text-base text-white/55">Start-offset (sec)</span>
					<input
						type="number"
						inputmode="numeric"
						class="input input-bordered input-lg"
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
