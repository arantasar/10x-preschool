# Review follow-ups — week-print

From `reviews/impl-review.md` (2026-09-27). Before merging to `master` (= production deploy).

- [ ] **F1** (accepted without full verification on 2026-09-27 — see change.md) — Run Manual 3.5–3.9 (at minimum 3.6: PDF reflects accept/undo/delete without a reload; 3.7: buttons disabled while a batch is held), plus 1.5, 2.6, 4.5, 4.6. Record the paper print (printer, week-per-page font size) in `change.md` → Notes. Tick the Progress items in `plan.md`.
- [x] **F2** — After F1: `roadmap.md:64` S-13 → `done`; Open Roadmap Questions #1 (`:180`, `:210`) and `prd-v2.md:375` §Open Questions #1 marked resolved ("both — toggle", 2026-09-27).
- [x] **Found in manual testing (after the review)** — PDF text was garbled: `embedFont(…, { subset: true })` in @pdf-lib/fontkit breaks the Noto Sans glyph mapping. Fixed: fonts embedded whole (`render.ts`). Side effect: a PDF is ~490 KB instead of tens of KB — the plan's §Performance ("`subset: true` keeps it in tens of KB") is out of date. No automated test sees this (glyph ids, not text); Manual 2.6 ("look at the file from the test") is exactly the check that would have caught it. Option for later: pre-subset the TTFs to Latin + Latin Ext-A (smaller download and PDF).
- [x] **Hover on the PDF buttons** — dark text on hover (shadcn `outline` variant) and no pointer cursor: fixed (sibling pattern + `cursor-pointer`). The other island buttons also have no `cursor-pointer` — outside this slice.
- [ ] **F9 (rest)** — keep-with-next for the activity title (`layout.ts` `flowSegments`): decide after the paper print whether a title orphaned at the bottom of a page is a real problem.
