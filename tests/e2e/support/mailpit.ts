import { expect } from "@playwright/test";
import { e2eEnv } from "./env";

/**
 * Skrzynka lokalnego stacku: Supabase wysyla maile auth do Mailpita
 * (`[inbucket]` w `supabase/config.toml`), a ten wystawia je przez HTTP API.
 *
 * Test resetu hasla czyta stad link, bo to wlasnie szew szablon ↔ trasa jest
 * ryzykiem: link budowany przez szablon (`supabase/templates/recovery.html`)
 * musi trafic w `/auth/confirm` z `token_hash` i `type=recovery`. Podrobienie
 * linku w tescie ominelo by dokladnie to, czego test ma pilnowac.
 */

interface MailpitSearch {
  messages: { ID: string }[];
}

interface MailpitMessage {
  HTML: string;
}

async function searchByRecipient(email: string): Promise<string | null> {
  const query = encodeURIComponent(`to:"${email}"`);
  const response = await fetch(`${e2eEnv.mailpitUrl}/api/v1/search?query=${query}`);
  if (!response.ok) {
    throw new Error(`Mailpit nie odpowiada (${response.status}) - czy lokalny stack Supabase dziala?`);
  }
  const body = (await response.json()) as MailpitSearch;
  return body.messages[0]?.ID ?? null;
}

/**
 * Czeka, az dla adresu przyjdzie wiadomosc, i zwraca pierwszy link z jej HTML,
 * ktory prowadzi do `/auth/confirm`. Czeka na stan (`expect.poll`), nie na czas.
 */
export async function waitForConfirmLink(email: string): Promise<string> {
  let messageId: string | null = null;
  await expect
    .poll(
      async () => {
        messageId = await searchByRecipient(email);
        return messageId;
      },
      { message: `mail do ${email} nie dotarl do Mailpita`, timeout: 15_000 },
    )
    .not.toBeNull();

  const response = await fetch(`${e2eEnv.mailpitUrl}/api/v1/message/${messageId}`);
  if (!response.ok) {
    throw new Error(`Mailpit nie oddal wiadomosci ${messageId} (${response.status})`);
  }
  const message = (await response.json()) as MailpitMessage;
  const href = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(message.HTML)?.[1];
  if (!href) {
    throw new Error(`W mailu do ${email} nie ma linku do /auth/confirm`);
  }
  return href.replaceAll("&amp;", "&");
}
