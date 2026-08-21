/**
 * The server, driven through the protocol.
 *
 * Everything here goes over an in-memory transport with a fake fetch, so what
 * is under test is what a client actually receives: the tool list, the
 * annotations, the structured payload against the schema each tool declares,
 * and the text block that many clients render instead of it.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { getItemOutput } from "../../src/tools/getItem.js";
import { getSnapshotOutput } from "../../src/tools/getSnapshot.js";
import { listSnapshotsOutput } from "../../src/tools/listSnapshots.js";
import { searchBooksOutput } from "../../src/tools/searchBooks.js";
import { searchInsideOutput } from "../../src/tools/searchInside.js";
import { searchItemsOutput } from "../../src/tools/searchItems.js";
import { ATTRIBUTION } from "../../src/tools/shared.js";
import { fixture, jsonResponse, silentLogger } from "./helpers.js";

const TOOL_NAMES = [
  "search_inside",
  "search_items",
  "get_item",
  "get_snapshot",
  "list_snapshots",
  "search_books",
];

const OUTPUT_SCHEMAS = {
  search_inside: searchInsideOutput,
  search_items: searchItemsOutput,
  get_item: getItemOutput,
  get_snapshot: getSnapshotOutput,
  list_snapshots: listSnapshotsOutput,
  search_books: searchBooksOutput,
} as const;

/** What each route answers with, unless a test overrides it. */
const DEFAULT_ROUTES: [string, string][] = [
  ["service_backend=fts", "inside"],
  ["service_backend=metadata", "search-catalogue"],
  ["/metadata/", "item"],
  ["/wayback/available", "snapshot"],
  ["/cdx/search/cdx", "history"],
  ["openlibrary.org", "books"],
];

interface Harness {
  client: Client;
  urls: string[];
  close: () => Promise<void>;
}

const open = new Set<Harness>();

async function connect(overrides: [string, string][] = []): Promise<Harness> {
  const urls: string[] = [];
  const routes = [...overrides, ...DEFAULT_ROUTES];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    urls.push(url);
    for (const [needle, name] of routes) {
      if (url.includes(needle)) {
        return jsonResponse(fixture(name));
      }
    }
    throw new Error(`the contract test made an unrouted request to ${url}`);
  }) as unknown as typeof fetch;

  const server = createServer({
    config: { ...loadConfig({}), minIntervalMs: 500, maxRetries: 0, logLevel: "silent" },
    logger: silentLogger,
    fetchImpl,
  });
  const client = new Client({ name: "contract-test", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const harness: Harness = {
    client,
    urls,
    close: async () => {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    },
  };
  open.add(harness);
  return harness;
}

afterEach(async () => {
  for (const harness of open) {
    await harness.close();
  }
  open.clear();
});

/** The arguments each tool is exercised with, one call per tool. */
const CALLS: [string, Record<string, unknown>][] = [
  ["search_inside", { query: '"the lamps went out"' }],
  ["search_items", { query: "orchard" }],
  ["get_item", { identifier: "the-glass-orchard-1971", sections: ["basic", "files"] }],
  ["get_snapshot", { url: "example.invalid", at: "2005-01-01" }],
  ["list_snapshots", { url: "example.invalid" }],
  ["search_books", { query: "salt almanac" }],
];

const textOf = (result: unknown) => {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  expect(content.length, "every result must carry at least one text block").toBeGreaterThan(0);
  expect(content[0]!.type, "the first block is text, which is what a client renders").toBe("text");
  return content.map((block) => block.text).join("\n");
};

describe("the tool list", () => {
  it("publishes exactly the six tools this server exists for", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(
      tools.map((tool) => tool.name).sort(),
      "a tool that appears or disappears changes what a model will reach for",
    ).toEqual([...TOOL_NAMES].sort());
  });

  it("annotates every tool as read-only, because none of them writes", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(
        tool.annotations?.readOnlyHint,
        `${tool.name} only reads, and a client that asks before writing must be told so`,
      ).toBe(true);
      expect(
        tool.annotations?.destructiveHint,
        `${tool.name} destroys nothing on the Archive`,
      ).toBe(false);
    }
  });

  it("gives every tool a description and an output schema", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, `${tool.name} must say what it is for`).toBeTruthy();
      expect(
        tool.outputSchema,
        `${tool.name} declares a structured shape, which the protocol checks its answers against`,
      ).toBeDefined();
    }
  });

  it("tells a model which question leads to which tool", async () => {
    const { client } = await connect();
    const instructions = client.getInstructions() ?? "";
    expect(instructions, "the instructions must steer a phrase-in-a-book question").toContain(
      "search_inside",
    );
    expect(
      instructions,
      "and must say the count is of documents that page, since a model told otherwise stops at the first ten",
    ).toContain("documents that match");
    expect(instructions, "and must ask for the Archive to be credited").toContain("source_url");
  });
});

describe("every tool's answer", () => {
  for (const [name, args] of CALLS) {
    it(`${name} returns a structured payload that validates against its declared schema`, async () => {
      const { client } = await connect();
      const result = await client.callTool({ name, arguments: args });

      expect(result.isError, `${name} must succeed on a well-formed answer`).toBeFalsy();
      expect(
        result.structuredContent,
        `${name} declares an output schema, so it must answer with the structure it promised`,
      ).toBeDefined();

      const parsed = OUTPUT_SCHEMAS[name as keyof typeof OUTPUT_SCHEMAS].safeParse(
        result.structuredContent,
      );
      expect(
        parsed.success ? "" : JSON.stringify(parsed.error?.issues),
        `${name}'s structured output must satisfy the schema it publishes`,
      ).toBe("");
    }, 15_000);

    it(`${name} ends its text block with the credit`, async () => {
      const { client } = await connect();
      const result = await client.callTool({ name, arguments: args });
      const text = textOf(result);
      const lastLine = text.trimEnd().split("\n").at(-1)!;
      expect(
        lastLine,
        "the credit is the part truncation cannot reach, so it must sit at the end of the text",
      ).toContain(ATTRIBUTION);
    }, 15_000);
  }
});

describe("notes travel with the answer", () => {
  it("puts the notes in the text block, not only in the structured payload", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_inside",
      arguments: { query: '"the lamps went out"' },
    });
    const notes = (result.structuredContent as { notes: string[] }).notes;
    const text = textOf(result);

    expect(notes.length, "this answer has something to qualify").toBeGreaterThan(0);
    for (const note of notes) {
      expect(
        text,
        "a client that renders only the text would otherwise present an unqualified answer",
      ).toContain(note.slice(0, 40));
    }
  }, 15_000);

  it("warns that excerpts were read off a scan by a machine", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_inside",
      arguments: { query: '"the lamps went out"' },
    });
    expect(
      textOf(result),
      "quoting optical recognition as if it were typed text misstates the source",
    ).toMatch(/machine read|misreading/i);
  }, 15_000);

  it("keeps the corpus-wide occurrence count apart from the number of matches shown", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_inside",
      arguments: { query: '"the lamps went out"' },
    });
    const structured = result.structuredContent as { total: number; hits: unknown[] };
    expect(structured.total, "total counts occurrences across the whole corpus").toBe(4177);
    expect(structured.hits.length, "two matches are on this page").toBe(2);
    expect(
      textOf(result),
      "the text must say both numbers, so 4177 is never read as a number of results to page through",
    ).toContain("4177");
  }, 15_000);

  it("never lets the scanner's highlight markers reach the caller", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_inside",
      arguments: { query: '"the lamps went out"' },
    });
    const everything = JSON.stringify(result);
    expect(everything, "triple braces are the index's notation, not scanned text").not.toContain(
      "{{{",
    );
    expect(everything).not.toContain("}}}");
  }, 15_000);
});

describe("get_snapshot always states the distance from the date asked for", () => {
  it("reports the gap in days, in the structure and in the text", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "get_snapshot",
      arguments: { url: "example.invalid", at: "2005-01-01" },
    });
    const snapshot = (result.structuredContent as { snapshot: { days_from_requested: number } })
      .snapshot;

    // The fixture's capture is 2001-04-28T10:22:48Z, roughly three years and
    // eight months before the date asked for.
    const exactDays = (Date.UTC(2005, 0, 1) - Date.UTC(2001, 3, 28, 10, 22, 48)) / 86_400_000;
    expect(
      Math.abs(snapshot.days_from_requested - exactDays),
      `a capture years from the date asked for must be reported to the day (${exactDays.toFixed(2)} days here), or it gets described as the state of the page on that date`,
    ).toBeLessThan(1);
    expect(
      textOf(result),
      "and the text must carry the same number, for the client that renders nothing else",
    ).toContain(String(snapshot.days_from_requested));
  }, 15_000);

  it("says the gap is unknown rather than zero when no date was asked for", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "get_snapshot",
      arguments: { url: "example.invalid" },
    });
    const snapshot = (
      result.structuredContent as {
        snapshot: { days_from_requested: number | null };
      }
    ).snapshot;
    expect(snapshot.days_from_requested, "no date asked for means no gap to state").toBeNull();
  }, 15_000);
});

describe("a failure is reported as a failure", () => {
  it("marks an error and carries no structured payload", async () => {
    const { client } = await connect([["/metadata/", "item-missing"]]);
    const result = await client.callTool({
      name: "get_item",
      arguments: { identifier: "no-such-item" },
    });

    expect(
      result.isError,
      "an identifier the Archive does not hold is an error, not a record",
    ).toBe(true);
    expect(
      result.structuredContent,
      "an error does not fit the tool's declared output shape, so it carries none",
    ).toBeUndefined();
    expect(textOf(result), "the text names the code a caller can branch on").toContain(
      "[not_found]",
    );
  }, 15_000);

  it("never answers an unreadable response with an empty result", async () => {
    const { client } = await connect([["service_backend=metadata", "search-no-body"]]);
    const result = await client.callTool({
      name: "search_items",
      arguments: { query: "orchard" },
    });

    expect(
      result.isError,
      "a search whose answer could not be read must not come back as 'nothing in the catalogue matches'",
    ).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(textOf(result)).toContain("[parse_failure]");
  }, 15_000);

  it("refuses arguments that cannot produce a request", async () => {
    const { client, urls } = await connect();
    const result = await client.callTool({
      name: "get_snapshot",
      arguments: { url: "example.invalid", at: "some time in the nineties" },
    });

    expect(result.isError, "a date this server cannot read is refused, not guessed at").toBe(true);
    expect(textOf(result)).toContain("[invalid_input]");
    expect(urls.length, "a request that cannot be built must never be sent to the Archive").toBe(0);
  }, 15_000);

  it("rejects an argument the schema forbids before any tool runs", async () => {
    const { client, urls } = await connect();
    const result = await client.callTool({
      name: "search_inside",
      arguments: { query: "salt", limit: 500 },
    });
    expect(result.isError, "a limit beyond what the tool accepts is refused").toBe(true);
    expect(urls.length, "and nothing is asked of the Archive").toBe(0);
  }, 15_000);
});

describe("the answer is honest about where it came from", () => {
  it("says when an answer was served from the cache", async () => {
    const { client, urls } = await connect();
    const args = { name: "search_books", arguments: { query: "salt almanac" } };
    await client.callTool(args);
    const second = await client.callTool(args);

    expect(urls.length, "the same question inside the cache's life is asked once").toBe(1);
    expect(
      (second.structuredContent as { notes: string[] }).notes.join(" "),
      "a caller weighing how fresh an answer is has to be told it was not just fetched",
    ).toContain("cache");
  }, 20_000);

  it("carries a citable source address on every row of a search", async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: "search_items",
      arguments: { query: "orchard" },
    });
    const items = (result.structuredContent as { items: Array<{ source_url: string }> }).items;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.source_url, "a result that cannot be linked cannot be credited").toMatch(
        /^https:\/\/archive\.org\/details\//,
      );
    }
  }, 15_000);
});
