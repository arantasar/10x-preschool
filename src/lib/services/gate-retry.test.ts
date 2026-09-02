import { describe, expect, it, vi } from "vitest";

import { retryGateCall } from "./gate-retry";
import { GenerationError } from "./generation-error";

// Pure retry policy, no network and no astro:env - the live 402 collision
// this exists to fix only shows up under `npm run test:gate`'s real
// concurrency, so this proves the policy without spending anything.

describe("retryGateCall", () => {
  it("retries once on a 402 in-flight-budget collision and returns the retry's result", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new GenerationError("config", "in-flight budget exhausted", { status: 402 }))
      .mockResolvedValueOnce("ok");

    await expect(retryGateCall(call)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("retries once on a transient failure", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new GenerationError("transient", "upstream hiccup", { status: 503 }))
      .mockResolvedValueOnce("ok");

    await expect(retryGateCall(call)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not retry a real config failure that is not 402 (e.g. a bad key)", async () => {
    const call = vi.fn().mockRejectedValue(new GenerationError("config", "invalid key", { status: 401 }));

    await expect(retryGateCall(call)).rejects.toThrow("invalid key");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("propagates the second failure when the retry also fails", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new GenerationError("config", "still exhausted", { status: 402 }))
      .mockRejectedValueOnce(new GenerationError("config", "still exhausted again", { status: 402 }));

    await expect(retryGateCall(call)).rejects.toThrow("still exhausted again");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-GenerationError", async () => {
    const call = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(retryGateCall(call)).rejects.toThrow("boom");
    expect(call).toHaveBeenCalledTimes(1);
  });
});
