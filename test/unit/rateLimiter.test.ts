/**
 * RateLimiter: one request at a time, spaced out.
 *
 * The two properties that matter are that the spacing is per request rather
 * than per task, so a task that retries owes the site a gap for each attempt
 * and for the next task's first attempt, and that the spacing widens under
 * push-back and narrows again only after a run of quiet successes.
 *
 * The clock is faked here, so every gap below is the exact number of
 * milliseconds the limiter waited rather than an approximation of it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter, sleep } from "../../src/ia/rateLimiter.js";
import { settlesAt } from "./helpers.js";

const INTERVAL = 40;
/**
 * More clock room than any waiting here is meant to take.
 *
 * Advancing past the expected wait is what makes the readings below sharp: a
 * limiter that returned early would settle at an earlier reading and fail,
 * instead of being carried to the right answer by an advance that stops exactly
 * where the assertion expects.
 */
const AMPLE_MS = INTERVAL * 100;

const gaps = (marks: number[]) => marks.slice(1).map((mark, i) => mark - marks[i]!);

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2024-01-01T00:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RateLimiter, spacing", () => {
  it("lets the first request go without waiting", async () => {
    const limiter = new RateLimiter({ intervalMs: 1000 });
    const started = Date.now();
    const at = settlesAt(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(AMPLE_MS);
    expect(
      (await at) - started,
      "nothing has been asked of the site yet, so there is no gap to owe",
    ).toBe(0);
  });

  it("holds the interval between one request and the next", async () => {
    const limiter = new RateLimiter({ intervalMs: INTERVAL });
    const marks: number[] = [];
    const run = (async () => {
      for (let i = 0; i < 3; i += 1) {
        await limiter.beforeRequest();
        marks.push(Date.now());
      }
    })();

    await vi.advanceTimersByTimeAsync(AMPLE_MS);
    await run;

    const measured = gaps(marks);
    expect(measured.length, "three requests leave two gaps to check").toBe(2);
    for (const gap of measured) {
      expect(gap, "every request waits a full interval after the previous one").toBe(INTERVAL);
    }
  });

  it("publishes the spacing in force rather than making a caller guess", () => {
    expect(new RateLimiter({ intervalMs: INTERVAL }).currentIntervalMs).toBe(INTERVAL);
  });
});

describe("RateLimiter, serialising", () => {
  it("runs one scheduled task at a time", async () => {
    const limiter = new RateLimiter({ intervalMs: 1 });
    let inFlight = 0;
    let finished = 0;
    let overlapped = false;
    const task = async () => {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      await sleep(10);
      inFlight -= 1;
      finished += 1;
    };

    const all = Promise.all([
      limiter.schedule(task),
      limiter.schedule(task),
      limiter.schedule(task),
    ]);
    await vi.advanceTimersByTimeAsync(AMPLE_MS);
    await all;

    expect(finished, "all three tasks ran, so the overlap check had something to observe").toBe(3);
    expect(
      overlapped,
      "a burst of tool calls must not become a burst of connections to the Archive",
    ).toBe(false);
  });

  it("gives each scheduled task its own result and keeps them in order", async () => {
    const limiter = new RateLimiter({ intervalMs: 1 });
    const order: number[] = [];
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        limiter.schedule(async () => {
          order.push(n);
          return n * 10;
        }),
      ),
    );
    expect(results).toEqual([10, 20, 30]);
    expect(order, "tasks run in the order they were scheduled").toEqual([1, 2, 3]);
  });

  it("lets the queue carry on after a task fails", async () => {
    const limiter = new RateLimiter({ intervalMs: 1 });
    const failed = limiter.schedule(async () => {
      throw new Error("upstream refused");
    });
    await expect(failed, "a failing task rejects rather than hanging").rejects.toThrow(
      "upstream refused",
    );
    await expect(
      limiter.schedule(async () => "still working"),
      "one failure must not wedge the queue for every later request",
    ).resolves.toBe("still working");
  });
});

describe("RateLimiter, pacing across retry chains", () => {
  it("holds the gap between the last request of one chain and the first of the next", async () => {
    const limiter = new RateLimiter({ intervalMs: INTERVAL });
    const marks: number[] = [];

    // A task that retries twice: three requests inside one scheduled unit.
    const chain = limiter.schedule(async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await limiter.beforeRequest();
        marks.push(Date.now());
      }
    });
    // The next task's first request owes the site the same gap as any other.
    const next = limiter.schedule(async () => {
      await limiter.beforeRequest();
      marks.push(Date.now());
    });

    await vi.advanceTimersByTimeAsync(AMPLE_MS);
    await Promise.all([chain, next]);

    const measured = gaps(marks);
    expect(measured.length, "four requests leave three gaps to check").toBe(3);
    expect(
      measured[2],
      "the first request of a new task must not ride on the back of the previous task's last one",
    ).toBe(INTERVAL);
    for (const gap of measured) {
      expect(gap, "each attempt owes the same gap, inside a chain or across chains").toBe(INTERVAL);
    }
  });
});

describe("RateLimiter, push-back", () => {
  it("widens the gap when the site asks for room", () => {
    const limiter = new RateLimiter({ intervalMs: INTERVAL });
    limiter.pushBack();
    expect(
      limiter.currentIntervalMs,
      "a refusal means slow down, and the next request must wait longer than the last did",
    ).toBeGreaterThan(INTERVAL);
  });

  it("keeps widening while the pushing back continues", () => {
    const limiter = new RateLimiter({ intervalMs: INTERVAL });
    limiter.pushBack();
    const once = limiter.currentIntervalMs;
    limiter.pushBack();
    expect(
      limiter.currentIntervalMs,
      "a second refusal is worse news than the first",
    ).toBeGreaterThan(once);
  });

  it("stops widening at the ceiling, so a request is never left looking hung", () => {
    const limiter = new RateLimiter({ intervalMs: INTERVAL, maxIntervalMs: 200 });
    for (let i = 0; i < 20; i += 1) limiter.pushBack();
    expect(limiter.currentIntervalMs, "the ceiling is the widest the gap may become").toBe(200);
  });

  it("applies the widened gap to the next request, not only to the number reported", async () => {
    const limiter = new RateLimiter({ intervalMs: 20, maxIntervalMs: 1000 });
    // The opening request owes nothing, so it settles without the clock moving
    // and leaves the widened gap as the only thing the next one can be waiting on.
    await limiter.beforeRequest();
    limiter.pushBack();
    limiter.pushBack();
    const widened = limiter.currentIntervalMs;

    const started = Date.now();
    const at = settlesAt(limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(AMPLE_MS);

    expect(
      (await at) - started,
      "push-back that is reported but not waited out is no push-back at all",
    ).toBe(widened);
  });
});

describe("RateLimiter, recovery", () => {
  it("does not undo the caution on a single lucky answer", () => {
    const limiter = new RateLimiter({ intervalMs: INTERVAL });
    limiter.pushBack();
    limiter.pushBack();
    const widened = limiter.currentIntervalMs;
    limiter.succeeded();
    expect(
      limiter.currentIntervalMs,
      "one clean response after a rough patch does not prove the rough patch is over",
    ).toBe(widened);
  });

  it("narrows again on a run of successes", () => {
    const limiter = new RateLimiter({ intervalMs: INTERVAL });
    limiter.pushBack();
    limiter.pushBack();
    expect(limiter.currentIntervalMs).toBeGreaterThan(INTERVAL);

    let narrowedAfter = -1;
    for (let i = 1; i <= 100; i += 1) {
      limiter.succeeded();
      if (limiter.currentIntervalMs === INTERVAL) {
        narrowedAfter = i;
        break;
      }
    }
    expect(
      narrowedAfter,
      "a slow patch must not become the permanent speed of this server",
    ).toBeGreaterThan(0);
    expect(narrowedAfter, "recovery takes several successes in a row, not one").toBeGreaterThan(1);
  });

  it("never narrows below the interval it was configured with", () => {
    const limiter = new RateLimiter({ intervalMs: INTERVAL });
    for (let i = 0; i < 200; i += 1) limiter.succeeded();
    expect(
      limiter.currentIntervalMs,
      "a long run of quiet answers is not a reason to go faster than the configured pace",
    ).toBe(INTERVAL);
  });

  it("starts widening again from the base after a full recovery", () => {
    const limiter = new RateLimiter({ intervalMs: INTERVAL });
    limiter.pushBack();
    for (let i = 0; i < 200; i += 1) limiter.succeeded();
    expect(limiter.currentIntervalMs).toBe(INTERVAL);
    limiter.pushBack();
    expect(
      limiter.currentIntervalMs,
      "the widening is relative to the pace in force, so recovery resets what push-back doubles",
    ).toBeGreaterThan(INTERVAL);
  });
});

describe("sleep", () => {
  it("waits the time it was asked for", async () => {
    const started = Date.now();
    const at = settlesAt(sleep(30));
    await vi.advanceTimersByTimeAsync(AMPLE_MS);
    expect((await at) - started, "a sleep that returns early is no sleep at all").toBe(30);
  });
});
