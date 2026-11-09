# spotster

Party timeline game (Hitster-style) for a vriendengroep. Multi-device lobby + auto-flow speelloop, mock deck (Spotify later).

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

Open [http://localhost:5173](http://localhost:5173). Create a room on one device, join with the code on others (same LAN/host).

## What’s in this MVP

- Create / join via 6-char code
- Flexible game settings (rules variants, win-at-N, tokens, challenge timer/host-reveal, …)
- State machine: WAITING_TURN → … → CHECK_WIN (auto-flow)
- Lock-in, viesjes challenges, skip, 3-voor-1, host kick/skip
- Session persistence + reconnect
- Mock tracks with years (no Spotify audio yet)

## Out of scope here

- Spotify OAuth / Web Playback → HIT-4 (`src/lib/spotify/stub.ts`)
- Single-device pass-and-play polish → HIT-5 (mode toggle stub exists)

## Scripts

| Command        | Meaning                |
| -------------- | ---------------------- |
| `npm run dev`  | Dev server + WebSocket |
| `npm run build`| Production build       |
| `npm run check`| `svelte-check`         |
