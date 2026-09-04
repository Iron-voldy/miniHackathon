# Sahaaya — Backend API

Assistive communication (AAC) backend for non-speaking people in Sri Lanka. A communicator selects a
phrase on a board, confirms it, the phrase is spoken aloud in Sinhala, Tamil, or English, and a linked
caregiver is notified and can acknowledge it. This is **not** speech therapy, diagnosis, or an
emergency service.

Built per `docs/HACKATHON_BACKEND_BUILD_GUIDE.md` (kept at the repo root here as
`HACKATHON_BACKEND_BUILD_GUIDE.md`) during a timed hackathon session.

## Tech stack

Node 22 · Fastify · TypeScript · Zod · MongoDB (Mongoose) · OpenAI (`gpt-4o-mini`, phrase ranking) ·
Azure Speech (`si-LK` / `ta-LK` neural voices, TTS) · Nodemailer (caregiver email alerts).

## Features

- Patient (communicator) login is passwordless — name + phone only, since the device is handed to a
  non-speaking user
- Caregivers get a real, password-protected account (`POST /auth/signup` / `POST /auth/login`,
  bcrypt-hashed password) — no Google/OAuth, kept dependency-free — and must supply an email so they
  can also be alerted by mail, not just on their dashboard
- Boards & phrases (24 phrases across 8 categories, in English/Sinhala/Tamil)
- Custom phrases with communicator approval
- AI-powered phrase ranking (OpenAI, 2s timeout, deterministic fallback, allow-list validated)
- Text-to-speech for custom phrases (Azure Speech, cached, degrades to text-only on failure)
- Caregiver pairing (code-based) and an authenticated caregiver inbox
- Communication requests: confirmation-gated, idempotent, SSE-streamed, acknowledge/cancel
- Exactly two patient-side selection modes: `touch` (direct tap) and `face` (client-side hands-free
  gesture/dwell-select — no camera or biometric data ever reaches this API, invariant #7)
- Every new request notifies each linked caregiver on **two channels**: their live dashboard (SSE)
  and an email (best-effort, degrades silently if SMTP isn't configured)
- No speech-therapy, admin-dashboard, or monthly-report features — intentionally out of scope

## Project structure

```
src/
  app.ts / server.ts     Fastify instance (app.ts has no .listen(), so tests can import it directly)
  lib/                    env validation, db connection, JWT, timeout wrapper, audit log, auth guard
  models/                 9 Mongoose collections
  routes/                 health, auth, profiles, boards, custom-phrases, phrases (rank+tts), caregivers, requests
  services/               ranker (deterministic), llmRanker (OpenAI + allow-list), tts (Azure), email (Nodemailer)
seed/                     boards.json, phrases.json, seed.ts
test/                     vitest suite (in-memory MongoDB, no external calls)
```

## Setup

```bash
npm install
cp .env.example .env   # fill in MongoDB Atlas / OpenAI / Azure Speech credentials
npm run seed            # loads seed/boards.json and seed/phrases.json
npm run dev              # http://localhost:8080
```

Without `OPENAI_API_KEY` or `AZURE_SPEECH_KEY` set, the app still runs correctly — ranking falls back
to deterministic ordering (`reasonCode: "fallback_disabled"`) and TTS falls back to text-only
(`{ fallback: true }`). This is by design (invariant #9), not a bug.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start with hot reload (`tsx watch`) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run seed` | Reset and reload boards/phrases |
| `npm test` | Run the vitest suite (spins up an in-memory MongoDB, no network calls) |
| `npm run typecheck` | `tsc --noEmit` |

## API

See `HACKATHON_BACKEND_BUILD_GUIDE.md` §7 for the full contract. Base path: `/api/v1`. All routes
except `/auth/demo-login` and `/health/*` require `Authorization: Bearer <jwt>`.

## Non-negotiable invariants enforced in code

1. Confirmation (`confirmed: true`) is enforced server-side via Zod `z.literal(true)`, never trusted.
2. `resolvedText` is always resolved server-side from `phraseId`/approved `customPhraseId`; a client
   `renderedText` field is never accepted.
3. `clientRequestId` is a unique index; a duplicate insert (Mongo error `11000`) returns the existing
   request instead of erroring.
4. The AI ranker's output is filtered against the requesting board's `phraseIds` allow-list; nothing
   else can survive into the response.
5. `services/llmRanker.ts` and `services/ranker.ts` have zero external side effects — they only rank.
6. Every route filters by `request.user.userId` (from the verified JWT), never a client-supplied id —
   see especially `routes/caregivers.ts` and `routes/requests.ts`.
7. No camera/biometric data is accepted anywhere in this API.
8. No `VITE_`-prefixed or client-exposed variable holds a secret; all keys live server-side in `.env`.
9. OpenAI, Azure Speech, and email calls are all wrapped in `withTimeout` with a deterministic
   fallback — a caregiver alert email that fails or times out never fails the request itself.
10. `delivered` vs `acknowledged` are distinct states on `CommunicationRequest`.
11. `lib/audit.ts` writes route/actor/outcome audit events; never raw phrase text or credentials.

## AI declaration (hackathon spec §2.3)

> Claude Code — used to scaffold the Fastify backend, implement all API routes and services, write the
> seed data and the vitest suite, from the prompts logged below. Every route's authorization logic,
> the confirmation/idempotency invariants on `POST /requests`, and the AI-ranking allow-list filter
> were manually reviewed against `HACKATHON_BACKEND_BUILD_GUIDE.md` before considering the build done,
> and the full test suite (`npm test`) was run to verify failure paths, not just the happy path.
> OpenAI (`gpt-4o-mini`) powers the live phrase-ranking feature at runtime — it is not used to write
> code. Azure Speech (`si-LK`/`ta-LK` neural voices) powers TTS at runtime, chosen over OpenAI TTS
> specifically because it reliably supports Sinhala and Tamil, which is the app's core value.
>
> Sinhala/Tamil phrase translations in `seed/phrases.json` are AI-drafted sample data, not yet
> reviewed by a native speaker — flagging this explicitly per the hackathon's permitted use of
> AI-generated sample/test data.
>
> Nodemailer (Gmail SMTP) powers the caregiver email alert at runtime — also not used to write code.
> Speech-therapy, admin-dashboard, and monthly-report features from an earlier, larger prior version
> of this project were deliberately never brought into this build.

## AI Prompt Log (hackathon spec §2.2)

| # | Tool | Prompt (exact) | Purpose | How output was checked/modified |
|---|---|---|---|---|
| 1 | Claude Code | "Scaffold a Fastify + TypeScript backend with Mongoose models for User, CaregiverLink, Board, Phrase, CustomPhrase, CommunicationRequest, AuditEvent per docs/HACKATHON_BACKEND_BUILD_GUIDE.md §5" | Initial project scaffold | Reviewed schema field types against the guide; ran `npm run typecheck` and `npm run build` to confirm it compiled |
| 2 | Claude Code | "Implement POST /auth/demo-login per §7.1: Zod schema with the Sri Lankan phone regex and friendly error message, find-or-create user, sign JWT" | Auth route | Wrote a vitest failure-path test asserting the friendly message on an invalid phone, and a happy-path test asserting the JWT round-trips |
| 3 | Claude Code | "Implement POST /requests per §7.8: confirmation enforcement, server-side text resolution, clientRequestId idempotency via unique index + duplicate-key catch, caregiverIds filtered to active links only" | Core request flow | Wrote the idempotency test first (duplicate clientRequestId), confirmed it passed before moving on |
| 4 | Claude Code | "Implement services/llmRanker.ts per §7.5: OpenAI call with 2s timeout, JSON array parsing, filter results against allowed_phrase_ids, fall back to ranker.ts on any failure" | AI ranking feature | Wrote unit tests mocking the OpenAI client to force a timeout, an error, and an out-of-allow-list id, confirming the fallback path and allow-list filter both actually fire |
| 5 | Claude Code | "Implement services/tts.ts per §7.6 using microsoft-cognitiveservices-speech-sdk with si-LK/ta-LK neural voices, a TtsCache lookup, and a 2s timeout that degrades to { fallback: true }" | Sinhala/Tamil TTS | Verified fallback path returns display-text-only when AZURE_SPEECH_KEY is unset, per invariant #9 |
| 6 | Claude Code | "Implement caregivers routes per §7.7 — pairing/accept/list, identity from JWT only, never the body" | Caregiver pairing | Wrote tests for a caregiver trying to generate a code and a communicator trying to accept one (both must 403), plus an attempted id-smuggling test |
| 7 | Claude Code | "Write seed/seed.ts and seed/phrases.json per §6 — 24 phrases across 8 categories in en/si/ta" | Seed data | Reviewed each translation manually; noted in this README that Sinhala/Tamil text is AI-drafted and not yet native-speaker reviewed |
| 8 | Claude Code | "Write failure-path tests per §8 for auth, requests, caregivers, and phrases/rank, using mongodb-memory-server so the suite needs no real database" | Test suite | Ran `npm test`; confirmed all failure-path assertions (400/403/404/422) hit the intended branch, not a generic error handler |
| 9 | Claude Code | "Independent code review of the whole backend against the guide's 11 invariants" | Quality gate | A code-quality review agent flagged that `delivered` and `acknowledged` were conflated (invariant #10) and that `auditLog` was only wired into `/auth/demo-login`; fixed both directly (SSE poll now marks a delivery `delivered` the moment it's actually pushed to that caregiver, and `auditLog` calls were added to caregiver pairing, request creation, acknowledge, and cancel) |
| 10 | Claude Code | "Simplify inputMode to exactly two patient-side selection modes (touch, face), add an email field to User required for caregivers, and email each linked caregiver (Nodemailer, best-effort with timeout+fallback) whenever a communicator sends a new request" | Face-mode simplification + caregiver email alerts | Smoke-tested against the live Atlas DB with curl: a caregiver login without email returns the friendly 400; a `touch`-and-`face` request both create successfully; confirmed the email dispatch is fire-and-forget (never delays or fails the `POST /requests` response, even before SMTP creds were validated) |

*(add a row per additional prompt as the build continues)*

## Deployment

**Live**: https://72-62-255-113.sslip.io (deployed to a shared VPS under `pm2` + `nginx`, port 4400
internally, HTTPS via Let's Encrypt against the `sslip.io` hostname since no DNS record was available
for a nicer subdomain — swap in a real subdomain later by adding a DNS A record and re-running
`certbot --nginx -d your.subdomain`, no application changes needed).

General instructions (§9 of `HACKATHON_BACKEND_BUILD_GUIDE.md` describes a Render-based alternative,
equally valid): build (`npm run build`), run the compiled `dist/src/server.js` under a process
manager (`pm2 start dist/src/server.js --name sahaaya-api`), put it behind a reverse proxy for TLS,
health check path `/health/ready`, run `npm run seed` once after first deploy, and test the deployed
URL from an incognito window before submitting. `ALLOWED_ORIGINS` in `.env` must include the deployed
frontend's exact origin or every browser request will be blocked by CORS.
