import { test, expect } from "@playwright/test";
import { admin } from "./support/supabase-admin";
import { waitForIslands } from "./support/hydration";
import { uniqueStamp } from "./support/test-data";

/**
 * Ryzyko #16 — FR-026 i warunek „prawdziwe wiadomości nie giną” (S-19,
 * `help-and-contact`). Odwiedzający bez konta przechodzi z FAQ do formularza,
 * wysyła wiadomość i ląduje na stronie podziękowania, a wiadomość istnieje w
 * bazie. Ryzyko przecina granice, których nie łączy żadna niższa warstwa:
 * hydrację wyspy z widżetem Turnstile, prawdziwą trasę, prawdziwy PostgREST i
 * RLS tabeli tylko do zapisu.
 *
 * Środowisko: `.dev.vars` ma klucze testowe Turnstile, które zawsze przechodzą
 * (`.env.example`), a `CONTACT_TO` jest pusty — trasa loguje
 * `contact.mail_skipped` i nie wysyła poczty. Zestaw niczego tu nie mockuje.
 *
 * Wiersz sprawdzamy **kluczem serwisowym**, świadomie wbrew E2E-RULES:
 * `contact_messages` jest tylko do zapisu dla każdej roli API, więc żaden klient
 * dostępny aplikacji nie zobaczy go wcale. Ten odczyt mówi „zapis doszedł do
 * bazy”, a nie „drugie konto nie widzi cudzych danych” — tamtej asercji klucz
 * serwisowy by nie udźwignął i tu jej nie ma.
 */

// Odwiedzający bez konta: pusta sesja zamiast domyślnej nauczyciela A.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Ryzyko #16 — wiadomość z formularza kontaktowego nie ginie", () => {
  let stamp = "";

  test.afterEach(async () => {
    // Przed wylosowaniem znacznika nie ma czego sprzątać - a pusty znacznik
    // zamieniłby `like '%%'` w „każdą wiadomość w tabeli”.
    if (!stamp) return;
    const { data, error } = await admin().from("contact_messages").select("id").like("message", `%${stamp}%`);
    if (error) throw new Error(`Odczyt wiadomości do sprzątania nie powiódł się: ${error.message}`);
    // Po id, jak każe E2E-RULES: znacznik służy tylko do znalezienia wierszy.
    const ids = data.map((row) => row.id);
    if (ids.length === 0) return;
    const { error: deleteError } = await admin().from("contact_messages").delete().in("id", ids);
    if (deleteError) throw new Error(`Sprzątanie wiadomości nie powiodło się: ${deleteError.message}`);
    stamp = "";
  });

  test("ryzyko #16: odwiedzający bez konta przechodzi z FAQ przez formularz do podziękowania, a wiadomość jest w bazie", async ({
    page,
  }) => {
    stamp = uniqueStamp();

    await page.goto("/pomoc");
    // Pas na końcu strony, po jego nagłówku - do formularza linkuje też jedna z odpowiedzi.
    await page
      .getByRole("region", { name: "Nie ma tu Twojego pytania?" })
      .getByRole("link", { name: "Formularz kontaktowy" })
      .click();
    await page.waitForURL("**/kontakt");
    await waitForIslands(page);

    await page.getByLabel("Imię").fill("Ola");
    await page.getByLabel("E-mail").fill(`gosc-${stamp}@example.test`);
    await page.getByLabel("Temat").selectOption({ label: "Zgłoszenie błędu" });
    await page.getByLabel("Wiadomość").fill(`Nie drukuje się miesiąc ${stamp}`);

    // Token Turnstile przychodzi asynchronicznie po renderze widżetu; trasa
    // odpowiada wtedy sukcesem dopiero, gdy go dostała - czekamy na tę odpowiedź.
    const answered = page.waitForResponse(
      (response) => response.url().endsWith("/api/contact") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Wyślij wiadomość" }).click();
    expect((await answered).status()).toBe(200);

    await page.waitForURL("**/kontakt/wyslano");
    await expect(page.getByRole("heading", { name: "Dziękujemy!" })).toBeVisible();

    const { data, error } = await admin()
      .from("contact_messages")
      .select("email, topic, user_id")
      .like("message", `%${stamp}%`);
    expect(error).toBeNull();
    expect(data).toEqual([{ email: `gosc-${stamp}@example.test`, topic: "bug", user_id: null }]);
  });
});
