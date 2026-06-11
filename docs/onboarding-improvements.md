# Onboarding — Improvement Plan (A–F)

Status: proposed · Scope: NGO conversational onboarding (`lib/onboarding/*`, `app/api/onboarding/*`, `components/onboarding/*`)

This plan addresses two classes of issue found in a full read of the onboarding:

1. **Data quality** — what we persist and feed downstream to the campaign-agent.
2. **UX friction** — length, error handling, and the mixed voice+text experience.

The architecture itself is sound: the data→use loop closes (onboarding → `org-store` → `get_organization_profile` in the campaign-agent), the deterministic fallback engine guarantees a non-empty profile without an API key, and the live "dossier" gives good feedback. These items refine it; they are not a rewrite.

---

## Summary & recommended order

| ID | Change | Impact | Effort | Risk | Class |
|----|--------|--------|--------|------|-------|
| **A** | Gate completion on profile *content*, not answer-key presence | High | Low | Low | Data quality |
| **B** | Don't lose the user's message on network failure | Med | Low | Low | UX |
| **C** | Required-first question ordering + "minimum reached" offer | High | Med | Med | UX |
| **D** | Quick-reply chips (Skip / N/A / yes-no) | Med | Med | Low | UX |
| **E** | Live dossier sync during a voice call | Med | Med | Med | UX |
| **F** | Server-side resume by org (cross-device) | Med | Med | Low | UX / data |

**Recommended sequence:** `A → B` first (correctness + cheap friction win), then `C` (biggest perceived-friction win), then `D`, then `E`/`F` when there's room.

---

## A. Single source of truth for "complete": profile content, not answer-key presence

**Priority:** High impact / Low effort — do this first.

### Problem
There are two competing notions of "complete" and the gate uses the weak one:

- **Presence-based** (`canComplete`): a block counts as covered if it has *at least one answered key*.
- **Content-based** (`computeMissingFields`): a required field counts only if it actually has content in the profile.

The completion endpoint gates on the presence-based check, and a *skipped* answer still registers a key. So a session can finalize with, e.g., the organization name empty — and that thin profile is exactly what the campaign-agent consumes later via `getOrgProfile(orgId)`.

### Evidence
- `app/api/onboarding/complete/route.ts:34` — `const answeredKeys = new Set(Object.keys(session.answers))` then `canComplete(answeredKeys)`.
- `lib/onboarding/profile.ts:322` — `canComplete()` only checks `computeCompletedBlocks` (blocks with ≥1 answered key) against `MIN_BLOCKS_FOR_COMPLETION`.
- `lib/onboarding/agent.ts:80` — a skipped answer still writes `session.answers[key] = { answer: '(saltada)', confidence: 'low' }`, registering the key.
- `lib/onboarding/profile.ts:305` — `computeMissingFields()` (content-based, via `isRequiredFieldFilled`) exists but is **not** used by the gate.
- `lib/onboarding/agent.ts:138` — deterministic `shouldComplete` only requires `answeredKeys.size >= 4`.

### Proposed change
1. Gate completion on `computeMissingFields(session.profile)` being empty (content), not on `canComplete(answeredKeys)` (presence). Keep `force` as the explicit override for "finalize anyway".
2. In the `complete` route, return the actual missing **fields** (not just missing blocks) in the 422 body, so the UI can tell the user exactly what's missing.
3. Reconsider the `>= 4` minimum — align `shouldComplete` with "all required fields filled" rather than a raw count.

### Acceptance criteria
- A session with any required field empty (`REQUIRED_QUESTION_KEYS`) cannot finalize without `force: true`.
- The 422 response lists the missing required field keys.
- A skipped required question does **not** satisfy the gate.

### Risk / notes
- Low risk; mostly swapping which helper the gate calls.
- Define explicitly what `force` means for downstream consumers (a forced, incomplete profile should perhaps be flagged in `metadata`).

---

## B. Don't lose the user's message on network failure

**Priority:** Med impact / Low effort — cheap, do it with A.

### Problem
On send, the message is added optimistically and the input is cleared immediately. If the request fails, the hook reverts the whole session to the previous state — the optimistic message vanishes and the text is already gone from the composer. On a flaky connection the user loses what they typed.

### Evidence
- `components/onboarding/use-onboarding.ts:120-133` — optimistic session set.
- `components/onboarding/use-onboarding.ts:147-151` — `catch` does `setSession(session)` (reverts) and sets error.
- `components/onboarding/chat-input.tsx:78-84` — `submit()` calls `onSend(...)` then unconditionally `setText('')` / `setPending([])`.

### Proposed change
- On failure, **preserve the user's input** so they can retry: either keep the text in the composer until the send succeeds, or re-inject the failed message text back into the composer on error.
- Offer an explicit "Retry" affordance on the failed message instead of silently dropping it.
- Keep already-uploaded attachments associated with the retry so files aren't re-uploaded.

### Acceptance criteria
- A failed send leaves the typed text recoverable (in the composer or one click away).
- Retrying does not duplicate the user message in the transcript.

### Risk / notes
- Low risk; client-only change. Watch for double-submit if both "retry" and a late success resolve.

---

## C. Required-first question ordering + "minimum reached" offer

**Priority:** High impact / Med effort — biggest perceived-friction win.

### Problem
There are 30 questions across 8 blocks, asked strictly in script order, one per turn. Only 9 are required, but they're interleaved with 21 optional ones, so the user grinds through optional questions before the profile is actually usable. The progress bar measures *blocks touched*, not questions, so the user can't tell how much is really left. The header promises "in a few minutes" but the flow doesn't honor that.

### Evidence
- `lib/onboarding/questions.ts:54-261` — 30 questions in fixed order; 9 marked `required`.
- `lib/onboarding/questions.ts:285-303` — `getNextQuestionKey` walks the list sequentially.
- `lib/onboarding/questions.ts:267-278` — `REQUIRED_QUESTION_KEYS` and `MIN_BLOCKS_FOR_COMPLETION` already exist to drive a smarter order.
- `components/onboarding/onboarding-experience.tsx:58-62` — progress is `completedBlockCount / TOTAL_BLOCKS`.

### Proposed change
1. Make `getNextQuestionKey` prefer **unanswered required questions first**, then fall back to optional ones in block order.
2. When all required fields are satisfied, have the assistant explicitly offer: *"Ya tenés lo mínimo para generar campañas — ¿afinamos algunos detalles o finalizamos?"* and surface a "Finalizar ahora" affordance.
3. Split the progress indicator into two signals: "minimum for campaigns" (required coverage) and "depth" (optional coverage), so the user understands the optional tail is genuinely optional.

### Acceptance criteria
- The first ~9 turns cover the required questions (barring user-driven detours).
- Once required coverage is complete, the UI clearly communicates that finalizing is now possible.
- Progress no longer implies 30 questions are mandatory.

### Risk / notes
- Med risk: changes conversation flow; coordinate with the LLM prompt (`prompts.ts`) so the LLM mode follows the same priority, and with the voice agent's `question_key` flow.
- Keep the deterministic and LLM modes consistent on ordering.

---

## D. Quick-reply chips (Skip / N/A / yes-no)

**Priority:** Med impact / Med effort.

### Problem
Questions that don't apply are expensive. An NGO with no street-fundraising team must type "no" to all 5 questions in the *street* block. Skipping exists only as free-text matching ("paso", "no sé"); there's no button.

### Evidence
- `lib/onboarding/agent.ts:40` — `SKIP_RE` detects skips from typed text only.
- `components/onboarding/chat-input.tsx` — composer has no quick-reply affordances.
- Yes/no-shaped questions: `store_products`, `street_team`, `campaign_need`, `donor_types` (recurring), etc.

### Proposed change
- Render contextual quick-reply chips below the assistant message for the current `questionKey`:
  - Always: **"Saltear"** and **"No aplica"** (the latter should mark the block/question as deliberately empty, not as a low-confidence answer).
  - For yes/no questions: **"Sí" / "No"** chips that submit a normalized answer.
- Distinguish "skipped" from "not applicable" in `session.answers` so analytics and the completion gate can treat them differently (N/A on an *optional* question is fine; skipping a *required* one is not — ties into A).

### Acceptance criteria
- Tapping a chip submits the same way a typed answer would and advances the flow.
- "No aplica" on an optional block doesn't generate noise in the profile.

### Risk / notes
- Low logic risk; mostly UI plus a small `answers` shape addition.
- The chip set must be driven by question metadata (e.g., a `kind: 'yes_no' | 'open'` field on `OnboardingQuestion`) to avoid hardcoding per-key UI.

---

## E. Live dossier sync during a voice call

**Priority:** Med impact / Med effort.

### Problem
The voice path (ElevenLabs) writes answers server-side through its tools, but the text hook never re-fetches session state. While the user talks, the left-hand dossier stays frozen. The "mixed" experience the type system anticipates (`source: 'mixed'`) doesn't feel mixed — the user speaks and sees nothing change until a reload or a text message.

### Evidence
- `components/onboarding/voice-panel.tsx` — drives the call and server tools; never touches the `useOnboarding` state.
- `components/onboarding/use-onboarding.ts` — refreshes session only on mount (`loadSession`) or after `message`/`complete` (`markSaved`); no polling.
- `lib/onboarding/types.ts:11` — `OnboardingSource` includes `'mixed'`.
- Voice writes: `app/api/onboarding/voice/save-answer/route.ts`, `app/api/onboarding/voice/update-profile/route.ts`.

### Proposed change
- While a voice call is `connected`, poll the session (`GET /api/onboarding/session/:id`) on an interval (e.g. 3–5s) and `markSaved` the result so the dossier updates live.
- At minimum, refetch once when the call ends so the dossier reflects everything captured by voice.
- Longer term: consider a lightweight push (SSE) instead of polling if the demo budget allows.

### Acceptance criteria
- During an active voice call, completed blocks and key facts appear in the dossier without a manual reload.
- Ending a call leaves the dossier consistent with what was said.

### Risk / notes
- Med risk: polling adds load and races with optimistic text updates. Make `markSaved` idempotent and ensure the latest server state wins.
- Stop polling when the call disconnects to avoid background churn.

---

## F. Server-side resume by org (cross-device)

**Priority:** Med impact / Med effort.

### Problem
Resume depends solely on `localStorage` keyed by subdomain. Sessions live in Redis with a 30-day TTL, but if the user switches browser or device, there's no way to find the in-progress session — they start over.

### Evidence
- `components/onboarding/use-onboarding.ts:31-37` — `storageKey` derived from subdomain in `localStorage`.
- `components/onboarding/use-onboarding.ts:75-96` — init reads `localStorage` then falls back to `createSession`.
- `lib/onboarding/store.ts:65-80` — sessions persisted in Redis with a 30-day TTL.
- No server-side index of "in-progress session for org X".

### Proposed change
- Maintain a server-side pointer from org → current in-progress session id (e.g. a Redis key `onboarding:org:{orgId}:active`), set on create and cleared on complete/reset.
- On init, if `localStorage` has nothing, ask the server for the org's active session before creating a new one.
- Keep `localStorage` as a fast-path cache, not the only source of truth.

### Acceptance criteria
- Starting onboarding on a second device resumes the same in-progress session.
- Completing or resetting clears the org pointer so a fresh session starts cleanly next time.

### Risk / notes
- Low logic risk; additive Redis key.
- Decide the policy when an org already has a completed profile and starts again (re-onboard vs. edit) — interacts with `markOrgOnboarded` and the `/onboarding` → `/admin` redirect in `app/onboarding/page.tsx:22`.

---

## Cross-cutting notes

- **Keep deterministic and LLM modes in lockstep.** Several items (A, C, D) touch logic that both engines must honor; the LLM system prompt (`lib/onboarding/prompts.ts`) needs matching guidance.
- **Voice tooling parity.** Ordering (C) and answer kinds (D) must be reflected in the ElevenLabs voice tools (`lib/onboarding/voice-tools.ts`) since `question_key` is shared.
- **Copy polish.** `components/onboarding/voice-panel.tsx` has missing accents ("Preferis", "boton", "aca", "esta") — low effort, user-facing.
