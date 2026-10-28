import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { throttle } from "../src/store/throttle";

describe("throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls at once, then at most once per interval with the latest arguments", () => {
    const calls: number[] = [];
    const t = throttle((x: number) => calls.push(x), 16);
    t(1);
    expect(calls).toEqual([1]);
    t(2);
    t(3);
    expect(calls).toEqual([1]);
    vi.advanceTimersByTime(16);
    expect(calls).toEqual([1, 3]);
    vi.advanceTimersByTime(100);
    expect(calls).toEqual([1, 3]);
    t(4);
    expect(calls).toEqual([1, 3, 4]);
  });

  it("keeps firing during a continuous drag instead of freezing", () => {
    const calls: number[] = [];
    const t = throttle((x: number) => calls.push(x), 16);
    for (let i = 0; i < 20; i++) {
      t(i);
      vi.advanceTimersByTime(5);
    }
    expect(calls.length).toBeGreaterThanOrEqual(6);
  });

  it("drops the trailing call after cancel", () => {
    const calls: number[] = [];
    const t = throttle((x: number) => calls.push(x), 16);
    t(1);
    t(2);
    t.cancel();
    vi.advanceTimersByTime(50);
    expect(calls).toEqual([1]);
  });
});
