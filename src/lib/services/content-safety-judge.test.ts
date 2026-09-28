import { describe, expect, it } from "vitest";

import { deterministicViolation } from "./content-safety-judge";
import type { JudgeInput } from "./content-safety-judge";

// Deterministic layer only - no `astro:env/server`, no network call, no
// OPENROUTER_API_KEY. `content-safety.gate.test.ts` and
// `content-safety-judge.gate.test.ts` cover the judge itself.

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
