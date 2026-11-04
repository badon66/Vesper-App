import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_WITHIN_MS, NoAnswerInTime, timed } from "@/lib/answer-within";

// The app's answer limit (2026-11-04): the booking sheet and New lead both
// give a save 25 seconds to answer, then say there was no answer.

describe("the answer limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is 25 seconds, for the sheet and New lead alike", () => {
    expect(ANSWER_WITHIN_MS).toBe(25_000);
  });

  it("passes an answer that comes in time straight through", async () => {
    const answer = timed(new Promise<string>((resolve) => setTimeout(() => resolve("saved"), 24_000)));
    await vi.advanceTimersByTimeAsync(24_000);
    await expect(answer).resolves.toBe("saved");
  });

  it("passes a failure that comes in time straight through, Next.js's redirect included", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/app;307;" });
    const answer = timed(Promise.reject(redirect));
    await expect(answer).rejects.toBe(redirect);
  });

  it("says there was no answer once 25 seconds pass, and a late answer changes nothing", async () => {
    let settle: (value: string) => void = () => {};
    const hung = new Promise<string>((resolve) => {
      settle = resolve;
    });
    const answer = timed(hung);
    const outcome = answer.then(
      () => "answered",
      (error: unknown) => (error instanceof NoAnswerInTime ? "no answer" : "other"),
    );
    await vi.advanceTimersByTimeAsync(ANSWER_WITHIN_MS - 1);
    let early = "pending";
    void outcome.then((value) => {
      early = value;
    });
    await Promise.resolve();
    expect(early).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toBe("no answer");
    settle("saved late");
    await expect(answer).rejects.toBeInstanceOf(NoAnswerInTime);
  });

  it("takes a shorter limit where one is given", async () => {
    const answer = timed(new Promise(() => {}), 10_000);
    const failed = expect(answer).rejects.toBeInstanceOf(NoAnswerInTime);
    await vi.advanceTimersByTimeAsync(10_000);
    await failed;
  });
});
