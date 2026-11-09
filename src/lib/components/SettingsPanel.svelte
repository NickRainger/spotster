<script lang="ts">
	import type { GameSettings, RulesVariant } from '#lib/game/types';

	interface Props {
		settings: GameSettings;
		disabled?: boolean;
		onChange: (partial: Partial<GameSettings>) => void;
	}

	let { settings, disabled = false, onChange }: Props = $props();

	const variants: { id: RulesVariant; label: string; hint: string }[] = [
		{ id: 'original', label: 'Original', hint: 'Win op 10 · klassieke viesjes' },
		{ id: 'pro', label: 'Pro', hint: 'Sneller · kortere challenge' },
		{ id: 'expert', label: 'Expert', hint: 'Meer startkaarten · geen 3-voor-1' },
		{ id: 'teams', label: 'Teams', hint: 'Stub — host speelt niet mee' }
	];
</script>

<div class="space-y-5">
	<div>
		<p class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Regelsvariant</p>
		<div class="grid grid-cols-2 gap-2">
			{#each variants as v}
				<button
					type="button"
					class="rounded-2xl border px-3 py-3 text-left transition
						{settings.rulesVariant === v.id
						? 'border-primary bg-primary/15'
						: 'border-white/10 bg-white/5 hover:border-white/25'}"
					{disabled}
					onclick={() => onChange({ rulesVariant: v.id })}
				>
					<span class="font-display block text-lg">{v.label}</span>
					<span class="text-xs text-white/50">{v.hint}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		<label class="form-control">
			<span class="label-text text-white/50">Win op N kaarten</span>
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
			<span class="label-text text-white/50">Challenge</span>
			<select
				class="select select-bordered"
				value={settings.challengeMode}
				{disabled}
				onchange={(e) =>
					onChange({ challengeMode: e.currentTarget.value as GameSettings['challengeMode'] })}
			>
				<option value="timer">Timer</option>
				<option value="host-reveal">Host reveal</option>
				<option value="both">Timer + host reveal</option>
			</select>
		</label>
		<label class="form-control">
			<span class="label-text text-white/50">Challenge seconden</span>
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
		<label class="form-control">
			<span class="label-text text-white/50">Token verdienen</span>
			<select
				class="select select-bordered"
				value={settings.tokenEarnMode}
				{disabled}
				onchange={(e) =>
					onChange({ tokenEarnMode: e.currentTarget.value as GameSettings['tokenEarnMode'] })}
			>
				<option value="host">Host keurt goed</option>
				<option value="votes">Stemmen (stub: auto)</option>
				<option value="off">Uit</option>
			</select>
		</label>
		<label class="form-control">
			<span class="label-text text-white/50">Skip-kosten (viesjes)</span>
			<input
				type="number"
				class="input input-bordered"
				min="0"
				max="5"
				value={settings.skipCost}
				{disabled}
				onchange={(e) => onChange({ skipCost: Number(e.currentTarget.value) })}
			/>
		</label>
	</div>

	<div class="flex flex-wrap gap-4">
		<label class="label cursor-pointer gap-2">
			<input
				type="checkbox"
				class="toggle toggle-primary"
				checked={settings.threeForOneEnabled}
				{disabled}
				onchange={(e) => onChange({ threeForOneEnabled: e.currentTarget.checked })}
			/>
			<span class="label-text">3-voor-1 aan</span>
		</label>
		{#if settings.threeForOneEnabled}
			<label class="form-control w-28">
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
		<label class="label cursor-pointer gap-2">
			<input
				type="checkbox"
				class="toggle toggle-secondary"
				checked={settings.hostPlays}
				{disabled}
				onchange={(e) => onChange({ hostPlays: e.currentTarget.checked })}
			/>
			<span class="label-text">Host speelt mee</span>
		</label>
	</div>

	<div class="rounded-2xl border border-dashed border-white/15 bg-white/5 p-3">
		<p class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-secondary/80">
			Spotify (HIT-4 stub)
		</p>
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
		<p class="mt-2 text-xs text-white/40">Nu: mock-deck met fake tracks. Geen Spotify-audio.</p>
	</div>
</div>
