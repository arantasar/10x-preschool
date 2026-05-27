---
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
---

## Why this stack

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
