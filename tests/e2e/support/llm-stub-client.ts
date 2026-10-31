import { LLM_STUB_URL } from "./env";

/**
 * Osobny plik, nie `test-data.ts`: warstwa `.db` importuje `test-data.ts` i
 * polega na tym, ze nie ciagnie on `env.ts` (`supabase-local.ts`).
 *
 * Ile razy atrapa dostawcy dostala to haslo. Po hasle, nie w sumie: testy leca
 * rownolegle, wiec licznik calkowity nie dowodzilby niczego.
 */
export async function llmStubCalls(keyword: string): Promise<number> {
  const response = await fetch(`${LLM_STUB_URL}/__calls?haslo=${encodeURIComponent(keyword)}`);
  const { calls } = (await response.json()) as { calls: number };
  return calls;
}
