/**
 * Shared scaffolding for the unit tests.
 *
 * Nothing here reaches the network: every response a test sees is either a
 * fixture from `test/fixtures` or a `Response` built in memory.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { Logger } from "../../src/config.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));
}

/** Collects the skip callback the parsers are handed. */
export function skipCounter(): {
  onSkip: (n: number) => void;
  total: () => number;
  calls: number[];
} {
  const calls: number[] = [];
  return {
    onSkip: (n: number) => {
      calls.push(n);
    },
    total: () => calls.reduce((sum, n) => sum + n, 0),
    calls,
  };
}

/**
 * Runs `fn` and reports what happened, so a test can say "this must throw"
 * without the assertion itself being swallowed by the catch.
 */
export function capture(fn: () => unknown): { threw: boolean; error: unknown; returned: unknown } {
  try {
    return { threw: false, error: undefined, returned: fn() };
  } catch (error) {
    return { threw: true, error, returned: undefined };
  }
}

export async function captureAsync(
  fn: () => Promise<unknown>,
): Promise<{ threw: boolean; error: unknown; returned: unknown }> {
  try {
    return { threw: false, error: undefined, returned: await fn() };
  } catch (error) {
    return { threw: true, error, returned: undefined };
  }
}

/**
 * Carries `call` to its outcome on a fake clock by advancing time `ampleMs`,
 * which stands in for the waits the call takes between attempts.
 *
 * The rejection is held while the clock moves, so a call that fails does so at
 * the `await` the test writes rather than as an unhandled rejection.
 */
export async function settle<T>(call: Promise<T>, ampleMs: number): Promise<T> {
  const held = call.catch(() => undefined);
  await vi.advanceTimersByTimeAsync(ampleMs);
  await held;
  return call;
}

/**
 * The clock reading at the moment `promise` settles, whatever its outcome.
 *
 * Call it before advancing a fake clock: the reading is taken in the
 * continuation, so it names the instant the promise settled and not the instant
 * the test stopped advancing.
 */
export function settlesAt(promise: Promise<unknown>): Promise<number> {
  return promise.then(
    () => Date.now(),
    () => Date.now(),
  );
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export interface FetchCall {
  url: string;
  init: Parameters<typeof fetch>[1];
}

/**
 * A fetch that answers from a routing table and records what it was asked.
 *
 * A route is matched on a substring of the URL, so a test states the part of
 * the address that identifies the route and ignores the query string.
 */
export function routedFetch(routes: Array<[string, unknown]>): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = String(input);
    calls.push({ url, init });
    for (const [needle, body] of routes) {
      if (url.includes(needle)) return jsonResponse(body);
    }
    throw new Error(`no fixture routed for ${url}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/**
 * A fetch that replays a scripted sequence of answers, one per attempt.
 *
 * `at` holds the clock reading of each attempt, so a test can state the gap
 * between two attempts instead of the time the whole call took.
 */
export function scriptedFetch(steps: Array<() => Response | Promise<Response>>): {
  fetchImpl: typeof fetch;
  count: () => number;
  at: number[];
} {
  let index = 0;
  const at: number[] = [];
  const fetchImpl = (async () => {
    const step = steps[Math.min(index, steps.length - 1)];
    index += 1;
    at.push(Date.now());
    if (!step) throw new Error("scriptedFetch ran out of steps");
    return step();
  }) as unknown as typeof fetch;
  return { fetchImpl, count: () => index, at };
}

/** A fetch that never answers, and rejects the way a real one does on abort. */
export function hangingFetch(): typeof fetch {
  return (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    })) as unknown as typeof fetch;
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
