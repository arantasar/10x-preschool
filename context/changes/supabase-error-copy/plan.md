# Polskie komunikaty błędów logowania i rejestracji — Implementation Plan

## Overview

Both auth API routes hand Supabase's own English `error.message` to `?error=`, and both
auth pages render whatever arrives there verbatim. A teacher who mistypes a password reads
"Invalid login credentials" on a screen that is otherwise entirely Polish.

This plan replaces the free-text contract with a **code** contract: the routes put only a
short machine code in `?error=`, and the pages translate that code to Polish at render time
through one pure lookup in `src/lib/`. Beyond the copy fix this closes a second, unrecorded
problem — today `?error=<any text>` renders on our sign-in page styled as our own message,
which is a ready-made phishing carrier (not XSS; React escapes it).

## Current State Analysis

Exactly four sites produce `?error=`, all four inside the two API routes:

- `src/pages/api/auth/signin.ts:11` and `src/pages/api/auth/signup.ts:11` — our own literal
  Polish string `"Supabase nie jest skonfigurowany"` when `createClient` returns `null`.
- `src/pages/api/auth/signin.ts:16` and `src/pages/api/auth/signup.ts:16` — Supabase's
  `error.message`, untouched and in English.

Exactly two sites consume it: `src/pages/auth/signin.astro:5` and
`src/pages/auth/signup.astro:5` both read `Astro.url.searchParams.get("error")` and pass it
down as `serverError` to `SignInForm` / `SignUpForm`, which hand it to
`src/components/auth/ServerError.tsx:8`. `ServerError` renders `message` as-is with no
allow-list — its only guard is `if (!message) return null`.

`src/middleware.ts:30` redirects to `/auth/signin` **without** a param, so it is not a
producer and needs no change. Nothing else in `src/` writes the parameter.

The map has no home yet. `src/lib/` holds the project's pure helpers (`config-status.ts`,
`day-plan-dates.ts`, `day-plan-limits.ts`) in kebab-case; `src/lib/services/` is reserved for
code that touches Supabase or spans tables, which this does not.

## Desired End State

A teacher never sees English on the auth screens, whatever Supabase returns, and no string
that did not originate in our own source can be made to appear inside the error box.

Verify by: signing in with a wrong password and reading a Polish sentence; and by opening
`/auth/signin?error=Twoje%20konto%20wygaslo%20-%20zadzwon%20pod%20500600700` and seeing the
generic Polish fallback instead of the injected sentence.

### Key Discoveries:

- `AuthError.code` is typed `ErrorCode | (string & {}) | undefined`
  (`node_modules/@supabase/auth-js/dist/module/lib/errors.d.ts:14-19`, version 2.105.3). The
  union is **open** — the `(string & {})` arm means TypeScript will not flag an unmapped code
  for you, so the fallback must be a runtime lookup miss, not a compile-time exhaustiveness
  check.
- The same declaration states `code` is absent only for errors "that occur before a response
  is received". This is what makes the two-message fallback implementable: a missing `code`
  is the pre-response case by construction, not a guess.
- `AuthApiError extends AuthError` with `status: number` non-optional
  (`errors.d.ts:41-44`) — anything that came back from the REST API carries both.
- `test-plan.md` §6.1 already specifies the unit-test pattern and names "mapowanie błędu"
  as belonging exactly at this layer. `npm test` (`vitest run`) is already a CI step,
  between `npm run lint` and `npm run build` (`.github/workflows/ci.yml:20`).
- `CLAUDE.md:67` records this leak as a *known exception* to the Polish-copy rule. Closing
  the code without closing that line leaves the convention misdescribing the codebase.

## What We're NOT Doing

- Not translating anything outside the two auth flows. Errors on `/api/day-plan/*` and their
  islands are out of scope.
- Not mapping all 86 `ErrorCode` literals. Only codes reachable from `signInWithPassword`
  and `signUp` get bespoke Polish; MFA, SAML, SSO and OAuth codes stay unmapped by choice.
- Not adding an i18n layer. `CLAUDE.md` §Key conventions is explicit that strings live at
  their point of use; this map is a domain lookup, not a translation framework.
- Not refactoring the routes to take Supabase from `context.locals`. That refactor is what a
  §6.2 integration test would need, and it is not otherwise called for here.
- Not touching `signout.ts` (it never emits an error param) or `middleware.ts`.
- Not changing `ServerError.tsx`. It keeps rendering the string it is given; the guarantee
  now comes from the fact that every caller passes a translated one.

## Implementation Approach

One pure module owns the whole vocabulary: Supabase's own codes plus two synthetic ones we
mint (`config_missing`, `connection_failed`). The routes' only job becomes *choosing a code*;
the pages' only job becomes *looking it up*. Because the lookup returns the generic fallback
for anything it does not recognise, an attacker-supplied `?error=` value cannot render as
attacker-chosen text — the invariant holds by construction rather than by sanitisation.

Phase 1 lands the map and its test with nothing wired to it, so it can be verified alone.
Phase 2 flips all six call sites together — split across two commits, the hole would be
half-open in between. Phase 3 closes the paper trail that currently advertises the leak.

## Critical Implementation Details

**State sequencing.** The contract flip in Phase 2 must land as one commit. Changing the
routes first leaves the pages rendering raw codes (`invalid_credentials` in the error box);
changing the pages first leaves them looking up English sentences and falling back on every
real error. Neither intermediate state is shippable, and `master` deploys on merge.

**Fallback semantics.** Two distinct fallbacks, and they are chosen in different places.
A *missing* `code` is decided in the route (it mints `connection_failed`, which is a mapped
key with its own wording). An *unmapped but present* code is decided at render (the lookup
misses and returns the generic text). Do not try to detect the network case at render — by
then the distinction is gone.

## Phase 1: Map + unit test

### Overview

Add the pure `code → Polish text` lookup and its co-located test. Nothing imports it yet, so
this phase is verifiable in complete isolation and cannot break the running app.

### Changes Required:

#### 1. The error-copy map

**File**: `src/lib/auth-error-messages.ts` (new)

**Intent**: Own the entire user-facing error vocabulary for the auth flows in one place —
Supabase's codes and our two synthetic ones — and answer any input with Polish text, never
with `undefined` and never with English.

**Contract**: A default-exported-free named module exposing (a) the two synthetic code
constants so routes reference them symbolically rather than by string literal, and (b) a
single lookup function taking `string | undefined` and returning `string`. Signature shape:
`authErrorMessage(code: string | null | undefined): string`. Accepting `null` matters —
`searchParams.get()` returns `null`, and the pages will pass its result straight in.

Coverage, per the "reachable from these two calls" decision:

| Code | Flow | Meaning to cover |
| --- | --- | --- |
| `invalid_credentials` | signin | wrong email or password |
| `email_not_confirmed` | signin | account exists, link not clicked yet |
| `user_banned` | signin | account blocked |
| `weak_password` | signup | password rejected by policy |
| `email_exists` | signup | address already registered |
| `user_already_exists` | signup | same, other server wording |
| `signup_disabled` | signup | registration turned off server-side |
| `email_provider_disabled` | signup | email/password provider off |
| `email_address_invalid` | both | address rejected as malformed |
| `validation_failed` | both | request rejected — must read correctly on either screen |
| `over_request_rate_limit` | both | too many attempts |
| `over_email_send_rate_limit` | signup | too many confirmation emails |
| `captcha_failed` | both | captcha check failed |
| `config_missing` | both | **synthetic** — replaces the literal at routes' line 11 |
| `connection_failed` | both | **synthetic** — Supabase unreachable / no response |

The synthetic keys need a comment stating they are ours, not Supabase's, so a future reader
does not go looking for them in `ErrorCode`.

Do **not** type the map as `Record<ErrorCode, string>` — `ErrorCode` is an open union, so
that annotation buys no exhaustiveness while forcing all 86 keys.

**Wording constraints**: every message is Polish, addressed to a teacher, and says what to do
next where there is something to do. `invalid_credentials` must not disclose whether the
email exists. `connection_failed` and the generic fallback are distinct sentences — that is
the whole point of the two-message decision.

#### 2. Unit test

**File**: `src/lib/auth-error-messages.test.ts` (new)

**Intent**: Pin the three behaviours the rest of the change rests on: known codes translate,
unknown codes fall back, and nothing in the module is English.

**Contract**: Vitest, following `test-plan.md` §6.1 — co-located, `<module>.test.ts`, no
mocking of anything (the module is pure and imports nothing). Cases:

- Every key in the map returns a non-empty string that differs from the generic fallback.
  Table-driven over the map's own keys, in the `it.each` style of the §6.1 reference test
  `src/lib/services/activity-generator.test.ts`.
- An unmapped-but-plausible code (e.g. `mfa_challenge_expired`) returns the generic fallback.
- `undefined` and `null` return the generic fallback.
- A hostile free-text input — the phishing string, not a code — returns the generic fallback.
  This is the regression test for the injection hole and must be present by name.
- No message matches `/[a-z]{4,}/i` drawn from a small English stop-word list
  (`invalid`, `password`, `credentials`, `email`, `user`, `failed`), guarding the leak class
  rather than one string.

**Distinguishing assertion** (§6.1, and `lessons.md` "Kryterium weryfikacji musi móc nie
przejść"): before this test is considered done, delete one entry from the map and confirm
the suite goes red. A fallback-returns-fallback suite passes against a function that returns
the fallback unconditionally; the per-key case is what rules that out.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- The map is not wired up yet — `grep -rn "auth-error-messages" src/ --include='*.astro' --include='*.ts' --include='*.tsx' | grep -v 'src/lib/auth-error-messages'` returns nothing.

#### Manual Verification:

- Deleting one entry from the map turns `npm test` red (the distinguishing-assertion check
  above); entry restored afterwards.
- Read the fifteen Polish strings aloud as a teacher would: each says what happened, and
  where the teacher can act, what to do next.

**Implementation Note**: After completing this phase and all automated verification passes,
pause here for manual confirmation from the human before proceeding.

---

## Phase 2: Flip the `?error=` contract

### Overview

Switch all four producers to emit codes and both consumers to translate. One commit — the
intermediate states are not shippable and `master` deploys on merge.

### Changes Required:

#### 1. Sign-in route

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Stop putting human text in the URL. Emit `config_missing` where the client is
absent, and for a Supabase failure emit its `code` — or `connection_failed` when there is no
code, which by the SDK's own contract means no response was received. Keep the original
English message out of the user's view but not out of the operator's: log it server-side so
Cloudflare's logs retain the diagnostic the URL no longer carries.

**Contract**: The redirect target stays `/auth/signin?error=<code>`. The value is now drawn
from the constants and from `error.code`, never from `error.message`. `console.error` on the
error branch carries at minimum the code, the status, and the original message. Keep
`encodeURIComponent` — the values are URL-safe today, but the encode is what guarantees the
route cannot be talked into emitting something structurally surprising.

#### 2. Sign-up route

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Identical treatment to the sign-in route, redirecting to `/auth/signup`.

**Contract**: As above. Both routes end up structurally parallel; keep them so, since a
future reader will diff them.

#### 3. Sign-in page

**File**: `src/pages/auth/signin.astro`

**Intent**: Translate at render. The page reads the code from the query string and resolves
it to Polish before it reaches the island.

**Contract**: The `serverError` prop passed to `SignInForm` is now the output of
`authErrorMessage(...)`, not the raw parameter. One subtlety: `authErrorMessage` must keep
returning `null`-ish for an absent parameter, or the error box renders on every clean page
load — `ServerError` only hides itself when `message` is falsy. Resolve this by having the
page skip the lookup when the parameter is absent, rather than by weakening the function's
`string` return type.

#### 4. Sign-up page

**File**: `src/pages/auth/signup.astro`

**Intent**: Identical treatment to the sign-in page.

**Contract**: As above, against `SignUpForm`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- No route emits free text any more: `grep -n "error.message" src/pages/api/auth/` returns
  nothing. (Scoped to the two route files, and it fails today — verified before the edit.)
- No literal Polish sentence remains in the routes:
  `grep -n "Supabase nie jest skonfigurowany" src/pages/api/auth/` returns nothing.
- Both pages go through the map:
  `grep -c "authErrorMessage" src/pages/auth/signin.astro src/pages/auth/signup.astro`
  reports 2 for each file (import + call).

#### Manual Verification:

- Sign in with a wrong password against local Supabase: the box shows the Polish
  `invalid_credentials` message, and the URL carries `?error=invalid_credentials`.
- Sign up with an address that already exists: Polish message, no English anywhere.
- Open `/auth/signin?error=Twoje%20konto%20wygaslo%20-%20zadzwon%20pod%20500600700`: the
  injected sentence does **not** appear; the generic fallback does. Repeat on `/auth/signup`.
- Open `/auth/signin` with no parameter: no error box at all (the falsy-guard check).
- With `SUPABASE_URL` / `SUPABASE_KEY` removed from `.dev.vars`, submit the sign-in form: the
  Polish config-missing message appears via `?error=config_missing`.
- Point `SUPABASE_URL` at an unroutable host and submit: the `connection_failed` message
  appears, distinct from the generic fallback, and the server console carries the original.

**Implementation Note**: After completing this phase and all automated verification passes,
pause here for manual confirmation from the human before proceeding.

---

## Phase 3: Close the recorded exception

### Overview

`CLAUDE.md` currently tells every future agent that English Supabase errors are a known,
accepted exception. Leaving that line in place after the code stops doing it is how the next
change re-introduces the leak. This phase also records the new contract, which is the part
worth carrying forward.

### Changes Required:

#### 1. Project conventions

**File**: `CLAUDE.md`

**Intent**: Replace the "Known exception" sentence at line 67 with the rule that now holds —
`?error=` carries codes, translation happens at render through `src/lib/auth-error-messages.ts`,
and free text in that parameter is a bug rather than a shortcut.

**Contract**: Edit confined to the `**UI copy is Polish**` bullet in §Key conventions. The
replacement must state the invariant (codes only) and name the module, so the next reader
knows where to add a code rather than inventing a second mechanism.

#### 2. Change record

**File**: `context/changes/supabase-error-copy/change.md`

**Intent**: Record what shipped, including the one decision taken during planning that the
change notes did not anticipate: the config-missing branch also became a code, because
leaving one free-text producer would have kept the injection surface open.

**Contract**: Append to §Notes; do not rewrite the four decisions already recorded there.
`status`/`updated` are the archive step's business, not this phase's.

#### 3. Follow-up trail

**File**: `context/foundation/next-actions.md`

**Intent**: Mark the Krok 1a entry and the follow-up row in the open-tails table as closed,
pointing at this plan.

**Contract**: Status-cell and Krok-1a-marker edits only. Best effort — if the file's shape
has moved on, note the skip rather than reshaping the document.

### Success Criteria:

#### Automated Verification:

- The advertised exception is gone: `grep -n "Known exception" CLAUDE.md` returns nothing.
- The new rule is present: `grep -n "auth-error-messages" CLAUDE.md` returns a line.
- Lint and format pass: `npm run lint`
- Full gate still green: `npm test && npm run build`
- The code change did not drift while docs were edited:
  `git diff -w --name-only master..HEAD -- src/` lists exactly the four modified files plus
  the two new ones, and nothing else.

#### Manual Verification:

- Read `CLAUDE.md:67` as a newcomer: it should be possible to add a new Supabase code to the
  UI from that sentence alone, without reading this plan.
- The `next-actions.md` open-tails table no longer lists this item as pending work.

---

## Testing Strategy

### Unit Tests:

`src/lib/auth-error-messages.test.ts` is the whole automated story, per `test-plan.md` §6.1
("czysta funkcja, schemat zoda, **mapowanie błędu**, strażnik typu — tutaj"). Key edge cases:
every mapped key resolves distinctly; unmapped code, `undefined`, `null`, and hostile free
text all resolve to the generic fallback; no message contains English.

### Integration Tests:

Deliberately none. The §6.2 pattern injects Supabase through `context.locals`, and these two
routes build their client inline via `createClient(...)`. Adding a route test would mean
refactoring production code this change has no other reason to touch. The route-level
invariant is covered instead by the scoped `grep` gates in Phase 2 and by manual verification.

### Manual Testing Steps:

1. `npx supabase start`, then `npm run dev`.
2. Sign in with a wrong password — expect Polish text and `?error=invalid_credentials`.
3. Sign up with an existing address — expect Polish text, no English.
4. Visit `/auth/signin?error=<any sentence>` — expect the generic fallback, not the sentence.
5. Visit `/auth/signin` clean — expect no error box.
6. Remove the Supabase vars from `.dev.vars`, submit — expect the config-missing message.
7. Point `SUPABASE_URL` at an unroutable host, submit — expect the connection message, and
   confirm the original English is in the server console.

## Performance Considerations

None. One object literal lookup on a page render path that already does a Supabase round
trip in middleware.

## Migration Notes

The `?error=` parameter is a transient redirect artefact, not stored state — nothing is
persisted and nothing needs migrating. The only stale-value window is a user holding an old
tab with an English `?error=` in the URL who reloads after deploy; they get the generic
fallback, which is the correct new behaviour.

**Release note**: merging to `master` deploys to production via Cloudflare Workers Builds
with no approval step (`CLAUDE.md` §CI). Branch is `fix/supabase-error-copy`; all three
phases should be reviewed before the PR merges.

## References

- Change record: `context/changes/supabase-error-copy/change.md`
- Original follow-up: `context/archive/2026-08-30-pl-landing-copy/follow-ups/supabase-error-copy.md`
- Unit-test cookbook: `context/foundation/test-plan.md` §6.1
- Reference test style: `src/lib/services/activity-generator.test.ts`
- Verification-criteria rules: `context/foundation/lessons.md`
  ("Kryterium weryfikacji musi móc nie przejść")
- SDK error contract: `node_modules/@supabase/auth-js/dist/module/lib/errors.d.ts:14-44`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Map + unit test

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — c085123
- [x] 1.2 Lint passes: `npm run lint` — c085123
- [x] 1.3 Build passes: `npm run build` — c085123
- [x] 1.4 Map not yet wired up (grep returns nothing outside the module itself) — c085123

#### Manual

- [ ] 1.5 Deleting one map entry turns `npm test` red; entry restored
- [ ] 1.6 The fifteen Polish strings read correctly to a teacher

### Phase 2: Flip the `?error=` contract

#### Automated

- [x] 2.1 Unit tests pass: `npm test`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Build passes: `npm run build`
- [x] 2.4 `grep -n "error.message" src/pages/api/auth/` returns nothing
- [x] 2.5 `grep -n "Supabase nie jest skonfigurowany" src/pages/api/auth/` returns nothing
- [x] 2.6 Both auth pages reference `authErrorMessage` twice each

#### Manual

- [ ] 2.7 Wrong password shows Polish message and `?error=invalid_credentials`
- [ ] 2.8 Existing address on sign-up shows Polish message, no English
- [ ] 2.9 Injected `?error=<sentence>` renders the generic fallback, not the sentence
- [ ] 2.10 Clean `/auth/signin` renders no error box
- [ ] 2.11 Missing Supabase config shows the config-missing message
- [ ] 2.12 Unreachable Supabase host shows the connection message; original in server console

### Phase 3: Close the recorded exception

#### Automated

- [ ] 3.1 `grep -n "Known exception" CLAUDE.md` returns nothing
- [ ] 3.2 `grep -n "auth-error-messages" CLAUDE.md` returns a line
- [ ] 3.3 Lint passes: `npm run lint`
- [ ] 3.4 `npm test && npm run build` green
- [ ] 3.5 `git diff -w --name-only master..HEAD -- src/` lists exactly the six expected files

#### Manual

- [ ] 3.6 `CLAUDE.md` §Key conventions is actionable without reading this plan
- [ ] 3.7 `next-actions.md` no longer lists this item as pending
