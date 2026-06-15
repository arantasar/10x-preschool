# Pierwsze wdrożenie — 10x-preschool → Cloudflare Workers

## Context

The project (`10xPreschool`, Astro 6 SSR + React 19 + Supabase) has its two foundation
contracts in place — `context/foundation/tech-stack.md` and
`context/foundation/infrastructure.md` — and is ready for its **first production deploy**.
`infrastructure.md` recommends **Cloudflare Workers** (Pass on all five agent-friendly
criteria; native `@astrojs/cloudflare` adapter; `wrangler.jsonc` already present). This
plan executes the deploy following that contract and the stack from `tech-stack.md`,
applying the anti-bias mitigations the research surfaced. Each phase is a separate
checkbox so progress is trackable and human gates are explicit.

**Current state (verified):**
- `wrangler` 4.100 authenticated as `janusz.guzowski@gmail.com`, scope `workers (write)` ✓
- `@astrojs/cloudflare` v13.5, adapter wired in `astro.config.mjs`, `output: "server"` ✓
- `wrangler.jsonc` present — worker name still `10x-astro-starter`; **`disable_nodejs_process_v2` flag missing** (compat date `2026-05-08` is past the 2025-09-15 threshold → middleware can break silently)
- No `.dev.vars`, no production secrets set yet
- No git remote (CI/CD auto-deploy is **out of scope** for this deploy)

**Decisions (from user):** rename worker → `10x-preschool`; deploy on **free plan first** to
validate the skeleton, upgrade to Workers Paid before launch; user has **prod Supabase
creds** ready to paste at the secrets step.

**Product confirmation:** This is **Cloudflare Workers** (`wrangler deploy`), NOT Pages —
ignore `deployment_target: cloudflare-pages` in `tech-stack.md` (Risk register, Unknown
unknowns #1). Pages and Workers commands are not interchangeable.

---

## CLI tooling & secrets layout (read this first)

### Required CLI tools

| Tool | Install | Auth / setup | Status now |
|---|---|---|---|
| **Node 22.14.0** | `nvm install` (reads `.nvmrc`) then `nvm use` | — | check `node -v` |
| **wrangler** 4.x | already a devDep (`^4.100.0`) — run via `npx wrangler …` | `npx wrangler login` (opens browser, stores OAuth token in `~/.config/.wrangler/`) | ✅ logged in as `janusz.guzowski@gmail.com`, `workers (write)` |
| **Supabase CLI** (optional) | `npx supabase …` (no global install) | `npx supabase login` only if managing the remote project / migrations | not needed for this deploy |

No global installs required — everything runs through `npx`, pinned by `package.json`.
Verify auth with `npx wrangler whoami` before deploying.

### Where secrets live (one value, the right file)

`SUPABASE_URL` / `SUPABASE_KEY` are needed in **three independent places** — they do **not**
share a store. Set them where the runtime that needs them looks:

| Environment | Store | How to set | Committed? |
|---|---|---|---|
| Local Node dev (`astro dev` / `npm run dev`) | **`.env`** at repo root | copy `.env.example` → `.env`, fill values | ❌ gitignored |
| Local Cloudflare runtime (`wrangler dev`, workerd) | **`.dev.vars`** at repo root | create it (same `KEY=value` format); easy to forget — `wrangler dev` ignores `.env` | ❌ gitignored |
| **Production** (Cloudflare Workers) | **Workers Secrets** (encrypted, on Cloudflare — not a file) | `npx wrangler secret put SUPABASE_URL` (Phase 5) | n/a — write-only, never read back |
| CI build (GitHub Actions) | **GitHub repo secrets** | repo Settings → Secrets → Actions (out of scope — no git remote yet) | n/a |

Rules:
- **Never commit a real secret.** `.env.example` holds placeholders (`###`) only; `.env` and `.dev.vars` are gitignored.
- Production values are **not** read from any file at runtime — they come from Workers Secrets set via `wrangler secret put`. A `.dev.vars` file is for `wrangler dev` only and is never uploaded.
- To rotate: re-run `wrangler secret put KEY` (overwrites, zero downtime) and update `.env`/`.dev.vars` locally.

---

## Phases

- [x] **Phase 1 — Pre-flight checks (read-only)**
  - Confirm `npx wrangler whoami` shows the account with `workers (write)` (already verified).
  - Confirm Node matches `.nvmrc` (22.14.0): `node -v`.
  - Confirm this is Workers, not Pages: `wrangler.jsonc` has `main` + `assets`, deploy via `wrangler deploy`.
  - Confirm the worker name is free / not already taken: `npx wrangler deployments list --name 10x-preschool` (expect "not found" on first deploy).

- [x] **Phase 2 — Patch `wrangler.jsonc`** (config edit, agent-owned)
  - Rename worker: `"name": "10x-astro-starter"` → `"name": "10x-preschool"`.
  - Add the required compat flag (Risk register, Devil's advocate #2):
    `"compatibility_flags": ["nodejs_compat", "disable_nodejs_process_v2"]`.
  - Leave `compatibility_date`, `assets`, and `observability` unchanged.
  - File: `wrangler.jsonc`.

- [x] **Phase 3 — Production build**
  - `npm run build` (Astro SSR build via `@astrojs/cloudflare`; emits `./dist` + worker entry).
  - Stop and fix if the build errors before touching the platform.

- [x] **Phase 4 — First deploy (free plan, creates the worker)**
  - `npx wrangler deploy`.
  - Captures the deploy URL: `https://10x-preschool.<account-subdomain>.workers.dev`.
  - On free plan the skeleton (static pages, routing) deploys fine; auth/LLM are validated in later phases / after upgrade.

- [x] **Phase 5 — Set production secrets** (needs user-provided values)
  - `npx wrangler secret put SUPABASE_URL` → paste prod value.
  - `npx wrangler secret put SUPABASE_KEY` → paste prod value.
  - Names must match `astro.config.mjs` env schema exactly (`SUPABASE_URL`, `SUPABASE_KEY`).
  - Secrets are write-only (cannot be read back). Each `secret put` rolls a new version, so production picks them up automatically.

- [x] **Phase 6 — Verify the deploy**
  - Stream logs: `npx wrangler tail --format json` (filter `--status error` if needed).
  - Smoke-test in a browser against the `.workers.dev` URL: load home/dashboard, run the **auth flow** (signup/signin → cookie session → protected `/dashboard` redirect behavior from `src/middleware.ts`).
  - Auth should now work end-to-end (secrets set in Phase 5).
  - Note: LLM generation routes will **fail on the free plan** (10ms CPU limit) — this is expected and gated behind the Workers Paid upgrade.

- [x] **Phase 7 — Record artifact + manual gates (human-only)**
  - Write the approved deploy record to `context/deployment/deploy-plan.md` (downstream audit trail per CLAUDE.md: worker name, URL, secrets wired, flags set, what's still pending).
  - **Manual gates the user owns before launch** (none blocking this skeleton deploy):
    - Upgrade to **Workers Paid** ($5/mo) in `dash.cloudflare.com` → required before LLM routes work.
    - When a **custom domain** is later connected: **disable Cloudflare Auto Minify** (breaks React island hydration — Risk register, Devil's advocate #4).
    - Implement **streaming for LLM routes** before launch (30s CPU ceiling on Paid — Risk register, Devil's advocate #3). Implementation task, not part of this deploy.

---

## Files touched
- `wrangler.jsonc` — worker rename + `disable_nodejs_process_v2` flag (Phase 2).
- `context/deployment/deploy-plan.md` — **new**, deploy audit record (Phase 7).
- No application source changes; no `package.json` script added (deploy via `npx wrangler deploy` directly).

## Out of scope (per infrastructure.md)
- CI/CD wiring (no git remote; `.github/workflows/ci.yml` exists but is not activated here).
- Custom domain / DNS, Workers Paid upgrade execution (manual, user-owned).
- KV/R2/D1 bindings, Cloudflare Images binding, multi-region/HA.

## Verification (end-to-end)
1. `npm run build` succeeds locally.
2. `npx wrangler deploy` returns a live `*.workers.dev` URL with no errors.
3. `npx wrangler secret list --name 10x-preschool` shows `SUPABASE_URL` + `SUPABASE_KEY`.
4. Browser: home + dashboard load; signup/signin completes; protected route redirect works.
5. `npx wrangler tail` shows the request logs with no 500s on the auth path.

---

## Deploy Record (executed 2026-06-15)

**Status: LIVE** — first production deploy succeeded.

| Field | Value |
|---|---|
| Worker name | `10x-preschool` |
| Live URL | https://10x-preschool.janusz-guzowski.workers.dev |
| Account | `janusz.guzowski@gmail.com` (`a71891d6878a4caf4b3da558b77c5442`) |
| workers.dev subdomain | `janusz-guzowski` (pre-existing, account-wide) |
| Version ID | `f41d54fd-c7aa-47b5-bfbc-705aff5e6d9a` (superseded by secret-put versions) |
| Plan tier | Free (Workers Paid upgrade still pending — see manual gates) |
| Node used | 22.14.0 (per `.nvmrc`) |
| wrangler | 4.100.0 |

**Bindings wired:** `SESSION` (KV namespace `b85f34f00ac9467884163d3b58cd20ad`, title `10x-preschool-session`), `IMAGES` (Cloudflare Images), `ASSETS`.

**Production secrets set** (Workers Secrets, write-only): `SUPABASE_URL`, `SUPABASE_KEY` — verified present via `wrangler secret list`.

**Verification results:** `/` → 200, `/auth/signin` → 200, `/dashboard` → 302 → `/auth/signin` (middleware protection working, Supabase client initializes cleanly — no 500s).

**Config changes committed to `wrangler.jsonc`:**
- `name`: `10x-astro-starter` → `10x-preschool`
- `compatibility_flags`: added `disable_nodejs_process_v2`
- `kv_namespaces`: added explicit `SESSION` binding with id (see deviation #2)

### Deviations from the plan (for the audit trail)
1. **Node 22.14.0 was not installed** — pre-flight found Node 24.16.0 active. Ran `nvm install` to add 22.14.0 and built/deployed under it.
2. **SESSION KV namespace collision.** The `@astrojs/cloudflare` adapter auto-enables a `SESSION` KV binding and emits it (id-less) into `dist/server/wrangler.json`, triggering wrangler auto-provisioning. The first (email-blocked) attempt already created the namespace, so retries failed with `code: 10014` (already exists). Fix: added an explicit `kv_namespaces` SESSION binding **with the existing id** to root `wrangler.jsonc`, rebuilt so the adapter merged the id through, then deploy bound the existing namespace. (Plan's "no KV bindings in scope" was superseded by adapter behavior.)
3. **Manual gate — email verification** (`code: 10034`) blocked the first deploy; cleared by the user, then deploy proceeded.
4. **workers.dev subdomain** was already registered (`janusz-guzowski`), so no new registration was needed despite the non-interactive prompt error on one attempt.

### Manual gates still pending (user-owned, NOT done in this deploy)
- [ ] **Upgrade to Workers Paid** ($5/mo) at `dash.cloudflare.com` — required before LLM generation routes work (free plan 10ms CPU limit).
- [ ] **Disable Cloudflare Auto Minify** when a custom domain is later connected (breaks React island hydration).
- [ ] **Implement streaming for LLM routes** before launch (30s CPU ceiling on Paid) — implementation task, not a deploy step.
- [ ] **Browser end-to-end auth test** (signup → cookie session → `/dashboard`) — agent confirmed the redirect/health automatically; a real signup is left to the user.
