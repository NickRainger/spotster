/**
 * Host-side playback: Web Playback SDK (Premium) or HTMLAudio preview (Free).
 * Must call unlockAudio() from a user gesture on iOS.
 */

import type { SpotifyAccountTier, SpotifyPlaybackSettings } from './stub';

declare global {
	interface Window {
		Spotify?: {
			Player: new (opts: {
				name: string;
				getOAuthToken: (cb: (token: string) => void) => void;
				volume?: number;
			}) => SpotifyPlayerInstance;
		};
		onSpotifyWebPlaybackSDKReady?: () => void;
	}
}

interface SpotifyPlayerInstance {
	connect: () => Promise<boolean>;
	disconnect: () => void;
	addListener: (event: string, cb: (state: any) => void) => void;
	removeListener: (event: string, cb?: (state: any) => void) => void;
	getCurrentState: () => Promise<any>;
	pause: () => Promise<void>;
	resume: () => Promise<void>;
	seek: (ms: number) => Promise<void>;
	activateElement: () => Promise<void>;
}

export type PlaybackMode = 'premium' | 'preview' | 'mock' | 'none';

export interface HostPlayerStatus {
	mode: PlaybackMode;
	tier: SpotifyAccountTier;
	deviceId: string | null;
	ready: boolean;
	error: string | null;
	playing: boolean;
}

type StatusListener = (s: HostPlayerStatus) => void;

export class HostSpotifyPlayer {
	status: HostPlayerStatus = {
		mode: 'none',
		tier: 'unknown',
		deviceId: null,
		ready: false,
		playing: false,
		error: null
	};

	private listeners = new Set<StatusListener>();
	private sdkPlayer: SpotifyPlayerInstance | null = null;
	private audio: HTMLAudioElement | null = null;
	private stopTimer: ReturnType<typeof setTimeout> | null = null;
	private unlocked = false;
	private accessToken: string | null = null;

	onStatus(fn: StatusListener) {
		this.listeners.add(fn);
		fn(this.status);
		return () => this.listeners.delete(fn);
	}

	private emit() {
		for (const fn of this.listeners) fn({ ...this.status });
	}

	private set(partial: Partial<HostPlayerStatus>) {
		this.status = { ...this.status, ...partial };
		this.emit();
	}

	async unlockAudio() {
		if (typeof window === 'undefined') return;
		if (!this.audio) this.audio = new Audio();
		try {
			this.audio.src =
				'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
			await this.audio.play();
			this.audio.pause();
			this.unlocked = true;
			if (this.sdkPlayer) {
				await this.sdkPlayer.activateElement?.();
			}
		} catch {
			// gesture may still be required later
		}
	}

	async initFromSession(): Promise<HostPlayerStatus> {
		try {
			const sess = await fetch('/api/spotify/session').then((r) => r.json());
			if (!sess.connected) {
				this.set({ mode: 'mock', ready: true, tier: 'unknown', error: null });
				return this.status;
			}
			this.set({ tier: sess.tier ?? 'unknown' });
			const tok = await fetch('/api/spotify/token').then((r) => r.json());
			if (!tok.accessToken) {
				this.set({ mode: 'mock', ready: true, error: tok.error ?? 'Geen token' });
				return this.status;
			}
			this.accessToken = tok.accessToken;
			if (sess.tier === 'premium') {
				await this.initSdk();
			} else {
				this.set({ mode: 'preview', ready: true, error: null });
			}
		} catch (e) {
			this.set({
				mode: 'mock',
				ready: true,
				error: e instanceof Error ? e.message : 'Spotify init failed'
			});
		}
		return this.status;
	}

	private async loadSdkScript() {
		if (window.Spotify) return;
		await new Promise<void>((resolve, reject) => {
			const prev = window.onSpotifyWebPlaybackSDKReady;
			window.onSpotifyWebPlaybackSDKReady = () => {
				prev?.();
				resolve();
			};
			const s = document.createElement('script');
			s.src = 'https://sdk.scdn.co/spotify-player.js';
			s.async = true;
			s.onerror = () => reject(new Error('Web Playback SDK load failed'));
			document.body.appendChild(s);
			setTimeout(() => {
				if (window.Spotify) resolve();
			}, 4000);
		});
	}

	private async initSdk() {
		await this.loadSdkScript();
		if (!window.Spotify) {
			this.set({ mode: 'preview', ready: true, error: 'SDK niet beschikbaar — preview fallback' });
			return;
		}
		const player = new window.Spotify.Player({
			name: 'Spotster Host',
			getOAuthToken: async (cb) => {
				try {
					const tok = await fetch('/api/spotify/token').then((r) => r.json());
					this.accessToken = tok.accessToken ?? this.accessToken;
					if (this.accessToken) cb(this.accessToken);
				} catch {
					if (this.accessToken) cb(this.accessToken);
				}
			},
			volume: 0.85
		});
		player.addListener('ready', ({ device_id }: { device_id: string }) => {
			this.set({ deviceId: device_id, ready: true, mode: 'premium', error: null });
		});
		player.addListener('not_ready', () => {
			this.set({ ready: false });
		});
		player.addListener('initialization_error', ({ message }: { message: string }) => {
			this.set({ mode: 'preview', ready: true, error: message });
		});
		player.addListener('authentication_error', ({ message }: { message: string }) => {
			this.set({ mode: 'preview', ready: true, error: message });
		});
		player.addListener('account_error', ({ message }: { message: string }) => {
			// Non-premium → preview path
			this.set({ mode: 'preview', ready: true, error: message, tier: 'free' });
		});
		player.addListener('player_state_changed', (state: { paused?: boolean } | null) => {
			this.set({ playing: !!state && !state.paused });
		});
		this.sdkPlayer = player;
		const ok = await player.connect();
		if (!ok) {
			this.set({ mode: 'preview', ready: true, error: 'SDK connect failed — preview fallback' });
		}
	}

	async playTrack(
		opts: {
			uri?: string | null;
			previewUrl?: string | null;
			mockFallback?: () => void;
		} & SpotifyPlaybackSettings
	) {
		this.clearStopTimer();
		const offsetMs = Math.max(0, (opts.playOffsetSec ?? 0) * 1000);
		const durationMs = Math.max(3000, (opts.playDurationSec ?? 30) * 1000);

		if (this.status.mode === 'premium' && opts.uri && this.status.deviceId && this.accessToken) {
			try {
				await this.playPremium(opts.uri, offsetMs);
				this.armStop(durationMs);
				this.set({ playing: true });
				return;
			} catch (e) {
				this.set({ error: e instanceof Error ? e.message : 'Premium play failed' });
			}
		}

		if (opts.previewUrl) {
			try {
				await this.playPreview(opts.previewUrl, offsetMs);
				this.armStop(Math.min(durationMs, 30_000 - offsetMs));
				this.set({ mode: this.status.mode === 'premium' ? 'preview' : this.status.mode, playing: true });
				return;
			} catch (e) {
				this.set({ error: e instanceof Error ? e.message : 'Preview play failed' });
			}
		}

		opts.mockFallback?.();
		this.set({ mode: 'mock', playing: true });
		this.armStop(durationMs);
	}

	private async playPremium(uri: string, offsetMs: number) {
		if (!this.accessToken || !this.status.deviceId) throw new Error('Geen device');
		if (this.sdkPlayer) await this.sdkPlayer.activateElement?.();
		const res = await fetch(
			`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(this.status.deviceId)}`,
			{
				method: 'PUT',
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					uris: [uri],
					position_ms: offsetMs
				})
			}
		);
		if (!res.ok && res.status !== 204) {
			const text = await res.text();
			throw new Error(`Play failed: ${res.status} ${text}`);
		}
	}

	private async playPreview(url: string, offsetMs: number) {
		if (!this.audio) this.audio = new Audio();
		this.audio.pause();
		this.audio.src = url;
		this.audio.currentTime = Math.max(0, offsetMs / 1000);
		await this.audio.play();
	}

	async pause() {
		this.clearStopTimer();
		try {
			await this.sdkPlayer?.pause();
		} catch {
			/* ignore */
		}
		this.audio?.pause();
		this.set({ playing: false });
	}

	private armStop(ms: number) {
		this.clearStopTimer();
		this.stopTimer = setTimeout(() => {
			void this.pause();
		}, ms);
	}

	private clearStopTimer() {
		if (this.stopTimer) clearTimeout(this.stopTimer);
		this.stopTimer = null;
	}

	destroy() {
		this.clearStopTimer();
		void this.pause();
		this.sdkPlayer?.disconnect();
		this.sdkPlayer = null;
		this.listeners.clear();
	}
}

export const hostPlayer = typeof window !== 'undefined' ? new HostSpotifyPlayer() : null;
