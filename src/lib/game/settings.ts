import type { GameSettings, RulesVariant } from './types';

/** Sensible Original defaults — everything overridable in lobby */
export const DEFAULT_SETTINGS: GameSettings = {
	rulesVariant: 'original',
	winAt: 10,
	startCards: 1,
	tokensStart: 2,
	tokensMax: 5,
	tokenEarnMode: 'host',
	challengeMode: 'timer',
	challengeSeconds: 12,
	threeForOneEnabled: true,
	threeForOneCost: 3,
	skipCost: 1,
	hostPlays: true,
	playDurationSec: 30,
	playOffsetSec: 0,
	disconnectGraceSec: 60,
	autoFlowDelayMs: 1800
};

/** Apply rules-variant presets, then keep any explicit overrides */
export function applyVariantPreset(
	variant: RulesVariant,
	base: GameSettings = DEFAULT_SETTINGS
): GameSettings {
	const next = { ...base, rulesVariant: variant };
	switch (variant) {
		case 'original':
			return {
				...next,
				winAt: 10,
				startCards: 1,
				tokensStart: 2,
				tokensMax: 5,
				threeForOneEnabled: true,
				threeForOneCost: 3
			};
		case 'pro':
			// Stub: shorter win, fewer tokens — flavour of "faster / sharper"
			return {
				...next,
				winAt: 8,
				startCards: 1,
				tokensStart: 1,
				tokensMax: 3,
				threeForOneEnabled: true,
				threeForOneCost: 3,
				challengeSeconds: 8
			};
		case 'expert':
			// Stub: start with more cards, no 3-for-1
			return {
				...next,
				winAt: 12,
				startCards: 2,
				tokensStart: 1,
				tokensMax: 3,
				threeForOneEnabled: false,
				challengeSeconds: 6
			};
		case 'teams':
			// Stub: same economy; teams pairing UI later (HIT later)
			return {
				...next,
				winAt: 10,
				startCards: 1,
				tokensStart: 3,
				tokensMax: 6,
				hostPlays: false
			};
		default:
			return next;
	}
}

export function mergeSettings(
	partial: Partial<GameSettings> | undefined,
	base: GameSettings = DEFAULT_SETTINGS
): GameSettings {
	if (!partial) return { ...base };
	const merged = { ...base, ...partial };
	merged.winAt = clamp(merged.winAt, 3, 30);
	merged.startCards = clamp(merged.startCards, 1, 5);
	merged.tokensStart = clamp(merged.tokensStart, 0, 10);
	merged.tokensMax = clamp(merged.tokensMax, 0, 15);
	merged.challengeSeconds = clamp(merged.challengeSeconds, 3, 60);
	merged.threeForOneCost = clamp(merged.threeForOneCost, 1, 10);
	merged.skipCost = clamp(merged.skipCost, 0, 5);
	merged.playDurationSec = clamp(merged.playDurationSec, 5, 120);
	merged.playOffsetSec = clamp(merged.playOffsetSec, 0, 180);
	merged.disconnectGraceSec = clamp(merged.disconnectGraceSec, 10, 300);
	merged.autoFlowDelayMs = clamp(merged.autoFlowDelayMs, 400, 5000);
	return merged;
}

function clamp(n: number, min: number, max: number) {
	return Math.max(min, Math.min(max, Math.round(n)));
}
