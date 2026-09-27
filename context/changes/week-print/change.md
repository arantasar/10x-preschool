---
change_id: week-print
title: Week print
status: impl_reviewed
created: 2026-09-27
updated: 2026-09-27
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **2026-09-27 — pierwszy ręczny test: PDF nieczytelny.** Tekst renderował się jako przypadkowe glify. Przyczyna: `embedFont(…, { subset: true })` w `@pdf-lib/fontkit` psuje mapowanie glifów Noto Sans. Naprawa w `2fdf381` — fonty osadzane w całości; PDF ma ~490 KB zamiast kilkudziesięciu (plan §Performance Considerations jest w tym punkcie nieaktualny). Żaden test automatyczny tego nie widzi — PDF niesie identyfikatory glifów, nie znaki — złapało to wyłącznie obejrzenie pliku (Manual 2.6).
- **2026-09-27 — wydanie z otwartą weryfikacją ręczną.** Janusz potwierdził, że PDF i przyciski działają („działa pięknie"), i zlecił merge oraz archiwizację. **Nie zostały sprawdzone przed wydaniem:** 1.5, 3.6 (PDF po akceptacji/cofnięciu/usunięciu bez przeładowania), 3.7 (przyciski wyłączone przy niezapisanej partii), 3.8 (wydruk na papierze, także cz-b), 3.9 (throttling i dwuklik), 4.5, 4.6. Świadoma decyzja, nie przeoczenie — patrz `reviews/impl-review.md` F1.
