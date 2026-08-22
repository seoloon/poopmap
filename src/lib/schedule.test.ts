import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("scheduleRecurring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls fn once per interval, not immediately", async () => {
    const { scheduleRecurring } = await import("./schedule");
    const fn = vi.fn();
    scheduleRecurring(fn, 1000);

    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
