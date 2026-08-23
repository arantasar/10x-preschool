---
bootstrapped_at: 2026-05-27T13:56:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: 10x-preschool
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-preschool
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

10x Preschool is a solo-built, 3-week after-hours web app with auth and an LLM
generation step — the canonical fit for the `(web-app, js)` recommended default.
10x Astro Starter clears all four agent-friendly gates: typed via TypeScript
end-to-end, convention-based via Astro file-based routing, popular in JS training
data, and well-documented. Supabase ships auth and PostgreSQL storage out of the
box, eliminating two integration tasks on a short timeline. AI generation
(FR-006, FR-007) is wired through Astro API routes calling the LLM API directly;
the PRD's 10–30-second generation window approaches Cloudflare's edge wall-time
limit, so streaming the LLM response or offloading to a Supabase edge function is
the recommended mitigation during implementation. CI on GitHub Actions with
auto-deploy-on-merge matches the solo shipping cadence; Cloudflare Pages is the
starter's default deployment target.

## Pre-scaffold verification

| Signal      | Value                                     | Severity | Notes                                          |
| ----------- | ----------------------------------------- | -------- | ---------------------------------------------- |
| npm package | not checked (cmd_template uses git clone) | n/a      | git-clone strategy; no npm create CLI to check |
| GitHub repo | not run                                   | unknown  | `gh` CLI not installed; network check skipped  |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20 (`.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `astro.config.mjs`, `CLAUDE.md.scaffold`, `components.json`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `public/`, `README.md`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (starter's CLAUDE.md sidelined; existing lesson-updated CLAUDE.md preserved)
**.gitignore handling**: moved silently (no .gitignore existed in cwd)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0 direct HIGH/CRITICAL; direct MODERATE: 2 (`@astrojs/check`, `wrangler`)

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** v5.6.3–5.8.0 — GHSA-77vg-94rm-hx3p — "Svelte devalue: DoS via sparse array deserialization"
  - CVSS: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H) — CWE-770
  - Transitive (isDirect: false); no downstream effects listed
  - Fix available: `npm audit fix` should resolve

#### MODERATE findings

1. **@astrojs/check** (isDirect: true) — via `@astrojs/language-server` → `volar-service-yaml` chain; fix: downgrade to `@astrojs/check@0.9.2` (semver major)
2. **wrangler** (isDirect: true) — via `miniflare` → `ws`; fix available
3. **@astrojs/language-server** (transitive) — via `volar-service-yaml`
4. **@cloudflare/vite-plugin** (transitive) — via `miniflare`, `wrangler`, `ws`
5. **miniflare** (transitive) — via `ws`
6. **volar-service-yaml** (transitive) — via `yaml-language-server`
7. **ws** (transitive) — GHSA-58qx-3vcg-4xpx — "Uninitialized memory disclosure", CVSS 4.4
8. **yaml** (transitive) — GHSA-48c2-rrv3-qjmp — "Stack Overflow via deeply nested YAML collections", CVSS 4.3
9. **yaml-language-server** (transitive) — via `yaml`

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | true                 |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` (the starter's CLAUDE.md) and decide which sections to merge into your existing CLAUDE.md.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
