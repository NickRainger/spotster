<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		code: string;
		open: boolean;
		onClose: () => void;
	}

	let { code, open, onClose }: Props = $props();

	let dataUrl = $state<string | null>(null);
	let genError = $state<string | null>(null);

	const joinUrl = $derived(
		typeof window !== 'undefined'
			? `${window.location.origin}/room/${code}`
			: `/room/${code}`
	);

	async function renderQr(url: string) {
		try {
			genError = null;
			const QRCode = (await import('qrcode')).default;
			dataUrl = await QRCode.toDataURL(url, {
				errorCorrectionLevel: 'M',
				margin: 2,
				width: 1024,
				color: { dark: '#0b1220', light: '#f4efe6' }
			});
		} catch (e) {
			genError = e instanceof Error ? e.message : 'QR mislukt';
			dataUrl = null;
		}
	}

	$effect(() => {
		if (open && code) void renderQr(joinUrl);
	});

	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && open) onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-[100] flex flex-col bg-[#0b1220] px-4 py-6 sm:px-8 sm:py-8"
		role="dialog"
		aria-modal="true"
		aria-label="Join met QR-code"
	>
		<div class="flex items-start justify-between gap-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.35em] text-secondary">Join spotster</p>
				<p class="font-display mt-1 text-4xl tracking-[0.2em] text-accent sm:text-5xl">{code}</p>
			</div>
			<button type="button" class="btn btn-ghost btn-lg min-h-12 text-base" onclick={onClose}
				>Sluiten</button
			>
		</div>

		<div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 py-4">
			{#if dataUrl}
				<img
					src={dataUrl}
					alt="QR-code om room {code} te joinen"
					class="aspect-square w-full max-w-[min(92vw,92vh,720px)] rounded-2xl bg-[#f4efe6] p-3 shadow-2xl sm:p-5"
				/>
			{:else if genError}
				<p class="text-error">{genError}</p>
			{:else}
				<span class="loading loading-spinner loading-lg text-primary"></span>
			{/if}
			<p class="max-w-md text-center text-base text-white/70 sm:text-lg">
				Scan om te joinen · of ga naar
				<span class="break-all text-secondary">{joinUrl}</span>
			</p>
		</div>
	</div>
{/if}
