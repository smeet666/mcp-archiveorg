/**
 * What failed, and whose doing it was.
 *
 * A message that names the wrong cause is worse than a message that names none:
 * it sends the caller to fix something that was never broken. Two claims are
 * pinned here. A failure names the thing that actually failed, the argument or
 * the route it came from, rather than reciting a hint that fits some other
 * tool. And a mistake in the arguments is reported as a mistake in the
 * arguments, never as a defect of the server or as a fact about what the
 * Internet Archive holds.
 *
 * The mirror of that second claim is silence: a server that quietly repairs
 * one argument and quietly refuses another teaches a caller a rule that does
 * not exist, so both are said out loud.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArchiveError } from "../../src/errors.js";
import type { ArchiveClient } from "../../src/ia/client.js";
import { fetchJson } from "../../src/ia/http.js";
import { toItemDetail } from "../../src/ia/parse.js";
import { RateLimiter } from "../../src/ia/rateLimiter.js";
import { catalogueUrl } from "../../src/ia/urls.js";
import { runGetItem } from "../../src/tools/getItem.js";
import { runGetSnapshot } from "../../src/tools/getSnapshot.js";
import { runSearchItems } from "../../src/tools/searchItems.js";
import type { ItemDetail, SearchResults } from "../../src/types.js";
import { captureAsync, jsonResponse, scriptedFetch, settle, silentLogger } from "./helpers.js";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2024-01-01T00:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

interface Answer {
  content: Array<{ text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const textOf = (answer: Answer) => answer.content.map((block) => block.text).join("\n");
const notesOf = (answer: Answer) =>
  ((answer.structuredContent?.notes as string[]) ?? []).join("\n");

/** A client that fails the test if a tool reaches it at all. */
const neverCalled = (): ArchiveClient =>
  new Proxy(
    {},
    {
      get: (_target, name) => () => {
        throw new Error(`the tool called ${String(name)} on arguments it should have refused`);
      },
    },
  ) as unknown as ArchiveClient;

const item = (over: Partial<ItemDetail> = {}): ItemDetail => ({
  identifier: "nasa",
  title: "NASA Images",
  titleAsFiled: null,
  creator: null,
  year: null,
  mediaType: "image",
  downloads: 12,
  sourceUrl: "https://archive.org/details/nasa",
  isCollection: false,
  description: null,
  date: null,
  publisher: null,
  language: null,
  collections: [],
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  fileCount: 1,
  totalBytes: 10,
  files: [],
  raw: null,
  ...over,
});

const holdsItem = (asked: string[]): ArchiveClient =>
  ({
    getItem: async (identifier: string) => {
      asked.push(identifier);
      return { data: item(), cached: false };
    },
  }) as unknown as ArchiveClient;

const catalogue = (results: SearchResults, asked: string[] = []): ArchiveClient =>
  ({
    searchItems: async (query: { query: string }) => {
      asked.push(query.query);
      return { data: results, cached: false };
    },
  }) as unknown as ArchiveClient;

const getItemArgs = (identifier: string) =>
  ({
    identifier,
    sections: ["basic"],
    max_files: 25,
    max_description_chars: 2000,
  }) as never;

const searchItemsArgs = (query: string) =>
  ({ query, sort: "relevance", limit: 10, page: 1 }) as never;

describe("an ampersand written against a word", () => {
  it("reaches the catalogue in a form its query parser accepts", () => {
    // The catalogue refuses a query carrying an ampersand with a word character
    // beside it, and answers the refusal with rows nobody can see. Its index
    // folds punctuation before it matches, so the same term written with a
    // space and held together by quotes reaches the records that print it with
    // the ampersand.
    const sent = (query: string) =>
      new URL(catalogueUrl({ query, limit: 10, page: 1 })).searchParams.get("user_query");

    expect(sent("AT&T"), "AT&T is a name a caller types, and a query the site refuses").toBe(
      '("AT T")',
    );
    expect(sent("R&D budget")).toBe('("R D" budget)');
    expect(sent("cats & dogs"), "an ampersand standing alone is accepted as it is").toBe(
      "(cats & dogs)",
    );
  });

  it("is named in the answer, since the words searched for are not the words given", async () => {
    const answer = (await runSearchItems(
      catalogue({ total: 3, items: [] }),
      searchItemsArgs("AT&T"),
    )) as Answer;

    expect(notesOf(answer), "a caller comparing the rows to the query needs to know").toMatch(
      /ampersand/i,
    );
    expect(notesOf(answer)).toContain("AT T");
  });
});

describe("a hint attached to a refusal", () => {
  const options = (fetchImpl: typeof fetch, url: string) => ({
    url,
    userAgent: "mcp-archiveorg/test (+https://example.invalid)",
    timeoutMs: 2000,
    maxRetries: 0,
    limiter: new RateLimiter({ intervalMs: 1 }),
    logger: silentLogger,
    fetchImpl,
  });

  // A refusal the Archive states a reason for is the one it means about the
  // request, and so the one that carries a hint about what to change.
  const refused = async (url: string) => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse(
          { response: { errors: [{ message: "the request was not one it would run" }] } },
          { status: 400 },
        ),
    ]);
    const outcome = await captureAsync(() => settle(fetchJson(options(fetchImpl, url)), 60_000));
    expect(outcome.threw).toBe(true);
    const error = outcome.error as ArchiveError;
    expect(error.code).toBe("invalid_input");
    return `${error.message}\n${error.details.hint ?? ""}`;
  };

  it("speaks of query syntax only where a query was sent", async () => {
    const said = await refused(
      "https://archive.org/services/search/beta/page_production/?user_query=(orchard)",
    );
    expect(said, "the search route is the one a bracket or a colon can break").toMatch(
      /quotation mark|bracket/i,
    );
  });

  it("speaks of the identifier when the route carries an identifier", async () => {
    const said = await refused("https://archive.org/metadata/nasa");
    expect(
      said,
      "nothing in this request is a query, so nothing in it can be unbalanced",
    ).not.toMatch(/quotation mark|bracket/i);
    expect(said, "what was refused is the identifier").toMatch(/identifier/i);
  });

  it("speaks of the address when the route carries an address", async () => {
    const said = await refused("https://archive.org/wayback/available?url=example.com");
    expect(said).not.toMatch(/quotation mark|bracket/i);
    expect(said, "what was refused is the web address").toMatch(/address/i);
  });
});

describe("an identifier that is an address", () => {
  it("is refused as an argument rather than reported as a broken server", async () => {
    const answer = (await runGetItem(
      neverCalled(),
      getItemArgs("https://archive.org/details/nasa"),
    )) as Answer;

    expect(answer.isError).toBe(true);
    expect(textOf(answer), "a typo in an argument is not a fault of the Archive").toContain(
      "[invalid_input]",
    );
    expect(
      textOf(answer),
      "an invitation to open a bug report sends the caller nowhere",
    ).not.toMatch(/report this|issues/i);
    expect(
      textOf(answer),
      "the identifier is the last part of the address, and saying so fixes the call",
    ).toContain("nasa");
  });

  it("is refused when it is a path rather than a whole address", async () => {
    const answer = (await runGetItem(neverCalled(), getItemArgs("details/nasa"))) as Answer;

    expect(answer.isError).toBe(true);
    expect(textOf(answer)).toContain("[invalid_input]");
    expect(textOf(answer)).not.toMatch(/report this|issues/i);
  });
});

describe("an identifier read loosely", () => {
  it("says that the whitespace around it was set aside", async () => {
    const asked: string[] = [];
    const answer = (await runGetItem(holdsItem(asked), getItemArgs("  nasa  "))) as Answer;

    expect(answer.isError, "whitespace is worth forgiving").toBeUndefined();
    expect(asked, "and the identifier asked for is the trimmed one").toEqual(["nasa"]);
    expect(
      notesOf(answer),
      "a caller who is not told keeps sending the untrimmed form to every other tool",
    ).toMatch(/space/i);
  });

  it("names the capitals when a capitalised identifier finds nothing", () => {
    // The Archive addresses an item by the exact spelling of its identifier, so
    // "NASA" is not "nasa". An absence that does not say so reads as the item
    // not existing.
    let thrown: unknown;
    try {
      toItemDetail({ metadata: {} }, "NASA", "https://archive.org/metadata/NASA");
    } catch (raised) {
      thrown = raised;
    }

    const error = thrown as ArchiveError;
    expect(error?.code).toBe("not_found");
    expect(`${error.message} ${error.details.hint ?? ""}`).toMatch(/capital|case|lower/i);
    expect(
      `${error.message} ${error.details.hint ?? ""}`,
      "the spelling that would work is the useful part",
    ).toContain("nasa");
  });
});

describe("an address the Wayback Machine cannot read", () => {
  it("is refused rather than reported as never captured", async () => {
    const answer = (await runGetSnapshot(neverCalled(), {
      url: "not a url at all",
    } as never)) as Answer;

    expect(answer.isError).toBe(true);
    expect(textOf(answer)).toContain("[invalid_input]");
    expect(
      textOf(answer),
      "an absence and an unreadable argument are two different statements",
    ).not.toMatch(/holds no capture|never captured/i);
    expect(textOf(answer), "what is wrong with the value is what the caller needs").toMatch(
      /address/i,
    );
  });
});
