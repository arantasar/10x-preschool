# Review fixes — month-print (impl-review 2026-09-27)

Code and plan fixes F1–F6 are applied in the working tree; they are not committed yet.

Still to do before the merge (F7):

- [ ] Restart the dev server (the one on :4321 was started before the branch's commits) and re-run `npx playwright test tests/e2e/month-print.spec.ts tests/e2e/week-print.spec.ts`. After F1 the "tygodniami" page count comes from `weeksWithWorkingDays`.
- [ ] 4.7: download both month PDFs and look at them. Include a month that starts on a weekend (e.g. August 2026 or March 2026): no blank first page, no blank grid row, first heading "3 – 7 sierpnia 2026".
- [ ] 4.8: print both layouts on paper, including black and white. Record the result in change.md.
- [ ] 1.9 / 4.12: week print unchanged.
- [ ] Only after that: S-14 → done in roadmap.md, PRD §Open Questions #8.
