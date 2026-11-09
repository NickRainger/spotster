import tailwindcss from '@tailwindcss/vite';
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { spotsterGameServer } from './server/vite-plugin-game.ts';

/**
 * DEPLOY_TARGET=vercel → serverless UI + Spotify API (needs PUBLIC_WS_URL for rooms)
 * DEPLOY_TARGET=node (default) → long-lived Node + /ws via `npm start`
 */
const deployTarget = (process.env.DEPLOY_TARGET || 'node').toLowerCase();
const adapter = deployTarget === 'vercel' ? adapterVercel() : adapterNode();

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter
		}),
		// Dev-only: attach /ws to Vite. Production Node uses server/standalone.mjs.
		deployTarget === 'vercel' ? null : spotsterGameServer()
	].filter(Boolean),
	envDir: '.',
	server: {
		host: true,
		port: 5173
	}
});
