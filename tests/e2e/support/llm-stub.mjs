import { createServer } from "node:http";

/**
 * Atrapa OpenRoutera dla e2e: prawdziwy serwer HTTP na granicy sieciowej.
 *
 * Wywolanie modelu idzie z workerd, wiec `page.route()` go nie widzi, a latka na
 * `fetch` z procesu testow tam nie siega. `astro.config.e2e.mjs` przepisuje adres
 * dostawcy na ten serwer, a cala reszta - sesja, trasy, kontrakt odpowiedzi, RLS,
 * zapis - zostaje prawdziwa.
 *
 * Bez importow z `src/`: atrapa ma trzymac ksztalt dostawcy, a nie kontrakt
 * aplikacji. Kopia kontraktu przeszlaby kazda jego zmiane, na ktorej test ma pasc.
 *
 * Hasla sa sterowaniem i kluczem licznika: testy leca rownolegle, wiec licznik
 * calkowity nic by nie dowodzil.
 *
 * - haslo z prefiksem `stub-awaria-503` -> 503 z koperta bledu
 * - `GET /__calls?haslo=…` -> `{ calls }`: liczba wywolan z tym haslem
 */
/**
 * @typedef {object} ChatRequest
 * @property {{ role: string, content?: unknown }[]} [messages]
 * @property {{ json_schema?: { name?: string, schema?: { properties: { tematy: { maxItems: number } } } } }} [response_format]
 */

const PORT = 4398;
const FAILURE_PREFIX = "stub-awaria-503";

/** @type {Map<string, number>} */
const calls = new Map();

/** @param {ChatRequest} body */
function keywordOf(body) {
  const user = body.messages?.findLast((message) => message.role === "user");
  const content = typeof user?.content === "string" ? user.content : "";
  return /^Hasło: (.+)$/m.exec(content)?.[1] ?? "";
}

/** @param {string} keyword */
function dayPlan(keyword) {
  return {
    aktywnosci: ["Powitanie", "Zabawa ruchowa", "Praca plastyczna"].map((title) => ({
      tytul: `${title}: ${keyword}`,
      opis: `Zajecia wokol hasla ${keyword}.`,
    })),
  };
}

/**
 * Liczba tematow z `maxItems` zadania: aplikacja zaweza schemat do dni, ktore
 * zostaly do zaplanowania, wiec stala piatka bylaby odpowiedzia spoza kontraktu.
 *
 * @param {string} keyword
 * @param {number} count
 */
function weekOutline(keyword, count) {
  return {
    tematy: Array.from({ length: count }, (_, index) => ({
      dzien: index + 1,
      temat: `${keyword}, ujecie ${String(index + 1)}`,
    })),
  };
}

/**
 * @param {ChatRequest} body
 * @param {string} keyword
 */
function reply(body, keyword) {
  const { name, schema } = body.response_format?.json_schema ?? {};
  switch (name) {
    case "propozycja_dnia":
      return dayPlan(keyword);
    case "szkic_tygodnia":
      return schema ? weekOutline(keyword, schema.properties.tematy.maxItems) : null;
    case "poprawiona_aktywnosc":
      return { tytul: "Poprawiona aktywnosc", opis: "Opis poprawiony przez atrape." };
    default:
      return null;
  }
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {unknown} payload
 */
function send(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/__calls") {
    send(response, 200, { calls: calls.get(url.searchParams.get("haslo") ?? "") ?? 0 });
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
    send(response, 404, { error: { message: "Nieznany adres atrapy.", code: 404 } });
    return;
  }

  let raw = "";
  request.setEncoding("utf8");
  request.on("data", (/** @type {string} */ chunk) => (raw += chunk));
  request.on("end", () => {
    /** @type {unknown} */
    const parsed = JSON.parse(raw);
    const body = /** @type {ChatRequest} */ (parsed);
    const keyword = keywordOf(body);
    calls.set(keyword, (calls.get(keyword) ?? 0) + 1);

    if (keyword.startsWith(FAILURE_PREFIX)) {
      send(response, 503, { error: { message: "Atrapa: dostawca niedostepny.", code: 503 } });
      return;
    }

    const content = reply(body, keyword);
    if (!content) {
      send(response, 400, { error: { message: "Atrapa: nieznany schemat odpowiedzi.", code: 400 } });
      return;
    }

    send(response, 200, {
      model: "stub",
      usage: { cost: 0 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    });
  });
});

server.listen(PORT, "127.0.0.1");
