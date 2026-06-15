---
project: 10xPreschool
researched_at: 2026-05-31
recommended_platform: Cloudflare Workers
runner_up: Fly.io
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 SSR
  runtime: Cloudflare Workers (workerd)
  database: Supabase (external, PostgreSQL)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already ships `@astrojs/cloudflare` adapter and a `wrangler.jsonc` — zero adapter migration cost. Cloudflare is the only candidate to score Pass on all five agent-friendly criteria: CLI-first ops via wrangler, fully managed edge runtime, docs published as `llms.txt` + markdown, deterministic one-command deploy, and a GA MCP server suite. At $5/month (Workers Paid, required for LLM routes — see Risk 1), it is the lowest-cost path. The three interview constraints — minimize cost, no familiarity advantage elsewhere, single region (EU) — all point the same direction.

## Platform Comparison

### Scoring Matrix

| Platform | CLI-first | Managed | Agent Docs | Stable API | MCP | Notes |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | **Pass** | **Pass** | **Pass** | **Pass** | **Pass** | Native adapter; llms.txt GA; wrangler GA; MCP GA |
| Vercel | Pass | Pass | Pass | Pass | Partial | MCP in Public Beta; Pro $20/mo required for commercial use |
| Netlify | Partial | Pass | Pass | Pass | Pass | 10s function timeout blocks LLM calls; Astro 6 adapter unconfirmed |
| Fly.io | Pass | Pass | Partial | Pass | Partial | No llms.txt; flymcp in active dev (no GA); $4-8/mo |
| Render | Partial | Pass | Fail | Pass | Pass | Docs not on GitHub/markdown; rollback dashboard-only; $7/mo+ |
| Railway | Partial | Pass | Fail | Partial | Partial | No markdown docs; no CLI rollback; streaming proxy buffering bug; MCP "work in progress" |

**Hard filters applied**: none triggered (Q1 = "Don't know" on persistent connections; all platforms support Astro 6).

**Soft-weight adjustments**:
- Cost (minimize) → Vercel penalized ($20/mo Pro); Netlify credit exhaustion risk at LLM scale
- No familiarity advantage → no tie-breaking applied
- Single region → edge-native advantage neutral; EU region available on all shortlisted platforms
- External providers fine → no co-location penalty applied

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Native fit for the existing stack: `@astrojs/cloudflare` v13+ is the installed adapter, `wrangler.jsonc` is already present, and `astro dev` uses the real workerd runtime for production parity. Five-of-five criteria pass. Workers Paid at $5/month is the lowest absolute cost among viable options. `wrangler tail`, `wrangler rollback`, and `wrangler versions list` give the agent a full operational loop. The `llms.txt` + `llms-full.txt` endpoints and per-page Markdown delivery make the docs natively agent-readable. The GA Cloudflare MCP suite (mcp.cloudflare.com) and documented Claude Code integration are a differentiating signal. ReadableStream/SSE streaming is GA with no extra flags. The one required action before any deploy: upgrade from the free plan to Workers Paid.

#### 2. Fly.io

Strong second for teams that prefer persistent containers over edge functions. `fly deploy` is deterministic, `flyctl` covers the full operational loop, and Amsterdam (`ams`) gives EU proximity. No serverless timeout — the 60s proxy inactivity timeout is configurable to 600s via `fly.toml`, and streaming keeps the connection alive anyway. Cost is $4-8/month with autostop enabled. Gap vs. Cloudflare: requires switching from `@astrojs/cloudflare` to `@astrojs/node` adapter (migration cost), no `llms.txt` (docs are GitHub markdown only), and the flymcp MCP server has no GA designation.

#### 3. Render

Simple Node.js PaaS with a 100-minute request timeout ceiling (irrelevant in practice, but no timeout anxiety), official GA MCP server with 20+ tools, and EU Frankfurt region. `render cli deploys create` + deploy hooks cover CI. Gap vs. Cloudflare: requires adapter migration to `@astrojs/node`, docs are web-only (no markdown/GitHub, no llms.txt), CLI rollback is absent (dashboard only), and the $7/month Starter paid tier is required to avoid the free tier's 60-second cold start penalty.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Free tier CPU limit is a silent deploy-time trap**: the Workers free plan's 10ms CPU limit will terminate every LLM API route call before a response is returned. The app deploys and previews fine; the failure only appears at runtime. Workers Paid ($5/month) is a hard prerequisite, not an optional upgrade.

2. **`disable_nodejs_process_v2` compatibility flag is required but absent from the starter**: with `compatibility_date >= 2025-09-15` (needed for current security patches), Astro middleware breaks silently in production. Local `wrangler dev` uses a pinned workerd version that may not reproduce the bug. This flag must be added to `wrangler.jsonc` before the first deploy with a 2025+ compatibility date.

3. **30-second CPU ceiling on Workers Paid bites long LLM calls**: a non-streaming LLM response that hits 30 seconds of CPU time will be terminated. The tech-stack hand-off already flags "the 10–30-second generation window approaches Cloudflare's edge wall-time limit." Streaming LLM responses is the mitigation and must be implemented intentionally — it is not the starter's default for API routes.

4. **Cloudflare Auto Minify silently breaks React island hydration**: enabling Auto Minify in the Cloudflare dashboard (a common "optimize" action when connecting a custom domain) causes client-side hydration mismatches. The calendar and plan editor would render visually but lose all interactivity. Must be disabled in the Cloudflare dashboard.

5. **Workers vs Pages product confusion**: `tech-stack.md` records `deployment_target: cloudflare-pages` but the starter ships `wrangler.jsonc` configured for Cloudflare Workers (`wrangler deploy`). These are distinct Cloudflare products with different commands, static asset binding patterns, and free tier rules. Confirm which product is in use before the first deploy; mixing up the deploy command wastes hours.

### Pre-Mortem — How This Could Fail

The 10xPreschool app was deployed to Cloudflare Workers and worked perfectly during the developer's evening testing sessions. On launch day, the first teachers tried the AI generation feature — every call returned a 500. The developer hadn't upgraded from the Workers free plan; the 10ms CPU limit was killing the LLM route at runtime. After upgrading to Workers Paid, generation worked — but occasionally hung on a blank screen when the LLM took over 30 seconds, hitting the CPU ceiling. The developer adds streaming to fix this. Two months later, they update `compatibility_date` in wrangler.jsonc to get a critical security patch. Teachers can no longer log in — Astro middleware broke silently because `disable_nodejs_process_v2` was never added to the compatibility flags. The bug doesn't reproduce locally. Three evenings of debugging follow. Meanwhile, subtle React hydration failures appear in the calendar component — the developer had enabled Cloudflare Auto Minify when setting up the custom domain, not knowing it breaks client-side island hydration.

### Unknown Unknowns

1. **Workers vs Pages is a project-level ambiguity to resolve on day one**: `tech-stack.md` says `deployment_target: cloudflare-pages` but the starter deploys via `wrangler deploy` (Workers). Confirm which product before any deploy — the commands, static asset binding patterns, and free tier rules differ between the two.

2. **Wrangler local dev is close but not identical to production**: `wrangler dev` runs against the workerd version bundled with wrangler, not against live Cloudflare infrastructure. Compatibility flag bugs only surface post-deploy. Treat local workerd as "high-fidelity staging" not "production parity."

3. **The `ASSETS` binding name is reserved in Pages projects**: any KV or R2 binding named `ASSETS` silently collides with Pages' built-in static asset binding. Rename before any potential Pages migration.

4. **Cloudflare Images binding is now the default imageService in recent adapter versions**: adding an Astro `<Image>` component without configuring the Images binding in `wrangler.jsonc` causes a production 500. The starter doesn't pre-configure this binding; the failure only appears when images are first introduced.

## Operational Story

- **Preview deploys**: `wrangler versions upload` creates a non-prod version; `wrangler versions deploy` promotes it. Workers Builds (GitHub integration) auto-creates preview deployments on every push — each branch gets a unique `*.workers.dev` URL. Protect preview URLs with Cloudflare Access (Zero Trust) if the app handles real user data during testing; unauthenticated preview URLs are public by default.

- **Secrets**: environment variables live in two places — `.dev.vars` for local `wrangler dev` (gitignored, already in the starter), and Workers Secrets for production (`wrangler secret put SUPABASE_URL`, `wrangler secret put SUPABASE_KEY`). Secrets are write-only via wrangler; they cannot be read back after setting, only deleted. Rotation: `wrangler secret put KEY` overwrites the existing value with zero downtime.

- **Rollback**: `wrangler rollback` reverts to the previous deployed version. `wrangler rollback <VERSION_ID>` targets a specific version from `wrangler versions list`. Typical time-to-revert: under 30 seconds. Supabase database migrations do not roll back automatically — a code rollback with an incompatible schema migration requires a manual SQL undo.

- **Approval**: the agent may perform `wrangler deploy`, `wrangler secret put`, `wrangler tail`, `wrangler versions list`, and `wrangler rollback` unattended. Human approval is required for: upgrading the Workers billing plan, configuring a custom domain (requires DNS changes), enabling/disabling Cloudflare dashboard settings (Auto Minify, WAF rules), and any destructive Supabase migrations.

- **Logs**: `wrangler tail` streams live request logs to stdout; filter by `--status error`, `--search "term"`, or `--format json` for structured output. Build logs are in the Cloudflare dashboard → Workers & Pages → your worker → Deployments, or via Workers Builds if git integration is enabled.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free tier CPU limit (10ms) terminates LLM routes silently | Research finding | High (likely to be hit on first real deploy) | High (core feature broken) | Upgrade to Workers Paid ($5/mo) before any non-dev deploy |
| `disable_nodejs_process_v2` flag missing breaks middleware | Devil's advocate | Medium (triggered on compatibility date update) | High (auth/login broken) | Add `"disable_nodejs_process_v2"` to `compatibility_flags` in `wrangler.jsonc` now |
| 30s CPU ceiling terminates non-streaming LLM responses | Devil's advocate | Medium (depends on LLM latency) | High (generation fails silently) | Implement streaming for all LLM API routes before launch |
| Auto Minify breaks React island hydration | Devil's advocate | Medium (easy to accidentally enable) | Medium (interactive UI broken) | Disable Auto Minify in Cloudflare dashboard immediately after connecting domain |
| Workers vs Pages confusion wastes deploy effort | Unknown unknowns | Low-Medium (one-time, front-loaded) | Medium (hours of debugging) | Confirm `wrangler deploy` (Workers) is the correct command; ignore `deployment_target: cloudflare-pages` in tech-stack.md |
| Wrangler local dev masks production compatibility bugs | Unknown unknowns | Low | Medium (hard to diagnose) | Always smoke-test auth flows and LLM routes against a real staging Workers deployment |
| Cloudflare Images binding missing when `<Image>` added | Unknown unknowns | Low (only triggered when images introduced) | Low-Medium (500 on image routes) | Pre-configure Images binding in wrangler.jsonc before adding any `<Image>` component |

## Getting Started

1. **Upgrade to Workers Paid** (required before any real deploy): visit dash.cloudflare.com → Workers & Pages → Plans → upgrade to Workers Paid ($5/month). Without this, every LLM route returns a CPU exceeded error.

2. **Add the compatibility flag workaround** to `wrangler.jsonc`:
   ```jsonc
   "compatibility_flags": ["nodejs_compat", "disable_nodejs_process_v2"]
   ```
   This prevents Astro middleware from breaking on 2025+ compatibility dates.

3. **Set production secrets** via wrangler:
   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```

4. **Deploy**:
   ```bash
   npm run build
   npx wrangler deploy
   ```
   The `wrangler.jsonc` in the starter already has the correct worker name and entry point. The deploy URL will be `https://<worker-name>.<account-subdomain>.workers.dev`.

5. **Verify the deploy** by tailing logs and triggering a test generation:
   ```bash
   npx wrangler tail --format json
   ```
   Confirm the LLM API route completes without a CPU exceeded error and that auth cookie flow works end-to-end.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions wiring for auto-deploy on merge)
- Production-scale architecture (multi-region, HA, DR)
- Cloudflare KV / R2 / D1 binding configuration for future features
