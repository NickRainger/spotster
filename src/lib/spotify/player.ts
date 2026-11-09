/**
 * Host-side playback: Web Playback SDK (Premium) or HTMLAudio preview (Free).
 *
 * Click reliability notes:
 * - activateElement() must run in the user-gesture call stack (before awaits).
 * - Do NOT transfer(play:false) before every /play — Spotify races those calls.
 * - playFromUserGesture must not unlock+replay the same track twice.
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
	togglePlay: () => Promise<void>;
}

export type PlaybackMode = 'premium' | 'preview' | 'mock' | 'none';

export interface PlayTrackOpts extends SpotifyPlaybackSettings {
	uri?: string | null;
	previewUrl?: string | null;
	mockFallback?: () => void;
	/** true = called from click/tap (Unlock / Play) */
	fromUserGesture?: boolean;
}

export interface HostPlayerStatus {
	mode: PlaybackMode;
	tier: SpotifyAccountTier;
	deviceId: string | null;
	ready: boolean;
	error: string | null;
	playing: boolean;
	/** Audio element / SDK armed via user gesture */
	unlocked: boolean;
	/** Auto-start failed or blocked — host must tap Play */
	needsGesture: boolean;
	busy: boolean;
}

type StatusListener = (s: HostPlayerStatus) => void;

export class HostSpotifyPlayer {
	status: HostPlayerStatus = {
		mode: 'none',
		tier: 'unknown',
		deviceId: null,
		ready: false,
		playing: false,
		error: null,
		unlocked: false,
		needsGesture: false,
		busy: false
	};

	private listeners = new Set<StatusListener>();
	private sdkPlayer: SpotifyPlayerInstance | null = null;
	private audio: HTMLAudioElement | null = null;
	private stopTimer: ReturnType<typeof setTimeout> | null = null;
	private unlocked = false;
	private accessToken: string | null = null;
	private pending: PlayTrackOpts | null = null;
	private lastOpts: PlayTrackOpts | null = null;
	private readyWaiters: Array<() => void> = [];
	private playSeq = 0;
	private transferredOnce = false;

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

	/** Sync part of a user gesture — call before any await. */
	private armGestureSync() {
		if (typeof window === 'undefined') return;
		if (!this.audio) this.audio = new Audio();
		// Fire-and-forget silent arm so HTMLAudio is unlocked in this gesture tick
		try {
			this.audio.src =
				'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
			void this.audio.play().then(() => this.audio?.pause()).catch(() => null);
		} catch {
			/* ignore */
		}
		if (this.sdkPlayer) {
			try {
				void this.sdkPlayer.activateElement?.();
			} catch {
				/* ignore */
			}
		}
		this.unlocked = true;
		this.set({ unlocked: true, needsGesture: false });
	}

	/** Call from a tap/click. Arms audio + flushes any pending auto-play track. */
	async unlockAudio() {
		if (typeof window === 'undefined') return;
		this.armGestureSync();
		this.set({ error: null });
		if (this.pending) {
			const opts = this.pending;
			this.pending = null;
			await this.playTrack({ ...opts, fromUserGesture: true });
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
			for (const w of this.readyWaiters.splice(0)) w();
		});
		player.addListener('not_ready', () => {
			this.set({ ready: false });
			this.transferredOnce = false;
		});
		player.addListener('initialization_error', ({ message }: { message: string }) => {
			this.set({ mode: 'preview', ready: true, error: message });
		});
		player.addListener('authentication_error', ({ message }: { message: string }) => {
			this.set({ mode: 'preview', ready: true, error: message });
		});
		player.addListener('account_error', ({ message }: { message: string }) => {
			this.set({ mode: 'preview', ready: true, error: message, tier: 'free' });
		});
		player.addListener('autoplay_failed', () => {
			this.set({
				playing: false,
				needsGesture: true,
				unlocked: false,
				error: 'Browser blokkeert autoplay — tik Speel'
			});
			this.unlocked = false;
		});
		player.addListener('player_state_changed', (state: { paused?: boolean } | null) => {
			// Ignore null/transient states while a play request is in flight
			if (this.status.busy) return;
			if (!state) return;
			this.set({ playing: !state.paused });
		});
		this.sdkPlayer = player;
		const ok = await player.connect();
		if (!ok) {
			this.set({ mode: 'preview', ready: true, error: 'SDK connect failed — preview fallback' });
		}
	}

	private waitForDevice(ms = 8000): Promise<boolean> {
		if (this.status.deviceId) return Promise.resolve(true);
		return new Promise((resolve) => {
			const t = setTimeout(() => {
				this.readyWaiters = this.readyWaiters.filter((w) => w !== done);
				resolve(!!this.status.deviceId);
			}, ms);
			const done = () => {
				clearTimeout(t);
				resolve(true);
			};
			this.readyWaiters.push(done);
		});
	}

	/** One-time soft transfer so Spotster shows up as the active device. */
	private async ensureDevice() {
		if (!this.accessToken || !this.status.deviceId || this.transferredOnce) return;
		const res = await fetch('https://api.spotify.com/v1/me/player', {
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ device_ids: [this.status.deviceId], play: false })
		}).catch(() => null);
		// 204 ok, 404 = nothing was playing yet — still fine for subsequent /play?device_id=
		if (!res || res.ok || res.status === 404 || res.status === 204) {
			this.transferredOnce = true;
		}
	}

	async playTrack(opts: PlayTrackOpts) {
		this.clearStopTimer();
		this.lastOpts = { ...opts };
		const offsetMs = Math.max(0, (opts.playOffsetSec ?? 0) * 1000);
		const unlimited = !opts.playDurationSec || opts.playDurationSec <= 0;
		const durationMs = unlimited ? 0 : Math.max(3000, opts.playDurationSec * 1000);
		const fromGesture = !!opts.fromUserGesture;
		const seq = ++this.playSeq;

		if (!fromGesture && !this.unlocked) {
			this.pending = opts;
			this.set({
				playing: false,
				needsGesture: true,
				busy: false,
				error: 'Tik Speel om Spotify te starten'
			});
			return;
		}

		this.set({ busy: true, error: null });

		if (this.status.mode === 'premium' || (opts.uri && this.status.tier === 'premium')) {
			await this.waitForDevice();
		}
		if (seq !== this.playSeq) return;

		if (opts.uri && this.status.deviceId && this.accessToken) {
			try {
				await this.ensureDevice();
				if (seq !== this.playSeq) return;
				await this.playPremium(opts.uri, offsetMs);
				if (seq !== this.playSeq) return;
				if (durationMs > 0) this.armStop(durationMs);
				this.unlocked = true;
				this.pending = null;
				this.set({
					mode: 'premium',
					playing: true,
					needsGesture: false,
					unlocked: true,
					busy: false,
					error: null
				});
				return;
			} catch (e) {
				// Device gone / race — reset transfer flag and retry once
				const msg = e instanceof Error ? e.message : 'Premium play failed';
				if (/404|NO_ACTIVE|Not found|Device/i.test(msg) && this.transferredOnce) {
					this.transferredOnce = false;
					try {
						await this.ensureDevice();
						await this.playPremium(opts.uri, offsetMs);
						if (durationMs > 0) this.armStop(durationMs);
						this.unlocked = true;
						this.pending = null;
						this.set({
							mode: 'premium',
							playing: true,
							needsGesture: false,
							unlocked: true,
							busy: false,
							error: null
						});
						return;
					} catch (e2) {
						this.set({
							busy: false,
							playing: false,
							needsGesture: true,
							error: e2 instanceof Error ? e2.message : msg
						});
					}
				} else {
					this.set({ busy: false, error: msg, needsGesture: fromGesture ? false : true });
				}
			}
		}

		if (opts.previewUrl) {
			try {
				await this.playPreview(opts.previewUrl, offsetMs);
				if (seq !== this.playSeq) return;
				const previewCap = Math.max(1000, 30_000 - offsetMs);
				this.armStop(durationMs > 0 ? Math.min(durationMs, previewCap) : previewCap);
				this.unlocked = true;
				this.pending = null;
				this.set({
					mode: 'preview',
					playing: true,
					needsGesture: false,
					unlocked: true,
					busy: false,
					error: null
				});
				return;
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Preview play failed';
				if (!fromGesture && /NotAllowedError|interact|gesture|user/i.test(msg + String(e))) {
					this.pending = opts;
					this.set({
						playing: false,
						needsGesture: true,
						busy: false,
						error: 'Tik Speel om te starten'
					});
					return;
				}
				this.pending = opts;
				this.set({ error: msg, needsGesture: true, playing: false, busy: false });
				return;
			}
		}

		this.pending = opts;
		this.set({
			mode: opts.uri || opts.previewUrl ? this.status.mode : 'none',
			playing: false,
			needsGesture: true,
			busy: false,
			error: !opts.uri && !opts.previewUrl
				? 'Geen Spotify-audio op dit nummer — kies een andere playlist'
				: 'Spotify speelt niet — tik Speel of check Premium / preview'
		});
	}

	/**
	 * Single entry for the Play button: arm gesture once, then play opts
	 * (or flush pending). Does not double-play the same request.
	 */
	async playFromUserGesture(opts?: PlayTrackOpts) {
		this.armGestureSync();
		const next = opts ?? this.pending;
		this.pending = null;
		if (next) {
			await this.playTrack({ ...next, fromUserGesture: true });
			return;
		}
		await this.resume();
	}

	private async playPremium(uri: string, offsetMs: number) {
		if (!this.accessToken || !this.status.deviceId) throw new Error('Geen device');
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
		this.set({ busy: true });
		try {
			await this.sdkPlayer?.pause();
		} catch {
			/* ignore */
		}
		if (this.accessToken && this.status.mode === 'premium') {
			await fetch('https://api.spotify.com/v1/me/player/pause', {
				method: 'PUT',
				headers: { Authorization: `Bearer ${this.accessToken}` }
			}).catch(() => null);
		}
		this.audio?.pause();
		this.set({ playing: false, busy: false });
	}

	async resume() {
		this.set({ busy: true, error: null });
		try {
			if (this.status.mode === 'premium') {
				try {
					await this.sdkPlayer?.resume();
					const state = await this.sdkPlayer?.getCurrentState();
					if (state && !state.paused) {
						this.set({ playing: true, busy: false, needsGesture: false });
						return;
					}
				} catch {
					/* fall through to replay */
				}
				// Resume noop / empty queue → re-play last track once
				if (this.lastOpts?.uri) {
					await this.playTrack({ ...this.lastOpts, fromUserGesture: true });
					return;
				}
			}
			if (this.audio?.src && !this.audio.src.startsWith('data:')) {
				await this.audio.play();
				this.set({ playing: true, needsGesture: false, busy: false });
				return;
			}
			if (this.lastOpts) {
				await this.playTrack({ ...this.lastOpts, fromUserGesture: true });
				return;
			}
			this.set({
				busy: false,
				needsGesture: true,
				error: 'Niets om te hervatten — wacht op een nummer'
			});
		} catch {
			this.set({
				busy: false,
				needsGesture: true,
				playing: false,
				error: 'Tik Speel om verder te gaan'
			});
		}
	}

	async seek(ms: number) {
		try {
			if (this.status.mode === 'premium') {
				await this.sdkPlayer?.seek(ms);
			} else if (this.audio) {
				this.audio.currentTime = Math.max(0, ms / 1000);
			}
		} catch {
			/* ignore */
		}
	}

	/** One-tap play/pause for the main control. */
	async togglePlay(opts?: PlayTrackOpts) {
		this.armGestureSync();
		if (this.status.playing) {
			await this.pause();
			return;
		}
		if (opts || this.pending || this.lastOpts) {
			await this.playFromUserGesture(opts ?? this.pending ?? this.lastOpts ?? undefined);
			return;
		}
		await this.resume();
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
