<script lang="ts">
	import type { GameSettings, RulesVariant } from '#lib/game/types';

	interface Props {
		settings: GameSettings;
		disabled?: boolean;
		onChange: (partial: Partial<GameSettings>) => void;
	}

	let { settings, disabled = false, onChange }: Props = $props();

	const variants: { id: RulesVariant; label: string }[] = [
		{ id: 'original', label: 'Original' },
		{ id: 'pro', label: 'Pro' },
		{ id: 'expert', label: 'Expert' },
		{ id: 'teams', label: 'Teams' }
	];

	const durationOptions = [
		{ value: 0, label: 'Onbeperkt (volledig nummer)' },
		{ value: 15, label: '15 seconden' },
		{ value: 30, label: '30 seconden' },
		{ value: 45, label: '45 seconden' },
		{ value: 60, label: '60 seconden' },
		{ value: 90, label: '90 seconden' },
		{ value: 120, label: '2 minuten' }
	];
</script>

<div class="space-y-5">
	<div>
		<p class="game-label mb-2">Regelsvariant</p>
		<div class="grid grid-cols-2 gap-2">
			{#each variants as v}
				<button
					type="button"
					class="btn min-h-12 text-base {settings.rulesVariant === v.id
						? 'btn-primary'
						: 'btn-ghost border border-primary/25 bg-base-100/40'}"
					{disabled}
					onclick={() => onChange({ rulesVariant: v.id })}
				>
					{v.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-2 gap-3">
		<label class="form-control">
			<span class="label-text text-base text-white/70">Win op</span>
			<input
				type="number"
				inputmode="numeric"
				class="input input-bordered input-lg border-primary/20 bg-base-100"
				min="3"
				max="30"
				value={settings.winAt}
				{disabled}
				onchange={(e) => onChange({ winAt: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="form-control">
			<span class="label-text text-base text-white/70">Challenge (sec)</span>
			<input
				type="number"
				inputmode="numeric"
				class="input input-bordered input-lg border-primary/20 bg-base-100"
				min="3"
				max="60"
				value={settings.challengeSeconds}
				{disabled}
				onchange={(e) => onChange({ challengeSeconds: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="form-control">
			<span class="label-text text-base text-white/70">Startkaarten</span>
			<input
				type="number"
				inputmode="numeric"
				class="input input-bordered input-lg border-primary/20 bg-base-100"
				min="1"
				max="5"
				value={settings.startCards}
				{disabled}
				onchange={(e) => onChange({ startCards: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="form-control">
			<span class="label-text text-base text-white/70">Viesjes start</span>
			<input
				type="number"
				inputmode="numeric"
				class="input input-bordered input-lg border-primary/20 bg-base-100"
				min="0"
				max="10"
				value={settings.tokensStart}
				{disabled}
				onchange={(e) => onChange({ tokensStart: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="form-control">
			<span class="label-text text-base text-white/70">Viesjes max</span>
			<input
				type="number"
				inputmode="numeric"
				class="input input-bordered input-lg border-primary/20 bg-base-100"
				min="0"
				max="15"
				value={settings.tokensMax}
				{disabled}
				onchange={(e) => onChange({ tokensMax: Number(e.currentTarget.value) })}
			/>
		</label>
		<label class="form-control">
			<span class="label-text text-base text-white/70">Skip-kosten</span>
			<input
				type="number"
				inputmode="numeric"
				class="input input-bordered input-lg border-primary/20 bg-base-100"
				min="0"
				max="5"
				value={settings.skipCost}
				{disabled}
				onchange={(e) => onChange({ skipCost: Number(e.currentTarget.value) })}
			/>
		</label>
	</div>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<label class="form-control">
			<span class="label-text text-base text-white/70">Challenge-modus</span>
			<select
				class="select select-bordered select-lg border-primary/20 bg-base-100"
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
			<span class="label-text text-base text-white/70">Token verdienen</span>
			<select
				class="select select-bordered select-lg border-primary/20 bg-base-100"
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

	<div class="flex flex-col gap-3 rounded-xl border border-primary/20 bg-base-100/50 p-3 sm:flex-row sm:flex-wrap sm:items-center">
		<label class="label min-h-12 cursor-pointer justify-start gap-3">
			<input
				type="checkbox"
				class="toggle toggle-primary toggle-lg"
				checked={settings.hostPlays}
				{disabled}
				onchange={(e) => onChange({ hostPlays: e.currentTarget.checked })}
			/>
			<span class="label-text text-base">Host speelt mee</span>
		</label>
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
				<span class="label-text text-base text-white/70">3-voor-1 kosten</span>
				<input
					type="number"
					inputmode="numeric"
					class="input input-bordered input-lg border-primary/20 bg-base-100"
					min="1"
					max="10"
					value={settings.threeForOneCost}
					{disabled}
					onchange={(e) => onChange({ threeForOneCost: Number(e.currentTarget.value) })}
				/>
			</label>
		{/if}
	</div>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<label class="form-control">
			<span class="label-text text-base text-white/70">Speelduur</span>
			<select
				class="select select-bordered select-lg border-primary/20 bg-base-100"
				value={settings.playDurationSec}
				{disabled}
				onchange={(e) => onChange({ playDurationSec: Number(e.currentTarget.value) })}
			>
				{#each durationOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</label>
		<label class="form-control">
			<span class="label-text text-base text-white/70">Start-offset (sec)</span>
			<input
				type="number"
				inputmode="numeric"
				class="input input-bordered input-lg border-primary/20 bg-base-100"
				min="0"
				max="180"
				value={settings.playOffsetSec}
				{disabled}
				onchange={(e) => onChange({ playOffsetSec: Number(e.currentTarget.value) })}
			/>
		</label>
	</div>
</div>
