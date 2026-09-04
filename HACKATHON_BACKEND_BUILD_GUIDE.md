# Sahaaya — Backend Build Guide (Hackathon Rebuild, New Environment)

Owner: backend member, built live with Claude Code during the 4-hour session.
Stack: **Node 22 + Fastify + TypeScript + Zod + MongoDB (Mongoose) + OpenAI + Azure Speech**.

This is a **rescoped MVP**, not a port of the full prior Sahaaya codebase. The prior build grew to
37 migrations and a dozen sub-features (therapist dashboards, speech practice, monthly reports,
audio review workflow, admin panels) over multiple days. None of that fits a 4-hour window with
two people, and submitting it as-is would fail the hackathon's "built during this session" rule.
This guide keeps only what's needed to hit the 10 minimum requirements plus one strong AI feature.

---

## 0. Before you start the clock

- Create a **brand-new empty GitHub repository** for this hackathon submission. Do not fork or
  push history from the old `sahaaya` repo — the marking scheme checks commit history as evidence
  of who did what, during the session. Reusing that history would look like (and would be) reusing
  a pre-built project.
- The **phrase translations** (`seed/phrases.json` below) are carried over as *sample data*, which
  the hackathon spec explicitly permits regenerating/reusing via AI tools ("Producing realistic
  sample and test data — Permitted"). That's content, not code — bringing it along is fine and saves
  real time. Say so plainly in your README and prompt log.
- Agree the API contract in this doc with your frontend teammate in the first 15–20 minutes, then
  build in parallel. That's the entire point of writing this now.

---

## 1. Non-negotiable invariants (carry these into every route)

These are unchanged in spirit from the original project; #6 below is the MongoDB-specific rewrite
of what used to be Postgres Row-Level Security.

1. **Confirmation is enforced in code, never trusted from the client.** Reject any `POST /requests`
   where `confirmed !== true` (Zod `z.literal(true)`).
2. **Never forward client-supplied text to a caregiver.** The server resolves `phraseId` →
   canonical text server-side. `renderedText` from the client is display-only, logged for debugging
   at most, never the value actually delivered.
3. **`clientRequestId` is an idempotency key.** A unique index + upsert-safe insert prevents
   duplicate caregiver alerts from a double-tap or retry.
4. **The AI ranker may only return phrase IDs that exist on the requested board.** Validate the
   model's output against that allow-list after parsing; drop anything else.
5. **The AI/LLM path never calls anything with an external side effect** (no sending notifications,
   no writing requests) — it only ranks/suggests. Side effects happen exclusively in route handlers
   after normal validation.
6. **Every route enforces ownership/authorization in application code.** There is no database-level
   RLS in MongoDB — every query that touches a user's data must filter by the authenticated user's
   ID (from the JWT), not by a client-supplied ID. This is the #1 source of real bugs in the prior
   build (unauthenticated pairing, IDOR on requests) — don't repeat it.
7. **No camera frames or biometric data ever reach the backend.** If your frontend adds gesture
   input, only numeric calibration thresholds are sent, if at all — treat this as a stretch feature.
8. **Secrets are server-side only.** Nothing prefixed `VITE_` may hold a credential.
9. **Every external call (OpenAI, Azure) has a timeout and a deterministic fallback.** OpenAI: 2s →
   static ranking. Azure TTS: 2s → cached audio → "display text only" flag.
10. **`delivered` and `acknowledged` are separate states**, and `delivered` is only set once the
    delivery mechanism (SSE push / stored for poll) actually happened.
11. **Audit every external action**: route, actor id, request id, outcome, timestamp — never raw
    phrase text or credentials in logs.

---

## 2. Time budget (maps to the hackathon's own schedule)

| Session time | What backend does |
|---|---|
| 0–20 min | Agree this contract with frontend; create repos; Atlas + Azure + OpenAI keys ready |
| 20–45 min | Scaffold Fastify app, Mongoose connection, health routes, auth, deploy skeleton to Render early (deploy early, not last) |
| 45–175 min | Build routes in this order: auth → boards/phrases → requests → caregivers → custom-phrases → AI ranking → TTS |
| 175–205 min | Fix bugs found by manual QA against the running frontend; tighten validation messages |
| 205–225 min | Final deploy, confirm public URL works in incognito, freeze |
| 225–240 min | Support the demo recording; don't touch code |

---

## 3. Environment setup

### 3.1 MongoDB Atlas (free tier)

1. Create a free account at mongodb.com/cloud/atlas, create a project, create a free **M0** cluster.
2. Database Access → add a database user (username/password auth).
3. Network Access → add `0.0.0.0/0` (hackathon time constraints; tighten only if you have spare time).
4. Get the connection string from "Connect → Drivers", it looks like:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/sahaaya?retryWrites=true&w=majority`

### 3.2 Azure Speech (TTS — keep, don't switch to OpenAI TTS)

Sinhala and Tamil neural voices are proven working on Azure (`si-LK`, `ta-LK`); OpenAI's TTS models
don't reliably support these languages, and correct-language speech output is the app's core value —
not worth the risk on demo day. Get a Speech resource key + region from portal.azure.com (free tier
is enough for a demo). Region used previously: `centralindia`.

### 3.3 OpenAI (the AI-powered feature)

Create a key at platform.openai.com. Recommended model: `gpt-4o-mini` — fast and cheap enough for a
free/low-cost demo budget. Used for **phrase ranking only** (see §7.5) — this is your "optional
AI-powered feature" line item on the rubric.

### 3.4 `.env.example` (commit this; never commit `.env`)

```bash
NODE_ENV=development
PORT=8080

# MongoDB
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/sahaaya?retryWrites=true&w=majority

# Auth
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRES_IN=7d

# CORS — add every origin your frontend runs on (dev + deployed)
ALLOWED_ORIGINS=http://localhost:5173,https://your-frontend.vercel.app

# OpenAI — phrase ranking (optional AI feature)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=2000

# Azure Speech — TTS
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=centralindia
AZURE_TTS_TIMEOUT_MS=2000
```

Add `.env` to `.gitignore` immediately, before the first commit that touches it.

---

## 4. Repo scaffold

```bash
mkdir sahaaya-api && cd sahaaya-api
npm init -y
npm install fastify @fastify/cors zod mongoose jsonwebtoken openai microsoft-cognitiveservices-speech-sdk pino dotenv
npm install -D typescript tsx @types/node @types/jsonwebtoken vitest

npx tsc --init
```

Suggested layout:

```
src/
  app.ts                 # builds the Fastify instance, registers routes (no listen())
  server.ts              # loads env, calls app.listen()
  lib/
    env.ts                # zod-validated process.env
    db.ts                 # mongoose.connect()
    jwt.ts                 # sign/verify helpers
    withTimeout.ts         # generic timeout+fallback wrapper (invariant #9)
    audit.ts               # auditEvents writer
  models/
    User.ts
    CaregiverLink.ts
    Board.ts
    Phrase.ts
    CustomPhrase.ts
    CommunicationRequest.ts
    AuditEvent.ts
  routes/
    health.ts
    auth.ts
    profiles.ts
    boards.ts
    phrases.ts
    customPhrases.ts
    caregivers.ts
    requests.ts
  services/
    ranker.ts               # deterministic fallback ranking
    llmRanker.ts             # OpenAI call + allow-list validation
    tts.ts                   # Azure synth + cache lookup
seed/
  boards.json
  phrases.json
  seed.ts
test/
  *.test.ts
```

`app.ts` builds and exports the Fastify instance without calling `.listen()`, so tests can import it
directly — this was the pattern in the prior build and it's worth keeping.

---

## 5. Data model (7 Mongoose collections)

Simplified from the original 12-table Postgres schema: `communication_profiles` is folded into
`users.preferences`, and `request_deliveries` / `request_acknowledgements` are embedded arrays on
`communicationRequests` instead of separate collections — fewer round trips, and Mongo handles
document-shaped data like this well. `calibration_profiles` and `metric_events` are dropped for
this MVP (stretch-only if there's time left).

```ts
// models/User.ts
const UserSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  phone: { type: String, required: true, unique: true }, // validated at the Zod boundary, see §7.1
  role: { type: String, enum: ["communicator", "caregiver"], required: true },
  preferences: {
    language: { type: String, enum: ["en", "si", "ta"], default: "en" },
    boardContext: { type: String, enum: ["home", "ward", "general"], default: "home" },
  },
}, { timestamps: true });

// models/CaregiverLink.ts
const CaregiverLinkSchema = new Schema({
  communicatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  caregiverId: { type: Schema.Types.ObjectId, ref: "User" }, // null until accepted
  pairingCode: { type: String, unique: true, sparse: true }, // present only while pending
  status: { type: String, enum: ["pending", "active"], default: "pending" },
}, { timestamps: true });

// models/Board.ts
const BoardSchema = new Schema({
  _id: { type: String }, // e.g. "home-basic"
  title: { type: String, required: true },
  context: { type: String, enum: ["home", "ward", "general"], required: true },
  phraseIds: [{ type: String, required: true }],
});

// models/Phrase.ts
const PhraseSchema = new Schema({
  _id: { type: String }, // e.g. "CARE_WATER"
  category: String,
  english: String, sinhala: String, tamil: String,
  symbolAsset: String,
  riskClass: { type: String, enum: ["normal", "sensitive"] },
  canNotify: Boolean,
  requiresConfirmation: Boolean,
  version: Number,
});

// models/CustomPhrase.ts
const CustomPhraseSchema = new Schema({
  ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  text: { type: String, required: true, maxlength: 200 },
  language: { type: String, enum: ["en", "si", "ta"], required: true },
  approvedByCommunicator: { type: Boolean, default: false },
}, { timestamps: true });

// models/CommunicationRequest.ts
const CommunicationRequestSchema = new Schema({
  communicatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  phraseId: { type: String, required: true },
  resolvedText: { type: String, required: true }, // server-resolved, never client text — invariant #2
  inputMode: { type: String, enum: ["touch", "row_column_scan", "blink_scan", "hum_scan"] },
  clientRequestId: { type: String, required: true, unique: true }, // idempotency — invariant #3
  status: {
    type: String,
    enum: ["pending", "delivered", "seen", "coming", "completed", "cancelled", "failed"],
    default: "pending",
  },
  deliveries: [{
    caregiverId: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["pending", "delivered", "failed"] },
    deliveredAt: Date,
  }],
  acknowledgement: {
    caregiverId: { type: Schema.Types.ObjectId, ref: "User" },
    responderName: String,
    respondedAt: Date,
  },
}, { timestamps: true });

// models/AuditEvent.ts
const AuditEventSchema = new Schema({
  route: String,
  actorId: { type: Schema.Types.ObjectId, ref: "User" },
  requestId: String,
  outcome: { type: String, enum: ["success", "denied", "error"] },
}, { timestamps: true });
```

Indexes worth adding explicitly: `User.phone` (unique), `CaregiverLink.pairingCode` (unique+sparse),
`CommunicationRequest.clientRequestId` (unique).

---

## 6. Seed data

Reuse the existing translated phrase set as-is (sample data, not code) — 24 phrases across 8
categories, already reviewed for Azure `si-LK` pronunciation issues:

`seed/boards.json`
```json
{
  "boards": [
    {
      "id": "home-basic",
      "title": "Home — Basic",
      "context": "home",
      "phraseIds": [
        "URGENT_STOP", "URGENT_HELP",
        "QUICK_YES", "QUICK_NO", "QUICK_WAIT", "QUICK_AGAIN", "QUICK_THANKS",
        "CARE_WATER", "CARE_FOOD", "CARE_TOILET", "CARE_SLEEP",
        "CARE_SIT_UP", "CARE_TURN_LEFT", "CARE_TURN_RIGHT", "CARE_PILLOW",
        "CARE_PAIN", "CARE_HOT", "CARE_COLD", "CARE_UNCOMFORTABLE",
        "PEOPLE_CALL_MOTHER", "PEOPLE_CALL_CAREGIVER",
        "SOCIAL_HELLO", "SOCIAL_OKAY", "SOCIAL_WANT_TALK"
      ]
    }
  ]
}
```

`seed/phrases.json` — copy the 24 phrase objects verbatim from the original
`packages/phrase-data/seed/phrases.json` in the old repo (each has `id`, `category`, `english`,
`sinhala`, `tamil`, `symbolAsset`, `riskClass`, `canNotify`, `requiresConfirmation`, `version`).
Note in your README: *"Sinhala/Tamil phrase translations are AI-drafted sample data carried over from
prior research, not yet reviewed by a native speaker — same caveat as the original blueprint."*

`seed/seed.ts` — connect to Mongo, `Board.deleteMany({}); Phrase.deleteMany({})`, insert both files'
contents, disconnect. Run with `npx tsx seed/seed.ts`. Run once after first deploy too.

---

## 7. API surface

Base path: `/api/v1`. All routes except `/auth/demo-login` and `/health/*` require
`Authorization: Bearer <jwt>`, verified in a Fastify `preHandler`, decoding to `{ userId, role }` on
`request.user`.

### 7.1 `POST /auth/demo-login`

No password — matches the original design and is appropriate for a hackathon demo.

```ts
const DemoLoginSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().regex(
    /^(?:\+94|0)7\d{8}$/,
    "Enter a valid Sri Lankan mobile number, e.g. 077 123 4567"
  ),
  role: z.enum(["communicator", "caregiver"]),
});
```

Logic: find-or-create `User` by phone, sign a JWT `{ sub: user._id, role }`, return
`{ token, user }`. This regex + friendly message is your "input validation with meaningful error
messages" evidence for the rubric — keep it, and mirror the same pattern (Zod schema → typed 400 with
a human sentence, never a raw Zod error dump) on every other form.

### 7.2 Profiles

```
GET   /profiles/me                    -> current user + preferences
PATCH /profiles/me/preferences        -> { language?, boardContext? }
```

### 7.3 Boards & phrases

```
GET /boards?context=home&language=si   -> list of board summaries
GET /boards/:boardId                    -> board with resolved phrase objects (join phraseIds -> Phrase docs)
```

### 7.4 Custom phrases

```
POST /custom-phrases                    -> { text, language } ; ownerUserId = request.user.userId (never trust body)
POST /custom-phrases/:id/approve        -> owner-only; sets approvedByCommunicator = true
```

### 7.5 Phrase ranking (the AI feature)

```
POST /phrases/rank
Body: { boardId: string, recentPhraseIds?: string[] }
Response: { rankedPhraseIds: string[], reasonCode: "llm" | "fallback_timeout" | "fallback_error" | "fallback_disabled" }
```

Flow (`services/llmRanker.ts` + `services/ranker.ts`):
1. Load the board's `phraseIds` — this is `allowed_phrase_ids` (invariant #4).
2. Call OpenAI with a system prompt: *"Given these phrase IDs and their English text, and the user's
   recently used phrases, return a JSON array re-ordering the given IDs by likely relevance. Return
   ONLY ids from the provided list, as JSON, nothing else."* Wrap the call in a 2s timeout
   (`OPENAI_TIMEOUT_MS`).
3. Parse the response; **filter out any id not in `allowed_phrase_ids`** — this is the mandatory
   allow-list check, not optional.
4. If the call times out, errors, returns nothing valid, or `OPENAI_API_KEY` is unset: fall back to
   `ranker.ts`'s deterministic ordering (e.g. most-recently-used first, then board's static order).
   Always return a `reasonCode` so the frontend/demo can show which path fired — genuinely useful
   for the "explain your code" panel question.

### 7.6 TTS

```
POST /phrases/:phraseId/tts   -> { audioUrl } or { text, fallback: true }
```

Board phrases should be pre-baked and shipped with the frontend (§ frontend doc) — this route is a
fallback for **custom phrase** text only. Look up by a hash of the text in a small `TtsCache`
collection (`{ textHash, language, audioBase64 or storageUrl, voice, createdAt }`); on a cache miss,
call Azure Speech SDK with a 2s timeout; on any failure, return `{ text, fallback: true }` so the
frontend just displays large text (invariant #9 — TTS must degrade, never hard-fail).

### 7.7 Caregivers

```
POST /caregivers/pair          -> communicator generates a pairing code; identity from JWT only, never body
POST /caregivers/pair/accept   -> caregiver submits the code; identity from JWT only
GET  /caregivers                -> caller's own linked caregivers/communicators only
```

The prior build's worst bugs were here: pairing endpoints that trusted a client-supplied
`communicatorId`/`caregiverId`, letting anyone pair onto a stranger's account. Don't repeat it —
`request.user.userId` is the *only* source of "who am I" on every one of these routes.

### 7.8 Requests

```
POST /requests
Body: { phraseId?, customPhraseId?, inputMode, confirmed: true, clientRequestId }
```
- Reject if `confirmed !== true`.
- Resolve `resolvedText` server-side from `phraseId` (or approved `customPhraseId`) — never from a
  client `renderedText` field, don't even accept one.
- Filter `caregiverIds` to the caller's **active** `CaregiverLink`s only; reject if none match.
- Upsert-safe insert on `clientRequestId`: try `create`, catch the duplicate-key error (Mongo error
  code `11000`), and on conflict return the existing document instead of erroring — this is the
  idempotency behavior invariant #3 requires.

```
GET  /requests/:id            -> only if request.user is the communicator or a targeted caregiver
GET  /requests/stream          -> SSE; always the caller's own inbox, never an arbitrary query param
POST /requests/:id/acknowledge -> caregiver-only, sets acknowledgement + status
POST /requests/:id/cancel      -> communicator-owner-only
```

For SSE: poll MongoDB every 1–2s for the caller's pending/updated requests and push deltas — simplest
thing that works in a single-instance deploy; no need for change streams in a 4-hour build. Manually
set CORS headers on this route (`Access-Control-Allow-Origin`, checked against `ALLOWED_ORIGINS`)
since writing to `reply.raw` directly bypasses Fastify's normal CORS plugin — this bit a real browser
last time even though curl/Node fetch never caught it.

### 7.9 Health

```
GET /health/live    -> 200 if the process is up
GET /health/ready    -> 200 only if mongoose.connection.readyState === 1
```

---

## 8. Testing

Use `vitest`. Per the existing project convention: **every route needs at least one failure-path
test**, not just the happy path — e.g. `requests.test.ts` must include a case for
`confirmed: false` → 400, and a duplicate `clientRequestId` → same request returned, not a 500.
Minimum viable set for a 4-hour build: auth, requests (confirmation + idempotency), caregivers
(authorization), phrases/rank (allow-list filtering + fallback).

---

## 9. Deployment

**Backend → Render** (simple free tier, good fit for a persistent Node process):
1. New Web Service → connect your GitHub repo.
2. Build command: `npm install && npm run build` (or `tsx`/`ts-node` directly if skipping a build
   step to save time).
3. Start command: `npm start`.
4. Add every `.env` variable from §3.4 in the Render dashboard — never commit `.env`.
5. Health check path: `/health/ready`.
6. After first deploy, run the seed script once (Render shell, or a one-off local run pointed at the
   Atlas connection string).
7. **Test the deployed URL from an incognito window** before submitting — the rubric explicitly
   penalizes "works locally only."

Railway is an equally fine alternative if Render's cold-start free tier is a problem during the demo.

---

## 10. AI Prompt Log (mandatory — hackathon spec §2.2)

Keep this table updated *as you work*, not reconstructed afterward. One row per significant AI use:
tool, exact prompt, purpose, and how you checked/modified the output. Redact secrets. Copy this table
into your submission PDF and your README.

| # | Tool | Prompt (exact) | Purpose | How output was checked/modified |
|---|---|---|---|---|
| 1 | Claude Code | "Scaffold a Fastify + TypeScript backend with Mongoose models for User, CaregiverLink, Board, Phrase, CustomPhrase, CommunicationRequest, AuditEvent per docs/HACKATHON_BACKEND_BUILD_GUIDE.md §5" | Initial project scaffold | Reviewed schema field types against the guide; ran `npm run build` to confirm it compiled |
| 2 | Claude Code | "Implement POST /auth/demo-login per §7.1: Zod schema with the Sri Lankan phone regex and friendly error message, find-or-create user, sign JWT" | Auth route | Tested with a bad phone number to confirm the friendly message, and a valid one to confirm JWT decodes |
| 3 | Claude Code | "Implement POST /requests per §7.8: confirmation enforcement, server-side text resolution, clientRequestId idempotency via unique index + duplicate-key catch, caregiverIds filtered to active links only" | Core request flow | Wrote the idempotency test first (duplicate clientRequestId), confirmed it passed before moving on |
| 4 | Claude Code | "Implement services/llmRanker.ts per §7.5: OpenAI call with 2s timeout, JSON array parsing, filter results against allowed_phrase_ids, fall back to ranker.ts on any failure" | AI ranking feature | Manually forced a timeout (set OPENAI_TIMEOUT_MS=1) to confirm the fallback path actually fires and reasonCode reflects it |
| ... | | | | *(add a row per real prompt as you go — don't backfill from memory)* |

Suggested build-order prompts (use these as your literal starting points, then log each one above
with what you actually changed after):

1. *"Scaffold the Fastify app per §4 of docs/HACKATHON_BACKEND_BUILD_GUIDE.md — app.ts/server.ts split, env validation, mongoose connection, health routes."*
2. *"Add the 7 Mongoose models from §5 with the indexes listed."*
3. *"Write seed/seed.ts per §6 using this boards.json and phrases.json."*
4. *"Implement auth + profiles routes per §7.1–7.2."*
5. *"Implement boards + custom-phrases routes per §7.3–7.4."*
6. *"Implement the AI ranking route and services per §7.5, including the allow-list filter and fallback."*
7. *"Implement the TTS fallback route per §7.6."*
8. *"Implement caregivers routes per §7.7 — pay close attention to the authorization notes, this is where the last version had real bugs."*
9. *"Implement requests routes per §7.8, including SSE and the manual CORS header on that route."*
10. *"Write failure-path tests per §8 for auth, requests, caregivers, and phrases/rank."*

---

## 11. Declaration (hackathon spec §2.3 — put this in your README too)

> Example: *"Claude Code — used to scaffold the Fastify backend, implement all API routes, and write
> tests, from the prompts logged in docs/HACKATHON_BACKEND_BUILD_GUIDE.md §10. Every route's
> authorization logic and the AI ranking fallback path were manually tested by the backend author
> before merging. OpenAI (gpt-4o-mini) — powers the live phrase-ranking feature at runtime, not used
> to write code."*

---

## 12. Submission checklist (mapped to the marking rubric)

- [ ] All 10 minimum functional requirements demonstrably work against the **deployed** backend
- [ ] `README.md` has: problem, solution, features, tech stack, AI tools used + declaration, team
      contributions, install/run instructions, deployed link, demo video link
- [ ] AI Prompt Log completed contemporaneously, included in the submission PDF
- [ ] Public backend URL responds correctly from an incognito window
- [ ] `.env` is git-ignored; `.env.example` is committed with no real secrets
- [ ] Every route has at least one failure-path test, and the suite passes
- [ ] Git history shows real commits from the session window, from more than one author
