/** Schemas, error mapping and rendering shared by the six tools. */

import { z } from "zod";
import { ArchiveError, invalidInput } from "../errors.js";

/** A character no address can hold, such as a line break or a tab. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const HOST_END = /[/?#]/;
const USER_INFO = /^[^@]*@/;
const PORT = /:\d+$/;
const NUMERIC_HOST = /^\[[0-9a-f:]+\]$/i;
const DOTTED_NAME = /^[^\s.]+(?:\.[^\s.]+)+$/;
/** The port a scheme implies, which names the same address as no port at all. */
const DEFAULT_PORT = /^((?:[a-z][a-z0-9+.-]*:\/\/)?[^/]*?):(?:80|443)(?=$|\/)/;
const TRAILING_SLASHES = /\/+$/;
const LOWERCASE_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//;

/**
 * The text block is what many clients render, and some render nothing else, so
 * it has to answer on its own. This ceiling is what keeps a search of a corpus
 * of millions from arriving as a wall of scanned text.
 */
export const MAX_TEXT_CHARS = 2200;

export const ATTRIBUTION = "Source: Internet Archive";

/**
 * The last page of results a search tool serves.
 *
 * The schemas and the notes that point at a next page read the same ceiling, so
 * a tool cannot advise a page it would then refuse.
 */
export const MOST_PAGES = 100;

export interface ToolResult {
  // The SDK's result type carries an index signature for protocol extensions.
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export const itemSummarySchema = z.object({
  identifier: z.string().describe("Pass this to get_item to read the full record."),
  title: z.string().nullable(),
  creator: z.string().nullable(),
  year: z.number().int().nullable(),
  media_type: z
    .string()
    .nullable()
    .describe(
      "The kind the catalogue files this row under, in the Archive's own words. Most rows carry one of texts, movies, audio, image, software or data, and some carry a kind the filter cannot ask for, such as 'collection' for a page gathering items rather than an item itself.",
    ),
  downloads: z.number().int().nullable(),
  source_url: z.string().describe("Public page. Show this when citing the item."),
});

export const snapshotSchema = z.object({
  captured_at: z.string().describe("ISO 8601, in UTC."),
  url: z.string().describe("The capture itself, readable as it was on that date."),
  address: z
    .string()
    .describe(
      "The address this capture is of. The Wayback Machine indexes a site under several addresses at once, such as its www form, its https form and a form carrying credentials, so this can differ from the address that was asked about.",
    ),
  status: z
    .number()
    .int()
    .nullable()
    .describe("What the original site answered when it was captured."),
});

/**
 * Build a result whose text block ends with its notes and its credit.
 *
 * Notes qualify an answer: that a list was cut, that a capture is years from
 * the date asked for, that scanned text was read by a machine. A client that
 * shows only the text would otherwise present an unqualified answer, so they
 * travel with the credit, which is the part truncation cannot reach.
 */
export function ok(
  structured: Record<string, unknown>,
  body: string,
  options: { notes?: string[]; sourceUrl?: string } = {},
): ToolResult {
  const credit = options.sourceUrl ? `${ATTRIBUTION} — ${options.sourceUrl}` : ATTRIBUTION;

  // A long run of notes must not crowd out the answer it qualifies.
  const noteLines = (options.notes ?? []).map((note) => `Note: ${note}`);
  while (noteLines.length > 0 && noteLines.join("\n").length > MAX_TEXT_CHARS / 2) {
    noteLines.pop();
  }
  const trailer = [...noteLines, credit].join("\n");

  const cut = "\n\n[shortened; the full result is in the structured output]";
  const budget = MAX_TEXT_CHARS - `\n\n${trailer}`.length;
  const text =
    body.length <= budget
      ? `${body}\n\n${trailer}`
      : `${truncate(body, Math.max(0, budget - cut.length))}${cut}\n\n${trailer}`;

  return { content: [{ type: "text", text }], structuredContent: structured };
}

/**
 * Errors carry no structured payload: the SDK checks it against the tool's
 * declared output schema, and a failure does not fit that shape.
 */
export function toToolError(error: unknown): ToolResult {
  const known =
    error instanceof ArchiveError
      ? error
      : new ArchiveError("network_error", error instanceof Error ? error.message : String(error));

  const lines = [`[${known.code}] ${known.message}`];
  if (known.details.hint) {
    lines.push(`Hint: ${known.details.hint}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

/**
 * A count and the noun it counts, agreeing.
 *
 * A sentence reading "1 of 1 items" is read as a template that was filled in
 * rather than as a measurement of anything, and a caller who distrusts the
 * sentence distrusts the number inside it.
 */
export function counted(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The form a verb takes beside a count, for the same reason. */
export function agreeing(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** A compact listing, carrying what it takes to pick one item out of many. */
export function renderItems(items: z.infer<typeof itemSummarySchema>[]): string {
  return items
    .map((item, index) => {
      const bits = [
        `${index + 1}. ${item.title ?? item.identifier}`,
        item.year === null ? "" : `(${item.year})`,
        item.creator ? `· ${item.creator}` : "",
        item.media_type ? `· ${item.media_type}` : "",
        `· id: ${item.identifier}`,
      ];
      // The address goes on its own line: a client that renders only text has
      // nothing else to cite from, and a model with an identifier and no link
      // will build one.
      return `${bits.filter(Boolean).join(" ")}\n   ${item.source_url}`;
    })
    .join("\n");
}

/** Wording used wherever scanned text reaches the caller. */
export const OCR_CAVEAT =
  "Excerpts are the text a machine read off the scanned page, so misreadings are normal and words may be wrong. Quote them as such, and follow source_url to check the page itself.";

/** How to write the argument, said the same way wherever an address is refused. */
const ADDRESS_HINT = "Pass one address, such as 'lemonde.fr' or 'https://lemonde.fr/'.";

/**
 * An address as the caller typed it, refused when it cannot be one.
 *
 * A control character inside an address is dropped or trimmed somewhere between
 * here and the index, which then answers about whatever address survived.
 * Refusing keeps a capture of another page from arriving under the wording that
 * was typed.
 *
 * A value that names no site is refused for a second reason: the capture index
 * answers such a lookup with no capture, in the very shape of an address it has
 * never visited, and the tools render that as an absence. An absence is a
 * statement about what the Wayback Machine holds, and this one would be about a
 * mistake in the argument.
 */
export function readAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || CONTROL_CHARACTER.test(trimmed)) {
    throw invalidInput(
      `"${value.replace(/[\u0000-\u001f\u007f]/g, "\u2423")}" carries a character an address cannot hold, such as a line break or a tab.`,
      ADDRESS_HINT,
    );
  }

  // Everything before the first slash, question mark or hash is the host, which
  // is the part the index resolves. A host is a name carrying a dot, a numeric
  // address, or the machine this server runs on; anything else names no site.
  const host = (trimmed.replace(SCHEME, "").split(HOST_END)[0] ?? "")
    .replace(USER_INFO, "")
    .replace(PORT, "");
  const namesASite = host === "localhost" || NUMERIC_HOST.test(host) || DOTTED_NAME.test(host);
  if (!namesASite) {
    throw invalidInput(
      `"${trimmed}" does not name a web address, so there is nothing here to look up.`,
      ADDRESS_HINT,
    );
  }

  return trimmed;
}

/**
 * Whether a capture is of the address that was asked about.
 *
 * The Wayback Machine resolves a lookup across the address forms it holds and
 * answers with a capture of whichever it chose. A caller who typed no scheme
 * asked about neither http nor https, so the scheme is left out of the
 * comparison in that case alone; everything else is compared as written, since
 * the index keeps those forms as separate addresses with separate histories.
 * A port the scheme implies names the same address as no port at all, and the
 * index writes older captures with it.
 */
export function sameAddress(asked: string, captured: string): boolean {
  const withoutDefaultPort = (value: string) => value.replace(DEFAULT_PORT, "$1");
  const tidy = (value: string) =>
    withoutDefaultPort(value.trim().toLowerCase()).replace(TRAILING_SLASHES, "");
  const withoutScheme = (value: string) => value.replace(LOWERCASE_SCHEME, "");
  const a = tidy(asked);
  const c = tidy(captured);
  return LOWERCASE_SCHEME.test(a) ? a === c : withoutScheme(a) === withoutScheme(c);
}

/**
 * What to say about a page holding no rows while the search matched some.
 *
 * A page past the end arrives in exactly the shape of a search that matched
 * nothing, and rendering it as an empty catalogue turns the caller's own paging
 * into a statement about what the source holds. Null when the page is within
 * range, so the wording travels only where it applies.
 */
export function pastLastPage(total: number, limit: number, page: number): string | null {
  if (total <= 0) {
    return null;
  }
  const last = Math.ceil(total / limit);
  if (page <= last) {
    return null;
  }
  return `Page ${page} is past the last page holding rows: ${total} match(es) at ${limit} per page fill ${last} page(s). This page is empty because of where it sits, and the matches are on the pages before it.`;
}
