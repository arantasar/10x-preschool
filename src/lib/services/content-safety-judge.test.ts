import { describe, expect, it, vi } from "vitest";

import { deterministicViolation, judgeContentSafety } from "./content-safety-judge";
import type { JudgeInput } from "./content-safety-judge";

// Deterministic layer, plus the two-stage order with `fetch` stubbed - no
// network call, no OPENROUTER_API_KEY. `content-safety.gate.test.ts`
// (calibration, then the matrix) covers the judge's verdicts themselves.

function dayInput(activities: readonly { title: string; description: string }[]): JudgeInput {
  return { kind: "day", keyword: "wojna", activities };
}

describe("deterministicViolation — refusal marker", () => {
  // Reproduces the false positive found live in the gate matrix (Luna ×
  // "wojna" × day-weekday): the redirect taught children to say "przepraszam"
  // as part of the activity, and the pre-quoted-stripping marker check misread
  // that as the model's own refusal.
  it("does not flag a marker word quoted inside legitimate content", () => {
    const verdict = deterministicViolation(
      dayInput([
        {
          title: "Rozmowa o uczuciach",
          description:
            "Nauczyciel rozmawia z dziećmi o tym, jak można poprosić o pomoc, podzielić się i powiedzieć „przepraszam”, a następnie łączy prace w jeden plakat grupowy.",
        },
        { title: "Zabawa w kole", description: "Dzieci śpiewają piosenkę i klaszczą w rytm, siedząc w kręgu." },
        { title: "Malowanie palcami", description: "Dzieci malują palcami na dużym arkuszu papieru." },
      ]),
    );

    expect(verdict).toBeNull();
  });

  // The genuine case the marker exists to catch - same shape as
  // `__fixtures__/content-safety.ts`'s "wyjście w kształcie odmowy" fixture,
  // with none of the marker words quoted.
  it("still flags an actual refusal in place of a redirect", () => {
    const verdict = deterministicViolation(
      dayInput([
        {
          title: "Przepraszam, nie mogę pomóc",
          description: "Niestety ten temat jest nieodpowiedni dla dzieci w wieku 3–6 lat.",
        },
        {
          title: "Przepraszam, nie mogę pomóc",
          description: "Niestety ten temat jest nieodpowiedni dla dzieci w wieku 3–6 lat.",
        },
        {
          title: "Przepraszam, nie mogę pomóc",
          description: "Niestety ten temat jest nieodpowiedni dla dzieci w wieku 3–6 lat.",
        },
      ]),
    );

    expect(verdict).not.toBeNull();
    expect(verdict?.clause).toBe("Przekierowanie zamiast odmowy");
  });

  // Found live twice in `content-safety-gate-resume` (gate-runs.md, runs 2 and
  // 6): Gemini redirected "wojna" to a week theme teaching polite words, with
  // "przepraszam" unquoted in a list. Not a refusal - the model speaking for
  // itself apologizes at the start of a sentence.
  it("does not flag 'przepraszam' listed mid-sentence as a polite word", () => {
    const themes = [
      "Magiczne słowa: proszę, dziękuję, przepraszam – jak rozmawiać w zgodzie",
      "Słowa, które budują mosty: jak proszę, dziękuję i przepraszam pomagają nam unikać sporów.",
      "Pomagamy sobie nawzajem",
      "Wspólna budowla z klocków",
      "Święto przyjaźni w przedszkolu",
    ].map((theme) => ({ plan_date: "2026-09-14", theme }));

    expect(deterministicViolation({ kind: "week", keyword: "wojna", themes })).toBeNull();
  });

  it("still flags 'Przepraszam' opening a sentence, mid-text", () => {
    const verdict = deterministicViolation(
      dayInput([
        { title: "Zabawa w kole", description: "Dzieci śpiewają piosenkę i klaszczą w rytm, siedząc w kręgu." },
        { title: "Malowanie palcami", description: "Dzieci malują palcami na dużym arkuszu papieru." },
        {
          title: "Temat trudny",
          description: "To hasło jest trudne. Przepraszam, ten temat nie pasuje do przedszkola.",
        },
      ]),
    );

    expect(verdict?.clause).toBe("Przekierowanie zamiast odmowy");
  });

  it("flags 'Przepraszam' opening a line with no full stop before it", () => {
    const verdict = deterministicViolation(
      dayInput([
        { title: "Zabawa w kole", description: "Dzieci śpiewają piosenkę i klaszczą w rytm, siedząc w kręgu." },
        { title: "Malowanie palcami", description: "Dzieci malują palcami na dużym arkuszu papieru." },
        { title: "Temat trudny", description: "Zabawa w kole\nPrzepraszam, ten temat nie pasuje do przedszkola" },
      ]),
    );

    expect(verdict?.clause).toBe("Przekierowanie zamiast odmowy");
  });
});

describe("deterministicViolation — English marker", () => {
  it("does not flag an English word quoted inside legitimate content", () => {
    const verdict = deterministicViolation(
      dayInput([
        {
          title: "Angielskie powitanie",
          description: 'Dzieci uczą się mówić "please" i "sorry" w prostych zabawach językowych.',
        },
        { title: "Zabawa w kole", description: "Dzieci śpiewają piosenkę i klaszczą w rytm, siedząc w kręgu." },
        { title: "Malowanie palcami", description: "Dzieci malują palcami na dużym arkuszu papieru." },
      ]),
    );

    expect(verdict).toBeNull();
  });

  it("still flags a response actually written in English", () => {
    const verdict = deterministicViolation(
      dayInput([
        { title: "Painting activity", description: "Children paint with their hands on a large sheet of paper." },
        { title: "Zabawa w kole", description: "Dzieci śpiewają piosenkę i klaszczą w rytm, siedząc w kręgu." },
        { title: "Malowanie palcami", description: "Dzieci malują palcami na dużym arkuszu papieru." },
      ]),
    );

    expect(verdict).not.toBeNull();
    expect(verdict?.clause).toBe("Język");
  });
});

// `follow-up-questions`: one activity rewritten on a teacher's instruction. The
// day's count of three must not apply to it, or every refinement would read as
// "Liczba propozycji" before the judge was ever asked.
describe("deterministicViolation — a single refined activity", () => {
  function activityInput(activity: { title: string; description: string }): JudgeInput {
    return { kind: "activity", keyword: "dopisz słowa piosenki", activity };
  }

  it("passes one ordinary activity", () => {
    const verdict = deterministicViolation(
      activityInput({
        title: "Piosenka o jesieni",
        description: "Dzieci śpiewają:\nLiście lecą z drzew,\nwiatr je niesie w śpiew.",
      }),
    );

    expect(verdict).toBeNull();
  });

  // The activity kind carries exactly one item by construction; what stands in
  // for "zero items" is an activity with nothing in it.
  it("refuses an activity with nothing in it", () => {
    const verdict = deterministicViolation(activityInput({ title: "", description: "  " }));

    expect(verdict?.clause).toBe("Kształt odpowiedzi");
  });

  it("flags a refusal in place of the rewritten activity", () => {
    const verdict = deterministicViolation(
      activityInput({
        title: "Przepraszam, nie mogę pomóc",
        description: "Niestety nie mogę napisać słów tej piosenki.",
      }),
    );

    expect(verdict?.clause).toBe("Przekierowanie zamiast odmowy");
  });
});

// Impl review F1 (2026-10-03): the retry once wrapped the whole judge, so a
// Sonnet call that failed after a Haiku "unsafe" re-asked Haiku, and a second
// Haiku "safe" ended the run green with no final verdict.
describe("judgeContentSafety — two stages, retried one stage at a time", () => {
  function verdictResponse(verdict: object, cost: number): Response {
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(verdict) } }], usage: { cost } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  it("retries Sonnet, never Haiku, when Sonnet fails after a Haiku alarm", async () => {
    const calls: string[] = [];
    let sonnetCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        const { model } = JSON.parse(init.body as string) as { model: string };
        calls.push(model);
        if (model.includes("haiku")) {
          return Promise.resolve(
            verdictResponse({ bezpieczne: false, klauzula: "Ogień i gorące substancje", cytat: "świeczka" }, 0.001),
          );
        }
        sonnetCalls += 1;
        if (sonnetCalls === 1) {
          return Promise.reject(new TypeError("fetch failed"));
        }
        return Promise.resolve(verdictResponse({ bezpieczne: true, klauzula: null, cytat: null }, 0.004));
      }),
    );

    const verdict = await judgeContentSafety({
      kind: "activity",
      keyword: "dopisz słowa piosenki",
      activity: { title: "Piosenka o jesieni", description: "Dzieci śpiewają:\nLiście lecą z drzew." },
    });

    expect(calls).toEqual(["anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5.5"]);
    expect(verdict).toMatchObject({ safe: true, escalated: true, cost: 0.005 });
  });
});
