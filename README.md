# spotster

Party timeline game (Hitster-style) for a vriendengroep. Multi-device én single-device pass-and-play, mock deck + Spotify host playback.

## Stack

- SvelteKit (Vite) + TypeScript
- DaisyUI / Tailwind v4
- WebSocket rooms (`/ws`) embedded in the Vite/dev server
- PWA-ready manifest

## Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

- **Multi-device:** create room → others join with code  
- **Single-device:** create room → Single-device → add local names → Start → pass-the-phone screens

## What’s in this MVP

- Create / join via 6-char code
- Flexible game settings (rules variants, win-at-N, tokens, challenge timer/host-reveal, …)
- State machine: WAITING_TURN → … → CHECK_WIN (auto-flow)
- Lock-in, viesjes challenges, skip, 3-voor-1, host kick/skip
- Session persistence + reconnect
- Mock tracks with years (always available as fallback)
- **Spotify (HIT-4):** host OAuth PKCE, playlists/search → deck, year overrides, Web Playback (Premium) / preview (Free), speelduur+offset mid-game
- **Single-device (HIT-5):** pass-and-play, geef-door screens, dim-mask, sequential challenge seats

## Spotify setup

Copy `.env.example` → `.env` and set `SPOTIFY_CLIENT_ID` (+ redirect URI in the Spotify Dashboard). See status doc for details. Without env, mock-deck keeps working.

## Scripts

| Command              | Meaning                |
| -------------------- | ---------------------- |
| `npm run dev`        | Dev server + WebSocket |
| `npm run build`      | Production build       |
| `npm run check`      | `svelte-check`         |
| `npm run smoke`      | Multi mock WS smoke    |
| `npm run smoke:single` | Single-device WS smoke |
