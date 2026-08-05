/** Schemas, error mapping and rendering shared by the six tools. */

import { z } from "zod";
import { ArchiveError } from "../errors.js";

/**
 * The text block is what many clients render, and some render nothing else, so
 * it has to answer on its own. This ceiling is what keeps a search of a corpus
 * of millions from arriving as a wall of scanned text.
 */
export const MAX_TEXT_CHARS = 2200;

export const ATTRIBUTION = "Source: Internet Archive";

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
  media_type: z.string().nullable().describe("texts, movies, audio, image, software or data."),
  downloads: z.number().int().nullable(),
  source_url: z.string().describe("Public page. Show this when citing the item."),
});

export const snapshotSchema = z.object({
  captured_at: z.string().describe("ISO 8601, in UTC."),
  url: z.string().describe("The capture itself, readable as it was on that date."),
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
  while (noteLines.length > 0 && noteLines.join("\n").length > MAX_TEXT_CHARS / 2) noteLines.pop();
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
  if (known.details.hint) lines.push(`Hint: ${known.details.hint}`);
  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** A compact listing, carrying what it takes to pick one item out of many. */
export function renderItems(items: Array<z.infer<typeof itemSummarySchema>>): string {
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
