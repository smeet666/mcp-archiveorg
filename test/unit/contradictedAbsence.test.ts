/**
 * An absence the Wayback Machine states without holding it.
 *
 * The nearest-capture route answers a load it cannot serve with HTTP 200 and an
 * empty snapshot block, which is the same body it sends for an address it has
 * never captured. Read at face value, that turns a bad minute upstream into
 * "the Wayback Machine holds no capture of lemonde.fr", a statement about the
 * world that nothing established.
 *
 * The capture index answers the same address from a different service, and it
 * matches an address more strictly than the nearest-capture route does: a row
 * there is proof the empty answer was wrong. Each test below pins one half of
 * that reasoning, including the half where the index cannot settle it either.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveError } from "../../src/errors.js";
import { ArchiveClient } from "../../src/ia/client.js";
import { captureAsync, fixture, hangingFetch, jsonResponse, silentLogger } from "./helpers.js";

/** Wider than any wait these calls take, so a settled call is not a slow one. */
const AMPLE_MS = 10 * 60 * 1000;

/** Enough turns of the clock for both requests, each scheduled after the last. */
const ADVANCES = 5;

const NEAREST = "wayback/available";
const INDEX = "cdx/search/cdx";

interface Attempt {
  outcome: { threw: boolean; error: unknown; returned: unknown };
  urls: string[];
}

/** How a route answers when it is not simply serving a body as JSON. */
type Answer = (init: Parameters<typeof fetch>[1]) => Promise<Response>;

/** A route: the part of an address that identifies it, and what it answers. */
type Route = [string, unknown];

/**
 * Reads a snapshot against a fetch that answers each route from a table, and
 * reports both the outcome and the addresses that were asked for.
 *
 * The clock is advanced repeatedly rather than once: the second request is
 * scheduled by the rate limiter only after the first has been answered, so a
 * single advance stops the clock before the probe has anything to wait on.
 */
async function readSnapshot(routes: Route[], at?: Date): Promise<Attempt> {
  const urls: string[] = [];
  const fetchImpl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = String(input);
    urls.push(url);
    for (const [needle, body] of routes) {
      if (url.includes(needle)) {
        return typeof body === "function" ? await (body as Answer)(init) : jsonResponse(body);
      }
    }
    throw new Error(`no fixture routed for ${url}`);
  }) as unknown as typeof fetch;

  const client = new ArchiveClient({
    config: { logLevel: "silent", maxRetries: 0 },
    logger: silentLogger,
    fetchImpl,
  });

  let settled = false;
  const call = captureAsync(() => client.getSnapshot("example.invalid", at)).then((outcome) => {
    settled = true;
    return outcome;
  });
  for (let advance = 0; advance < ADVANCES && !settled; advance += 1) {
    await vi.advanceTimersByTimeAsync(AMPLE_MS);
  }

  return { outcome: await call, urls };
}

const codeOf = (error: unknown): string =>
  error instanceof ArchiveError ? error.code : `not an ArchiveError: ${String(error)}`;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2024-01-01T00:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("an empty nearest-capture answer for an address the index holds", () => {
  it("is not reported as an address the Wayback Machine never captured", async () => {
    const { outcome } = await readSnapshot([
      [NEAREST, fixture("snapshot-none")],
      [INDEX, fixture("history")],
    ]);

    expect(outcome.threw, "an answer contradicted by the index cannot be served").toBe(true);
    expect(
      codeOf(outcome.error),
      "an absence the index refutes is a route that failed, and a caller who reads not_found stops asking",
    ).toBe("rate_limited");
  });

  it("says which two answers disagree, so the report is about the Archive", async () => {
    const { outcome } = await readSnapshot([
      [NEAREST, fixture("snapshot-none")],
      [INDEX, fixture("history")],
    ]);

    const message = outcome.error instanceof Error ? outcome.error.message : "";
    expect(message, "the address asked about is what the caller can act on").toContain(
      "example.invalid",
    );
    expect(
      message.toLowerCase(),
      "a message that names neither answer leaves the caller to guess what failed",
    ).toContain("index");
  });

  it("asks the index about the same address, and only after the empty answer", async () => {
    const { urls } = await readSnapshot([
      [NEAREST, fixture("snapshot-none")],
      [INDEX, fixture("history")],
    ]);

    expect(urls, "the empty answer is what raises the question").toHaveLength(2);
    expect(urls[0]).toContain(NEAREST);
    expect(urls[1], "a probe of another address settles nothing about this one").toContain(
      "url=example.invalid",
    );
    expect(urls[1]).toContain(INDEX);
  });
});

describe("an empty nearest-capture answer the index agrees with", () => {
  it("stays an absence, which is what the caller asked to know", async () => {
    const { outcome } = await readSnapshot([
      [NEAREST, fixture("snapshot-none")],
      [INDEX, fixture("history-empty")],
    ]);

    expect(outcome.threw).toBe(true);
    expect(
      codeOf(outcome.error),
      "an absence both services agree on is a fact, and reporting it as a failure invites a retry of a settled question",
    ).toBe("not_found");
    expect(
      outcome.error instanceof Error ? outcome.error.message : "",
      "the absence is stated in the words the parser wrote",
    ).toContain("holds no capture of example.invalid");
  });
});

describe("an empty nearest-capture answer the index cannot settle", () => {
  it("is not turned into an absence by an index that never answered", async () => {
    const hanging = hangingFetch();
    const { outcome } = await readSnapshot([
      [NEAREST, fixture("snapshot-none")],
      [
        INDEX,
        ((init) =>
          hanging("https://web.archive.org/cdx/search/cdx", init) as Promise<Response>) as Answer,
      ],
    ]);

    expect(outcome.threw).toBe(true);
    expect(codeOf(outcome.error), "nothing established the absence, so nothing may state it").toBe(
      "timeout",
    );
  });

  it("is not turned into an absence by an index answering in a shape nobody can read", async () => {
    const { outcome } = await readSnapshot([
      [NEAREST, fixture("snapshot-none")],
      [INDEX, async () => jsonResponse({ error: "the index answered with a document" })],
    ]);

    expect(outcome.threw).toBe(true);
    expect(
      codeOf(outcome.error),
      "an index whose answer cannot be read has confirmed nothing",
    ).toBe("parse_failure");
  });

  it("is not turned into an absence by an index that refused the client", async () => {
    const { outcome } = await readSnapshot([
      [NEAREST, fixture("snapshot-none")],
      [INDEX, async () => new Response("slow down", { status: 429 })],
    ]);

    expect(outcome.threw).toBe(true);
    expect(codeOf(outcome.error), "a refusal says nothing about what the Archive holds").toBe(
      "rate_limited",
    );
  });
});

describe("a nearest-capture answer that carries a capture", () => {
  it("is served without asking the index anything", async () => {
    const { outcome, urls } = await readSnapshot([
      [NEAREST, fixture("snapshot")],
      [INDEX, fixture("history")],
    ]);

    expect(outcome.threw).toBe(false);
    expect(
      urls,
      "a second request on the ordinary path spends the Archive's bandwidth to confirm what it just said",
    ).toHaveLength(1);
    expect(urls[0]).toContain(NEAREST);
  });
});
