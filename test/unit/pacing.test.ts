/**
 * What this server owes the site it reads.
 *
 * The Internet Archive charges nobody and turns nobody away. The promises made
 * in return are that requests are spaced, that the client says who it is, and
 * that a refusal is obeyed without holding every other tool hostage. Each test
 * below pins one of those against a way of getting it wrong.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveClient } from "../../src/ia/client.js";
import { ArchiveError } from "../../src/errors.js";
import { MIN_ALLOWED_INTERVAL_MS, loadConfig } from "../../src/config.js";
import { fetchJson } from "../../src/ia/http.js";
import { RateLimiter } from "../../src/ia/rateLimiter.js";
import { captureAsync, settle, settlesAt, silentLogger } from "./helpers.js";

/**
 * More clock room than any wait below is meant to take, an hour included.
 *
 * A call that slept when it should have refused still settles under an advance
 * this wide, so it fails on the wait it took rather than on a test timeout.
 */
const AMPLE_MS = 2 * 60 * 60 * 1000;

/**
 * A fetch that answers every call with the same status and headers, and records
 * the clock reading of each attempt.
 */
function always(status: number, headers: Record<string, string> = {}, body = "{}") {
  const at: number[] = [];
  const impl = (async () => {
    at.push(Date.now());
    return new Response(body, { status, headers });
  }) as unknown as typeof fetch;
  return { impl, calls: () => at.length, at };
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2024-01-01T00:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the pacing floor", () => {
  it("survives a configuration that leaves the interval unset", () => {
    // `Partial<Config>` makes `{ minIntervalMs: undefined }` legal, and
    // Math.max(500, undefined) is NaN, which compares false against every
    // threshold and removes the gap entirely.
    const client = new ArchiveClient({
      config: { minIntervalMs: undefined, logLevel: "silent" } as never,
      logger: silentLogger,
    });

    expect(
      Number.isFinite(client.intervalMs),
      "an unset interval must fall back, not become NaN",
    ).toBe(true);
    expect(client.intervalMs).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });

  it("survives an interval that is not a number at all", () => {
    const client = new ArchiveClient({
      config: { minIntervalMs: Number.NaN, logLevel: "silent" },
      logger: silentLogger,
    });

    expect(client.intervalMs).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });

  it("cannot be lowered past the floor", () => {
    const client = new ArchiveClient({
      config: { minIntervalMs: 1, logLevel: "silent" },
      logger: silentLogger,
    });

    expect(client.intervalMs).toBe(MIN_ALLOWED_INTERVAL_MS);
  });
});

describe("the User-Agent", () => {
  it("carries a contact address whatever the caller asks for", () => {
    // A caller may say who they are; they may not remove the address the
    // Archive would use to reach a human about traffic it did not expect.
    for (const claimed of [
      "curl/8.4.0",
      "python-requests/2.31",
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "Mozilla/5.0 (Macintosh)",
    ]) {
      const client = new ArchiveClient({
        config: { userAgent: claimed, logLevel: "silent" },
        logger: silentLogger,
      });

      expect(client.userAgent, `a contact address must survive "${claimed}"`).toContain(
        "github.com/smeet666/mcp-archiveorg",
      );
    }
  });

  it("does not repeat the project identifier when it is already there", () => {
    const client = new ArchiveClient({
      config: { userAgent: loadConfig({}).userAgent, logLevel: "silent" },
      logger: silentLogger,
    });

    const occurrences = client.userAgent.split("mcp-archiveorg/").length - 1;
    expect(occurrences, "the identifier belongs in the string once").toBe(1);
  });
});

describe("a refusal that names a time to come back", () => {
  it("is refused rather than obeyed when the wait is longer than a caller would tolerate", async () => {
    const limiter = new RateLimiter({ intervalMs: 1 });
    const fake = always(503, { "retry-after": "3600" });

    const started = Date.now();
    const call = fetchJson({
      url: "https://archive.org/probe",
      userAgent: "test",
      timeoutMs: 500,
      maxRetries: 2,
      limiter,
      logger: silentLogger,
      fetchImpl: fake.impl,
    });
    const at = settlesAt(call);
    const outcome = await captureAsync(() => settle(call, AMPLE_MS));

    const code = outcome.error instanceof ArchiveError ? outcome.error.code : "not an ArchiveError";
    expect(code, "an hour-long wait is a refusal, not a pause").toBe("rate_limited");
    expect(fake.calls(), "the hour is refused on the answer that named it").toBe(1);
    expect(
      (await at) - started,
      "sleeping for the hour would hold every other tool behind it",
    ).toBe(0);
  });

  it("still honours a wait short enough to be worth taking", async () => {
    const limiter = new RateLimiter({ intervalMs: 1 });
    const fake = always(503, { "retry-after": "1" });

    const call = fetchJson({
      url: "https://archive.org/probe",
      userAgent: "test",
      timeoutMs: 500,
      maxRetries: 1,
      limiter,
      logger: silentLogger,
      fetchImpl: fake.impl,
    });
    // The point is the wait, not the outcome.
    await captureAsync(() => settle(call, AMPLE_MS));

    expect(fake.calls(), "the request is made again after the wait").toBe(2);
    expect(fake.at[1]! - fake.at[0]!, "a one-second wait is obeyed").toBe(1000);
  });
});

describe("a route that is slow by design", () => {
  it("is not asked again after it failed to answer in time", async () => {
    // A capture index that did not answer within its budget is busy. Three
    // more identical queries add load to the route already struggling, and
    // each one holds the queue for its full deadline.
    const limiter = new RateLimiter({ intervalMs: 1 });
    let calls = 0;
    // Never answers, and honours the deadline the caller set, which is what a
    // request abandoned mid-flight actually does.
    const hangs = ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        calls += 1;
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })) as unknown as typeof fetch;

    const call = fetchJson({
      url: "https://web.archive.org/cdx/search/cdx",
      userAgent: "test",
      timeoutMs: 120,
      maxRetries: 4,
      limiter,
      logger: silentLogger,
      fetchImpl: hangs,
    });
    // Expected: it never answers.
    const outcome = await captureAsync(() => settle(call, AMPLE_MS));

    expect(outcome.threw, "a route that never answered is reported, not returned as data").toBe(
      true,
    );
    expect(calls, "a timeout is retried once, and the four retries offered are not taken").toBe(2);
  });
});
