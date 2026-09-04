# Sahaaya — Frontend Build Guide (Scratch, Hackathon)

Owner: frontend member, built live with Claude Code during the session. This is intentionally
lighter than the backend doc — you own the UI/UX calls. The one hard constraint: the API contract
below is frozen, so you can build against it without waiting on the backend to be finished.

---

## 1. The problem, in one paragraph (for your landing page / in-app explanation)

Sahaaya is an assistive communication (AAC) app for non-speaking people in Sri Lanka — someone who
can't speak (due to stroke, cerebral palsy, ALS, etc.) selects a phrase on a board, confirms it, the
device speaks it aloud in Sinhala, Tamil, or English, and optionally a linked caregiver is notified
and can acknowledge it. It is **not** speech therapy, diagnosis, or an emergency service. The
hackathon spec requires this explanation to appear inside the app (not just the README) — put it on
the landing/login screen.

---

## 2. Suggested stack

React + Vite + TypeScript + Tailwind CSS + i18next (en/si/ta). This is a proven combination for this
exact app shape — fast to scaffold, handles the trilingual requirement cleanly, and Tailwind makes
"responsive on desktop and mobile" (a hard rubric requirement) fast to get right. Not mandatory — use
what you're fastest in.

---

## 3. Non-negotiables (frontend side)

1. **Never skip the confirm screen**, including for any hands-free/gesture selection path if you
   build one — a phrase selection always routes through a confirm/cancel step before it's sent.
2. **Display text must match the selected language.** Match `i18n.language` ("en"/"si"/"ta") to the
   phrase object's actual field names (`english`/`sinhala`/`tamil`) explicitly — don't assume they
   line up, they don't by default and this was a real bug last time (phrases silently sent to
   caregivers in the wrong language while audio played correctly).
3. **No secrets in `VITE_*` env vars.** The only one you need is the API base URL.
4. **Handle a 401 from the API** by clearing the session and returning to login — don't leave the
   user stuck on a dead screen.
5. **Every network call needs a visible failure state.** Silently swallowed errors (e.g. an
   acknowledge button that fails with no feedback) are a real usability bug, not a nitpick.

---

## 4. `.env`

```bash
VITE_API_BASE_URL=http://127.0.0.1:8080   # switch to the deployed Render URL before you deploy the frontend
```

Nothing else belongs here.

---

## 5. Minimum requirements → screens (your definition of done)

| Requirement | Screen/component |
|---|---|
| Landing page / main UI | Login screen |
| SL problem explained in-app | Panel/section on the login screen (see §1) |
| ≥2 functional features | Board (select+send) + Caregiver inbox (view+acknowledge), at minimum |
| ≥1 input form | Demo login form (name, phone, role) |
| Friendly validation errors | Phone number format, empty name, etc. — mirror the backend's Zod messages, don't just show raw errors |
| Display/search/filter/process | Board phrase grid, filterable by category if time allows |
| Responsive | Test at a real mobile width, not just a resized browser window |
| Basic navigation | Login → Board ↔ Caregiver Inbox, with a way back |
| Sample data | Comes from the backend's seeded boards/phrases — nothing to do here except call the API |
| Demonstrates value to SL users | Sinhala/Tamil text + audio actually rendering correctly is the whole demo |

Suggested screen list: **Login** (role select + demo-login form + problem blurb) → **Board**
(phrase grid, tap → confirm modal → send) → **Request status** (poll until acknowledged) →
**Caregiver pairing** (create/accept a code inline, simplest UI that works) → **Caregiver inbox**
(list of incoming requests, acknowledge button).

---

## 6. API quick reference

Base URL: `VITE_API_BASE_URL + /api/v1`. Send `Authorization: Bearer <token>` on everything except
`/auth/demo-login`.

```
POST   /auth/demo-login          { name, phone, role } -> { token, user }
GET    /profiles/me               -> { user, preferences }
PATCH  /profiles/me/preferences   { language?, boardContext? }

GET    /boards?context=home&language=si   -> [{ id, title, context }]
GET    /boards/:boardId                    -> { id, title, context, phrases: [Phrase] }

POST   /phrases/rank    { boardId, recentPhraseIds? } -> { rankedPhraseIds, reasonCode }
POST   /phrases/:phraseId/tts                          -> { audioUrl } | { text, fallback: true }

POST   /custom-phrases  { text, language }
POST   /custom-phrases/:id/approve

POST   /caregivers/pair          -> { pairingCode }
POST   /caregivers/pair/accept   { pairingCode }
GET    /caregivers                -> linked caregivers/communicators

POST   /requests
  { phraseId?, customPhraseId?, inputMode, confirmed: true, clientRequestId: crypto.randomUUID() }
GET    /requests/:id
GET    /requests/stream            -> Server-Sent Events, caller's own inbox
POST   /requests/:id/acknowledge
POST   /requests/:id/cancel
```

`Phrase` shape: `{ id, category, english, sinhala, tamil, symbolAsset, riskClass, canNotify, requiresConfirmation, version }`.

For the caregiver inbox, either consume `GET /requests/stream` (EventSource) or poll
`GET /requests/:id` every ~2s if SSE is being flaky on the day — both are valid, poll is simpler to
debug live.

---

## 7. Confirm-before-send flow (implement exactly this shape)

1. User selects a phrase tile → open a modal showing the phrase text in the current language + a
   Cancel/Confirm choice. Do not send anything yet.
2. On Confirm: `POST /requests` with `confirmed: true` and a freshly generated `clientRequestId`.
3. Show a pending/sending state, then poll or listen for status until `delivered`/`seen`/etc.
4. On Cancel: close the modal, no network call.

If you build a hands-free/gesture input mode as a stretch feature, route its "selection" event
through this exact same modal — don't build a second, gesture-only send path that skips confirmation.

---

## 8. Deployment

Vercel or Netlify, either is fine for a static Vite build:
1. Connect the GitHub repo, set the build command (`npm run build`) and output dir (`dist`).
2. Add `VITE_API_BASE_URL` pointed at the deployed backend, in the platform's environment settings.
3. Test the deployed frontend end-to-end in an **incognito window** — this is the actual acceptance
   test the rubric uses.
4. Make sure the backend's `ALLOWED_ORIGINS` includes this deployed frontend URL (tell your backend
   teammate the URL the moment you have it — this is a common last-20-minutes breakage).

---

## 9. AI Prompt Log (mandatory — hackathon spec §2.2)

Same format as the backend doc, kept separately since you're a different "significant AI use"
author. Fill in as you go, not after the fact.

| # | Tool | Prompt (exact) | Purpose | How output was checked/modified |
|---|---|---|---|---|
| 1 | Claude Code | "Scaffold a Vite + React + TS + Tailwind + i18next app with routes for Login, Board, Caregiver Inbox, calling the API described in docs/HACKATHON_FRONTEND_BUILD_GUIDE.md §6" | Initial scaffold | Ran `npm run dev`, clicked through each route manually |
| 2 | Claude Code | "Build the demo-login form per §5/§6 — name, phone, role, calling POST /auth/demo-login, storing the token, friendly inline validation errors matching the backend's messages" | Login screen | Tested with an invalid phone number to confirm the error text is friendly, not a raw API error |
| 3 | Claude Code | "Build the Board screen and the confirm-before-send modal exactly per §7 — no phrase send bypasses the modal" | Core AAC flow | Manually confirmed a Cancel does not call POST /requests (checked network tab) |
| ... | | | | *(add a row per real prompt)* |

Suggested starter prompts:
1. *"Scaffold the app per §2/§6 of docs/HACKATHON_FRONTEND_BUILD_GUIDE.md."*
2. *"Add i18next with en/si/ta resource files and a language switcher."*
3. *"Build the login screen with the problem explanation panel from §1."*
4. *"Build the board screen fetching GET /boards and GET /boards/:id, with the language-field mapping fix from §3.2 — don't assume i18n.language matches a phrase field name."*
5. *"Build the confirm-before-send modal per §7 and wire POST /requests."*
6. *"Build caregiver pairing (create/accept code) and the caregiver inbox consuming GET /requests/stream, with an acknowledge button that shows errors on failure."*
7. *"Add a responsive check pass — verify the board and inbox screens at a 375px-wide viewport."*

---

## 10. Declaration (hackathon spec §2.3 — put this in the shared README too)

> Example: *"Claude Code — used to scaffold the React frontend, build all screens, and wire the API
> calls, from the prompts logged in docs/HACKATHON_FRONTEND_BUILD_GUIDE.md §9. All generated UI was
> manually clicked through in the browser before considering a screen done; the language-mapping and
> confirm-modal logic were specifically re-checked by hand since they're the two places a subtle bug
> would be invisible in a quick demo."*

---

## 11. Before you record the demo video

- Full click-through in an incognito window against the **deployed** URLs (both frontend and
  backend) — not localhost.
- Confirm Sinhala and Tamil text actually render as Sinhala/Tamil, not tofu boxes (font loading).
- Confirm a caregiver acknowledgement actually reflects back to the communicator's screen.
- Have both the confirm-modal path and one failure case (e.g. a bad phone number) ready to show
  live if the panel asks for it.
