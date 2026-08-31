# Polskie komunikaty błędów logowania i rejestracji — Plan Brief

> Full plan: `context/changes/supabase-error-copy/plan.md`

## What & Why

`src/pages/api/auth/{signin,signup}.ts` pass Supabase's English `error.message` straight into
`?error=`, and `ServerError.tsx` renders it verbatim — so a teacher who mistypes a password
reads "Invalid login credentials" on an otherwise fully Polish screen. We replace the
free-text parameter with a **code**, translated to Polish at render through one pure map in
`src/lib/`. That also closes a hole the original follow-up did not notice: today
`?error=<any text>` renders on our sign-in page styled as our own message — not XSS, since
React escapes it, but a ready-made phishing carrier.

## Starting Point

Four `?error=` producers exist, all four inside the two API routes: two pass Supabase's
English message, two pass our own Polish literal `"Supabase nie jest skonfigurowany"`. Two
consumers exist — `signin.astro` and `signup.astro` — both reading the parameter raw and
passing it down to `ServerError`, which has no allow-list. `src/middleware.ts:30` redirects
without a parameter, so it is not involved. No error map exists anywhere yet.

## Desired End State

A teacher never sees English on the auth screens, whatever Supabase returns, and no string
that did not originate in our own source can be made to appear inside the error box. Wrong
password gives a Polish sentence and `?error=invalid_credentials`; a hand-crafted
`?error=<sentence>` gives the generic Polish fallback instead of the sentence.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Map key | `error.code`, not `error.message` | In `@supabase/auth-js` 2.105.3 `code` is a typed union and `AuthApiError` always carries `status`, so the follow-up's feared tradeoff does not exist. | Change record |
| Fallback | Generic Polish + original to `console.error` | The teacher never sees English; the operator keeps the diagnostic in Cloudflare's logs. | Change record |
| Map location | `src/lib/`, not `src/lib/services/` | Two routes call it, but it is a pure `code → text` function that touches neither Supabase nor the database. | Change record |
| `?error=` payload | The code, not ready-made text | Cleaner contract, and an unknown code falls back — so nothing can be injected into the error box. | Change record |
| Map coverage | Codes reachable from `signInWithPassword` / `signUp` (~15) | Every entry is a message a teacher can genuinely hit; a `Record<ErrorCode, string>` would add ~74 MFA/SAML/SSO strings and buy no real exhaustiveness, since `code` is an open union. | Plan |
| Config-missing branch | Also becomes a code (`config_missing`) | Leaving one free-text producer would keep the injection surface open — codes-only has to be an invariant, not a majority. | Plan |
| Per-flow wording | One flat map | Reachable codes barely overlap between the flows, so per-flow branching would be mostly unused. | Plan |
| Fallback granularity | Two messages: unreachable vs unexpected | A missing `code` means "no response received" by the SDK's own contract, so the route can mint `connection_failed` honestly. | Plan |
| Tests | Unit test on the map only | `test-plan.md` §6.1 names error mapping as exactly this layer; a route test would require refactoring the routes onto `context.locals`. | Plan |

## Scope

**In scope:** new `src/lib/auth-error-messages.ts` + co-located test; both auth API routes;
both auth `.astro` pages; the `CLAUDE.md` convention line that currently advertises the leak
as an accepted exception.

**Out of scope:** any i18n layer; errors outside the auth flows; `ServerError.tsx` itself;
`signout.ts`; `middleware.ts`; refactoring the routes onto `context.locals`.

## Architecture / Approach

```
route: pick a code                      page: resolve the code
  createClient() → null → config_missing
  error.code     → that code             authErrorMessage(code)
  error.code undefined → connection_failed   ├─ hit  → Polish text
        ↓                                     └─ miss → generic fallback
  ?error=<code>  ────────────────────────→        ↓
  console.error(original)                    <ServerError message />
```

One module owns the vocabulary — Supabase's codes plus two synthetic ones we mint. Routes
only choose a code; pages only look one up. Because a miss returns the fallback, hostile
input cannot render as hostile text: the guarantee is structural, not sanitisation.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Map + unit test | `auth-error-messages.ts` and its test, wired to nothing | A suite that passes against a function returning the fallback unconditionally — hence the mandatory per-key case and the delete-an-entry red check |
| 2. Flip the contract | All four producers emit codes, both pages translate | Must land as one commit; either half alone ships a broken screen, and `master` deploys on merge |
| 3. Close the exception | `CLAUDE.md` + change/follow-up trail updated | Skipping it leaves the conventions file telling the next agent that English errors are accepted |

**Prerequisites:** branch `fix/supabase-error-copy` (already checked out); local Supabase via
`npx supabase start` for the manual steps.
**Estimated effort:** ~1 session across 3 phases; Phase 1 and 3 are small, Phase 2 is the flip.

## Open Risks & Assumptions

- **The two-message fallback rests on an SDK doc comment.** `errors.d.ts` states `code` is
  absent only for pre-response errors, and we treat a missing code as "connection failed".
  If a future SDK version omits `code` for some other class, that case will show the
  connection message wrongly. The `console.error` line is what makes this detectable.
- **Coverage is a judgement, not a proof.** `ErrorCode` is an open union (`(string & {})`),
  so TypeScript cannot tell us a code is missing. Unmapped codes degrade to the fallback and
  surface only in the Cloudflare logs.
- **Signup on an existing address may not error at all.** Supabase's email-enumeration
  protection can return a fake success, so `email_exists` / `user_already_exists` are mapped
  defensively and may be unreachable on the current project settings.
- **Merging to `master` deploys to production** with no approval step; review all three
  phases before the PR merges.

## Success Criteria (Summary)

- A teacher entering a wrong password, an unconfirmed address, or hitting a rate limit reads
  a Polish sentence that says what happened and what to do next.
- No English string from Supabase can reach the auth screens, and no free text at all can be
  put into `?error=` by anyone.
- `CLAUDE.md` describes the rule that now holds, instead of the exception that no longer does.
