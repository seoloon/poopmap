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

describe("scheduleRecurringWithStartup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs fn once after the startup delay, then recurs on the interval", async () => {
    const { scheduleRecurringWithStartup } = await import("./schedule");
    const fn = vi.fn();
    scheduleRecurringWithStartup(fn, 1000, 100);

    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
    // Still no recurring fire yet — that's scheduled independently from now.
    await vi.advanceTimersByTimeAsync(899);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("swallows a startup-run rejection without throwing", async () => {
    const { scheduleRecurringWithStartup } = await import("./schedule");
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    scheduleRecurringWithStartup(fn, 1000, 100);

    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
