import { expect, type Page } from "@playwright/test";

/**
 * Czeka, aż wyspy Astro na stronie staną się interaktywne.
 *
 * **Dlaczego to w ogóle istnieje.** `plan.astro` renderuje `DayPlanEditor`
 * serwerowo (`client:load`), więc przyciski „Usuń plan dnia" i „Akceptuj plan"
 * są w DOM-ie — widoczne, klikalne i **bez podpiętych handlerów** — zanim
 * dojedzie i wykona się JavaScript wyspy. Playwright uznaje taki przycisk za
 * gotowy do kliknięcia (jest widoczny i włączony), klika, i nie dzieje się nic:
 * żadnego dialogu, żadnego żądania. Test przechodzi wtedy przez asercje
 * negatywne i pada na pozytywnych — albo, co gorsza, przechodzi.
 *
 * Wyścig jest niewidoczny przy jednym teście na raz i powtarzalny pod
 * obciążeniem równoległym: dokładnie tak został tu znaleziony, gdy zestaw urósł
 * do czterech plików (`day-plan-delete-scope.spec.ts` przechodził w izolacji i
 * padał w pełnym przebiegu, z planem nietkniętym i bez komunikatu błędu).
 *
 * **Dlaczego selektor CSS, skoro `E2E-RULES.md` ich zakazuje.** Reguła zakazuje
 * ich do *lokalizowania elementów*, bo wiąże test ze strukturą DOM zamiast z
 * tym, co widzi użytkownik. Tutaj nie lokalizujemy elementu — czytamy sygnał
 * gotowości samego frameworka. `astro-island` to element własny Astro, a atrybut
 * `ssr` zdejmuje z niego runtime wyspy dokładnie w momencie zakończenia
 * hydracji (`astro-island.prebuilt.js`: `this.removeAttribute("ssr")` tuż przed
 * `dispatchEvent(new CustomEvent("astro:hydrate"))`). To kontrakt frameworka, a
 * nie struktura naszego widoku — i nie ma go czym zastąpić w drzewie
 * dostępności, bo hydracja z definicji niczego w nim nie zmienia.
 *
 * Odstępstwo jest zamknięte w tym jednym helperze, żeby nie rozlało się po
 * plikach testów jako pozwolenie na dowolne `page.locator("div > .cls")`.
 */
export async function waitForIslands(page: Page): Promise<void> {
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}
