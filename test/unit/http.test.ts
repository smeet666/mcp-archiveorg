/**
 * fetchJson, fetchText and parseRetryAfter.
 *
 * A retry worth making is told from one that only adds load: an answer the site
 * meant is never asked for twice, and a refusal that names a time to come back
 * is obeyed rather than guessed at. Nothing here may turn a failure into an
 * empty answer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveError } from "../../src/errors.js";
import { fetchJson, fetchText, parseRetryAfter } from "../../src/ia/http.js";
import { RateLimiter } from "../../src/ia/rateLimiter.js";
import {
  captureAsync,
  hangingFetch,
  jsonResponse,
  scriptedFetch,
  settle,
  settlesAt,
  silentLogger,
} from "./helpers.js";

const URL_UNDER_TEST = "https://archive.org/metadata/nasa";

/**
 * More clock room than any call below is meant to wait for, the growing backoff
 * and its jitter included, so a call is always carried to its outcome.
 */
const AMPLE_MS = 120_000;

/** Carries a call that waits between attempts to its outcome. */
const run = <T>(call: Promise<T>) => settle(call, AMPLE_MS);

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2024-01-01T00:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

interface CallOptions {
  fetchImpl: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  limiter?: RateLimiter;
}

const options = (o: CallOptions) => ({
  url: URL_UNDER_TEST,
  userAgent: "mcp-archiveorg/test (+https://example.invalid)",
  timeoutMs: o.timeoutMs ?? 2000,
  maxRetries: o.maxRetries ?? 0,
  limiter: o.limiter ?? new RateLimiter({ intervalMs: 1 }),
  logger: silentLogger,
  fetchImpl: o.fetchImpl,
});

const status = (code: number, headers: Record<string, string> = {}) =>
  new Response("{}", { status: code, headers });

describe("parseRetryAfter", () => {
  it("reads a number of seconds", () => {
    expect(parseRetryAfter("120"), "Retry-After in seconds becomes milliseconds").toBe(120_000);
  });

  it("reads an HTTP date and measures from now", () => {
    const now = Date.UTC(2020, 0, 1, 12, 0, 0);
    const when = new Date(now + 30_000).toUTCString();
    const waited = parseRetryAfter(when, now);
    expect(waited, "a date is honoured as the time left until it").not.toBeNull();
    expect(waited, "the wait is the distance from now to the date the site named").toBe(30_000);
  });

  it("never asks for a negative wait when the date has already passed", () => {
    const now = Date.UTC(2020, 0, 1, 12, 0, 0);
    const past = new Date(now - 60_000).toUTCString();
    const waited = parseRetryAfter(past, now);
    expect(waited, "a date in the past means go now, not go backwards").toBe(0);
  });

  it("returns null when the header says neither, so the caller uses its own wait", () => {
    expect(parseRetryAfter("later"), "unreadable is not zero").toBeNull();
    expect(parseRetryAfter(null), "an absent header is not zero").toBeNull();
    expect(parseRetryAfter("")).toBeNull();
  });

  it("reads zero seconds as no wait rather than as an unreadable header", () => {
    expect(parseRetryAfter("0")).toBe(0);
  });
});

describe("fetchJson, the good path", () => {
  it("returns the parsed document", async () => {
    const { fetchImpl, count } = scriptedFetch([() => jsonResponse({ metadata: { title: "x" } })]);
    const data = await fetchJson(options({ fetchImpl }));
    expect(data).toEqual({ metadata: { title: "x" } });
    expect(count(), "a good answer is fetched once").toBe(1);
  });

  it("names itself to the Archive, so unexpected traffic can be traced", async () => {
    let seen: Parameters<typeof fetch>[1];
    const fetchImpl = (async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      seen = init;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    await fetchJson(options({ fetchImpl }));
    const headers = new Headers(seen?.headers);
    expect(
      headers.get("user-agent"),
      "the User-Agent this server was configured with is sent",
    ).toBe("mcp-archiveorg/test (+https://example.invalid)");
  });

  it("reports a clean answer to the limiter, so the pacing can recover", async () => {
    const limiter = new RateLimiter({ intervalMs: 10 });
    limiter.pushBack();
    limiter.pushBack();
    const widened = limiter.currentIntervalMs;

    // Recovery deliberately takes a run of clean answers, so one request
    // proves nothing: a limiter told nothing at all would look identical.
    // Three narrow the gap, and only if each answer was reported.
    for (let n = 0; n < 3; n += 1) {
      const { fetchImpl } = scriptedFetch([() => jsonResponse({})]);
      await run(fetchJson(options({ fetchImpl, limiter })));
    }

    expect(
      limiter.currentIntervalMs,
      "a run of clean answers must narrow the gap, or the pacing never recovers",
    ).toBeLessThan(widened);
  });
});

describe("fetchJson, statuses that are not retried", () => {
  // 400 is absent on purpose: the Archive sends it both for a request it
  // objects to and for one it declines to serve at that moment, and what
  // separates them is whether the body states a reason. The two cases are
  // covered below, each with the number of attempts it warrants.
  const finals: Array<[number, string]> = [
    [404, "the Archive answered, and holds nothing there"],
    [403, "a refusal on grounds a retry cannot alter"],
    [451, "a refusal on grounds a retry cannot alter"],
  ];

  for (const [code, why] of finals) {
    it(`asks once and gives up on ${code}: ${why}`, async () => {
      const { fetchImpl, count } = scriptedFetch([() => status(code)]);
      const outcome = await captureAsync(() => fetchJson(options({ fetchImpl, maxRetries: 3 })));
      expect(outcome.threw, "a refusal must be raised, never returned as a document").toBe(true);
      expect(
        count(),
        "asking again for something the site meant wastes a request and delays the honest answer",
      ).toBe(1);
    });
  }

  it("calls a 404 not_found, which is an absence and not a failure to ask", async () => {
    const { fetchImpl } = scriptedFetch([() => status(404)]);
    const outcome = await captureAsync(() => fetchJson(options({ fetchImpl })));
    expect(outcome.error).toBeInstanceOf(ArchiveError);
    expect(
      (outcome.error as ArchiveError).code,
      "a 404 is the Archive saying it holds nothing there",
    ).toBe("not_found");
  });

  it("carries the status on the error, so a caller can see what the site said", async () => {
    const { fetchImpl } = scriptedFetch([() => status(403)]);
    const outcome = await captureAsync(() => fetchJson(options({ fetchImpl })));
    expect((outcome.error as ArchiveError).details.status).toBe(403);
    expect((outcome.error as ArchiveError).details.url).toBe(URL_UNDER_TEST);
  });
});

describe("fetchJson, statuses that are retried", () => {
  const transient = [429, 500, 502, 503, 504];

  for (const code of transient) {
    it(`asks again after ${code}, which says nothing about what the Archive holds`, async () => {
      const { fetchImpl, count } = scriptedFetch([
        () => status(code),
        () => jsonResponse({ ok: 1 }),
      ]);
      const data = await run(fetchJson(options({ fetchImpl, maxRetries: 2 })));
      expect(data, "the retry's answer is the answer").toEqual({ ok: 1 });
      expect(count(), "one failed attempt and one that worked").toBe(2);
    });
  }

  it("stops at the number of retries it was given", async () => {
    const { fetchImpl, count } = scriptedFetch([() => status(503)]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 2 }))));
    expect(outcome.threw).toBe(true);
    expect(count(), "one first attempt and two retries, and then it gives up").toBe(3);
  });

  it("makes no retry at all when it was given none", async () => {
    const { fetchImpl, count } = scriptedFetch([() => status(503)]);
    await captureAsync(() => fetchJson(options({ fetchImpl, maxRetries: 0 })));
    expect(count(), "maxRetries of zero means one attempt").toBe(1);
  });

  it("calls an exhausted 429 rate_limited, never an absence", async () => {
    const { fetchImpl } = scriptedFetch([() => status(429)]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 1 }))));
    expect((outcome.error as ArchiveError).code).toBe("rate_limited");
    expect(
      (outcome.error as ArchiveError).details.hint,
      "being asked to slow down says nothing about whether the Archive holds what was asked for",
    ).toContain("says nothing");
  });

  it("widens the pacing when the site asks it to slow down", async () => {
    const limiter = new RateLimiter({ intervalMs: 5 });
    const base = limiter.currentIntervalMs;
    const { fetchImpl } = scriptedFetch([() => status(429), () => jsonResponse({})]);
    await run(fetchJson(options({ fetchImpl, maxRetries: 1, limiter })));
    expect(
      limiter.currentIntervalMs,
      "a 429 must slow this server down, not merely be retried at the same rate",
    ).toBeGreaterThan(base);
  });

  it("retries a connection that failed outright", async () => {
    const { fetchImpl, count } = scriptedFetch([
      () => {
        throw new TypeError("fetch failed");
      },
      () => jsonResponse({ ok: 1 }),
    ]);
    const data = await run(fetchJson(options({ fetchImpl, maxRetries: 1 })));
    expect(data).toEqual({ ok: 1 });
    expect(count()).toBe(2);
  });

  it("reports a connection that never worked as a network_error", async () => {
    const { fetchImpl } = scriptedFetch([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 1 }))));
    expect(outcome.threw, "a connection that never worked is not an empty answer").toBe(true);
    expect((outcome.error as ArchiveError).code).toBe("network_error");
  });
});

describe("fetchJson, Retry-After", () => {
  it("waits the number of seconds the site named", async () => {
    const { fetchImpl, at } = scriptedFetch([
      () => status(429, { "retry-after": "1" }),
      () => jsonResponse({ ok: 1 }),
    ]);
    const data = await run(fetchJson(options({ fetchImpl, maxRetries: 1, timeoutMs: 5000 })));
    expect(data).toEqual({ ok: 1 });
    expect(
      at[1]! - at[0]!,
      "a refusal that names a time to come back is obeyed rather than guessed at",
    ).toBe(1000);
  });

  it("waits until the date the site named", async () => {
    // An HTTP date carries no fraction of a second, so the wait it asks for is
    // the whole seconds between the refusal and the date it names.
    const when = new Date(Date.now() + 2500).toUTCString();
    const { fetchImpl, at } = scriptedFetch([
      () => status(503, { "retry-after": when }),
      () => jsonResponse({ ok: 1 }),
    ]);
    const data = await run(fetchJson(options({ fetchImpl, maxRetries: 1, timeoutMs: 9000 })));
    expect(data).toEqual({ ok: 1 });
    expect(
      at[1]! - at[0]!,
      "Retry-After as an HTTP date must be honoured the same as Retry-After in seconds",
    ).toBe(2000);
  });
});

describe("fetchJson, the deadline", () => {
  it("abandons a request that never answers", async () => {
    const started = Date.now();
    const call = fetchJson(options({ fetchImpl: hangingFetch(), timeoutMs: 120, maxRetries: 0 }));
    const abandonedAt = settlesAt(call);
    const outcome = await captureAsync(() => run(call));

    expect(outcome.threw, "a request with no answer must be abandoned, not awaited forever").toBe(
      true,
    );
    expect((outcome.error as ArchiveError).code, "an abandoned request is a timeout").toBe(
      "timeout",
    );
    expect(
      (await abandonedAt) - started,
      "the deadline is a deadline, so it fires on the budget it was given",
    ).toBe(120);
  });

  it("passes an abort signal to the fetch it makes, which is what enforces the deadline", async () => {
    let seen: Parameters<typeof fetch>[1];
    const fetchImpl = (async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      seen = init;
      return jsonResponse({});
    }) as unknown as typeof fetch;
    await fetchJson(options({ fetchImpl }));
    expect(seen?.signal, "without a signal a hung connection is never released").toBeDefined();
  });

  it("never turns a timeout into an empty document", async () => {
    const outcome = await captureAsync(() =>
      run(fetchJson(options({ fetchImpl: hangingFetch(), timeoutMs: 100 }))),
    );
    expect(
      outcome.returned,
      "a timeout returned as {} would be parsed as an item the Archive does not hold",
    ).toBeUndefined();
  });
});

describe("fetchJson, a body that is not JSON", () => {
  it("throws parse_failure rather than returning nothing", async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response("<html>we are down</html>", { status: 200 }),
    ]);
    const outcome = await captureAsync(() => fetchJson(options({ fetchImpl })));
    expect(
      outcome.threw,
      `a body that is not JSON must throw; it returned ${JSON.stringify(outcome.returned)}`,
    ).toBe(true);
    expect(
      (outcome.error as ArchiveError).code,
      "an answer in a shape this server cannot read is a parse_failure",
    ).toBe("parse_failure");
  });

  it("does not retry a body it could not read, which would only repeat itself", async () => {
    const { fetchImpl, count } = scriptedFetch([() => new Response("not json", { status: 200 })]);
    await captureAsync(() => fetchJson(options({ fetchImpl, maxRetries: 3 })));
    expect(count(), "the site answered; the answer is simply unreadable").toBe(1);
  });
});

describe("fetchText", () => {
  it("returns the body as it stands", async () => {
    const { fetchImpl } = scriptedFetch([() => new Response("plain body", { status: 200 })]);
    expect(await fetchText(options({ fetchImpl }))).toBe("plain body");
  });

  it("raises the same refusals as fetchJson", async () => {
    const { fetchImpl } = scriptedFetch([() => status(404)]);
    const outcome = await captureAsync(() => fetchText(options({ fetchImpl })));
    expect(outcome.threw, "a refusal must never come back as an empty string").toBe(true);
    expect(
      (outcome.error as ArchiveError).code,
      "the two entry points must agree on what a status means",
    ).toBe("not_found");
  });
});

/**
 * The Archive answers a request it read and would not run with 400, and it uses
 * that status for two different things.
 *
 * When it objects to the query, it says what it objected to, in words: a search
 * whose quotation mark is never closed comes back with "a structure was opened
 * but not closed". That is the caller's to fix, and repeating the Archive's own
 * sentence beats guessing at which character it meant.
 *
 * It also answers 400 to a query it parses perfectly well, and the same words
 * that are refused one minute are answered the next. Reading that as a verdict
 * on the query tells a caller to correct a search that has nothing wrong with
 * it, and hides that the Archive was the thing that was unavailable.
 */
describe("a refusal the Archive explains", () => {
  const refusal = (message: string) =>
    new Response(JSON.stringify({ response: { errors: [{ message }] } }), { status: 400 });

  it("is the caller's to fix, and is asked only once", async () => {
    const { fetchImpl, count } = scriptedFetch([
      () => refusal("a structure was opened but not closed (quoted phrase open at position 1)"),
    ]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 3 }))));

    expect((outcome.error as ArchiveError).code).toBe("invalid_input");
    expect(count(), "the Archive has said what is wrong; asking again changes nothing").toBe(1);
  });

  it("repeats what the Archive said rather than guessing at it", async () => {
    const { fetchImpl } = scriptedFetch([
      () => refusal("a structure was opened but not closed (quoted phrase open at position 1)"),
    ]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl }))));

    expect((outcome.error as ArchiveError).message).toContain(
      "a structure was opened but not closed",
    );
  });

  it("reads the reason whether it is stated once or as a list", async () => {
    const single = new Response(
      JSON.stringify({
        response: { error: { message: "search: the field is not one it indexes" } },
      }),
      { status: 400 },
    );
    const { fetchImpl } = scriptedFetch([() => single]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl }))));

    expect((outcome.error as ArchiveError).code).toBe("invalid_input");
    expect((outcome.error as ArchiveError).message).toContain("the field is not one it indexes");
  });
});

describe("a refusal the Archive states no reason for", () => {
  const bare = () => new Response("{}", { status: 400 });

  it("is asked again, since nothing said the request was wrong", async () => {
    const { fetchImpl, count } = scriptedFetch([bare, () => jsonResponse({ ok: 1 })]);
    const data = await run(fetchJson(options({ fetchImpl, maxRetries: 2 })));

    expect(data, "the retry's answer is the answer").toEqual({ ok: 1 });
    expect(count()).toBe(2);
  });

  it("is never reported as the caller's mistake once the retries run out", async () => {
    const { fetchImpl } = scriptedFetch([bare]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 1 }))));

    expect(
      (outcome.error as ArchiveError).code,
      "telling a caller to correct a search the Archive never objected to sends them after nothing",
    ).not.toBe("invalid_input");
  });

  it("says that the Archive refused without giving a reason", async () => {
    const { fetchImpl } = scriptedFetch([bare]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 1 }))));

    expect((outcome.error as ArchiveError).message).toMatch(/refused .*without .*reason/i);
    expect((outcome.error as ArchiveError).details.status).toBe(400);
  });
});

/**
 * A reason the Archive states about its own machinery.
 *
 * The Archive answers a failure in the services behind the search with the same
 * status it uses to refuse a request, and states a reason for it: a child
 * request that failed, a backend that returned nothing usable. The reason is
 * marked as an error of its own rather than written as a sentence about the
 * query, which is what tells the two apart.
 *
 * Reading it as a verdict on the request tells a caller to rewrite a search the
 * Archive never objected to, while the search it names is answered again as
 * soon as the service behind it recovers.
 */
describe("a refusal naming the Archive's own machinery", () => {
  const backend = () =>
    new Response(
      JSON.stringify({
        response: {
          errors: [
            {
              message:
                "child request for collection_title_fetch__58456b71 failed ([BACKEND_ERROR] Invalid or no response from Elasticsearch, received: <html><body><h1>400 Bad request</h1>",
            },
          ],
        },
      }),
      { status: 400 },
    );

  it("is asked again, since the request was never what was wrong", async () => {
    const { fetchImpl, count } = scriptedFetch([backend, () => jsonResponse({ ok: 1 })]);
    const data = await run(fetchJson(options({ fetchImpl, maxRetries: 2 })));

    expect(data, "the retry's answer is the answer").toEqual({ ok: 1 });
    expect(count()).toBe(2);
  });

  it("is never reported as the caller's mistake once the retries run out", async () => {
    const { fetchImpl } = scriptedFetch([backend]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 1 }))));

    expect(
      (outcome.error as ArchiveError).code,
      "a search is not rewritten to repair a service behind the Archive",
    ).not.toBe("invalid_input");
  });

  it("still repeats what the Archive said, so the failure can be recognised", async () => {
    const { fetchImpl } = scriptedFetch([backend]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 1 }))));

    expect((outcome.error as ArchiveError).message).toContain("Elasticsearch");
  });
});

/**
 * The same failure, stated in prose.
 *
 * The Archive does not always mark the service that failed. The full-text route
 * says so in a sentence, and quotes the status that service returned inside it.
 * Nothing here is about the query, and a caller told to rewrite one is sent to
 * correct a search that will answer as soon as the service is back.
 */
describe("a refusal naming the Archive's own machinery in a sentence", () => {
  const unmarked = () =>
    new Response(
      JSON.stringify({
        response: {
          error: {
            message:
              "The search backend encountered an exception (the FTS API request failed, the error reported was: HTTP 502)",
          },
        },
      }),
      { status: 400 },
    );

  it("is asked again, since a service that fell over comes back", async () => {
    const { fetchImpl, count } = scriptedFetch([unmarked, () => jsonResponse({ ok: 1 })]);
    const data = await run(fetchJson(options({ fetchImpl, maxRetries: 2 })));

    expect(data, "the retry's answer is the answer").toEqual({ ok: 1 });
    expect(count()).toBe(2);
  });

  it("is never reported as the caller's mistake once the retries run out", async () => {
    const { fetchImpl } = scriptedFetch([unmarked]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 1 }))));

    expect(
      (outcome.error as ArchiveError).code,
      "a well-formed search is not rewritten to repair an HTTP 502 behind it",
    ).not.toBe("invalid_input");
  });
});

/**
 * A refusal that is about the query keeps being read as one.
 *
 * Widening what counts as the Archive's own failure is only safe while a
 * sentence about the expression stays on the other side of the line: read as a
 * service failure, it would be retried three times and then reported as
 * unreachable, leaving the caller with an unbalanced quotation mark and nothing
 * saying so.
 */
describe("a refusal about the query itself", () => {
  const syntax = () =>
    new Response(
      JSON.stringify({
        response: {
          error: {
            message: "a structure was opened but not closed (quoted phrase open at position 1)",
          },
        },
      }),
      { status: 400 },
    );

  it("is handed back as the caller's to fix, without another attempt", async () => {
    const { fetchImpl, count } = scriptedFetch([syntax, () => jsonResponse({ ok: 1 })]);
    const outcome = await captureAsync(() => run(fetchJson(options({ fetchImpl, maxRetries: 2 }))));

    expect((outcome.error as ArchiveError).code).toBe("invalid_input");
    expect(count(), "an expression the site parsed and rejected parses the same way twice").toBe(1);
  });
});
