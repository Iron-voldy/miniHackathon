# Sahaaya — Frontend

Assistive communication (AAC) web app for non-speaking people in Sri Lanka. A communicator selects a
phrase, confirms it, and a linked caregiver is notified — on their live dashboard **and** by email.
This app is **not** speech therapy, diagnosis, or an emergency service (see the login screen).

Built per `docs/HACKATHON_FRONTEND_BUILD_GUIDE.md`, with the Login/Board/CareTeam/Inbox page
structure and the hands-free gesture-detection logic adapted from an earlier, much larger prior
version of this project (`Iron-voldy/sahaaya`) — deliberately trimmed down: no Supabase, no admin
dashboard, no speech-therapy or monthly-report features, and exactly two patient-side input modes.

## Tech stack

Vite · React 18 · TypeScript · Tailwind CSS · i18next (en/si/ta) · `@mediapipe/tasks-vision`
(client-side face/gesture detection for Face Mode).

## Features

- **Login** — demo login (name, phone, role); caregivers also provide an email, since new requests
  are emailed to them in addition to their live dashboard. Problem explanation is on this screen.
- **Board** (communicator) — phrase grid in the user's chosen language, a mode toggle, and a
  confirm/cancel modal that every selection — touch or face — must pass through before sending.
- **Two selection modes only**:
  - **Hand touch** — tap a tile.
  - **Face mode** — fully client-side hands-free selection via MediaPipe FaceLandmarker: tiles
    auto-scan, a deliberate long blink or held mouth-open selects the highlighted tile, then a nod
    confirms and a shake cancels (both also remain tappable on-screen, so a missed gesture never
    blocks the flow). **No camera frame, image, or biometric data ever leaves the browser** — only
    the resulting phrase selection is sent to the backend, exactly like touch mode.
- **Care team** — communicators generate a pairing code; caregivers enter one to link accounts.
- **Caregiver inbox** — a live list of incoming requests (consumed via `fetch` + manual SSE-frame
  parsing, since the browser's native `EventSource` can't carry an `Authorization` header) with an
  acknowledge action.
- **Trilingual UI** — not just phrase text: every label, button, and the problem blurb are in
  English, Sinhala, and Tamil (`src/locales/*.json`), including Sinhala/Tamil web fonts.

## Project structure

```
src/
  main.tsx / App.tsx      Entry point + tab shell (Board|Inbox, Care team) once logged in
  lib/
    api.ts                 Thin fetch wrapper against the Fastify backend — no Supabase, no SDK
    SessionContext.tsx      Auth session in localStorage
  hooks/
    gestureLogic.ts         Pure, unit-testable gesture threshold functions (ported as-is)
    useGestureInput.ts       React hook: camera + MediaPipe FaceLandmarker + gestureLogic -> events
  pages/
    Login.tsx, Board.tsx, CareTeam.tsx, Inbox.tsx
  locales/{en,si,ta}.json   Full UI translations
public/
  models/face_landmarker.task   MediaPipe model, served locally (no third-party CDN call at runtime)
  fonts/                         Noto Sans Sinhala/Tamil (OFL-licensed)
scripts/copy-assets.mjs    Copies the MediaPipe WASM runtime from node_modules into public/ at build/dev time
```

## Setup

```bash
npm install
npm run dev     # http://localhost:5173 — talks to http://127.0.0.1:8080 by default
```

Point it at a different backend with `VITE_API_BASE_URL` (a `.env` file, or a Vercel project env var).
Face Mode needs a working webcam and browser permission; it degrades to an on-screen error message if
denied rather than breaking the rest of the app.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start with hot reload (copies MediaPipe WASM first) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc --noEmit` |

## What was deliberately left out

Per the user's explicit scope cut: no Supabase (auth/session is our own JWT via the backend), no
`AdminDashboard`, no `SpeechPractice`/voice-therapist screen, no `TherapistDashboard`, no monthly
reports, no audio-review workflow, and no input modes beyond touch/face (the prior project also had
row-column scan and blink-only scan modes — not carried over).

## Deployment

Deployed to **Vercel** (production): https://sahaaya-web.vercel.app — connect the GitHub repo, Vercel
auto-detects Vite (build command `vite build`, output `dist`), set `VITE_API_BASE_URL` to the
deployed backend's HTTPS URL in the project's Environment Variables, redeploy.

Backend is deployed separately (see `../sahaaya-api/README.md`) — CORS on that backend's
`ALLOWED_ORIGINS` must include this Vercel URL, or every request will fail in the browser.

## AI declaration (hackathon spec §2.3)

> Claude Code — used to scaffold this Vite/React app, adapt the Login/Board/CareTeam/Inbox pages and
> the MediaPipe gesture-detection hook from an earlier, larger prior project, and strip out every
> feature outside this build's explicit scope (Supabase, admin dashboard, speech therapy, extra input
> modes). `npm run build` (which typechecks first) was run to confirm the app compiles; the app was
> manually clicked through against the live backend (demo login for both roles, pairing, sending a
> touch-mode request, and confirming it appeared in the caregiver inbox) before this was considered
> done. The head-gesture pitch/yaw thresholds in `useGestureInput.ts` are a best-effort port and would
> benefit from on-device tuning — the on-screen tap fallback exists specifically because of that.

## AI Prompt Log (hackathon spec §2.2)

| # | Tool | Prompt (exact) | Purpose | How output was checked/modified |
|---|---|---|---|---|
| 1 | Claude Code | "Survey Iron-voldy/sahaaya's apps/web frontend (Vite+React+Tailwind+i18next+MediaPipe+Supabase) and scaffold a new, trimmed app at sahaaya-web-app reusing its lib/api.ts pattern, gestureLogic.ts, i18n locales, and asset pipeline, with Supabase fully removed and rewired to the Fastify backend's actual contract" | Frontend scaffold | Ran `npx tsc --noEmit`; confirmed no Supabase import remained anywhere in the tree |
| 2 | Claude Code | "Write useGestureInput.ts: load MediaPipe FaceLandmarker from the local WASM/model assets, feed blendshape scores and head-pose deltas into the existing gestureLogic.ts pure functions to drive select/confirm/cancel events, camera and processing fully client-side" | Face Mode | Verified the hook never constructs a request body containing image/video data — only `onSelect(index)`/`onConfirm()`/`onCancel()` callbacks cross the hook boundary |
| 3 | Claude Code | "Build Login.tsx, Board.tsx, CareTeam.tsx, Inbox.tsx per the trimmed feature set — email required for caregiver role, touch/face mode toggle on Board, confirm modal for both modes, live inbox via manual SSE-frame parsing" | Core screens | Ran `npm run build`; manually logged in as both roles against the live backend and completed a full send → inbox → acknowledge cycle |
| 4 | Claude Code | "Deploy to Vercel production and wire VITE_API_BASE_URL to the deployed backend's HTTPS URL" | Deployment | Confirmed the deployed URL returns 200 and that a login call against the live backend succeeds from the deployed page, not just localhost |

*(add a row per additional prompt as the build continues)*

## Before you record the demo video

- Full click-through on the **deployed** Vercel URL against the **deployed** backend, not localhost.
- Confirm Sinhala and Tamil render as real Sinhala/Tamil glyphs (fonts are bundled, not system-dependent).
- Try Face Mode once on camera hardware beforehand — gesture thresholds are a best-effort port and may
  need a quick recalibration pass (`src/hooks/useGestureInput.ts`'s `blinkThreshold`/degree constants
  in `gestureLogic.ts`) for the specific webcam and lighting you'll demo under.
- Have the on-screen Confirm/Cancel tap fallback ready to show if a gesture doesn't land during a live demo.
