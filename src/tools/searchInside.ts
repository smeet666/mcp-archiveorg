/**
 * search_inside: find a phrase in the text of scanned pages.
 *
 * This is the question no catalogue can answer. The index holds what optical
 * recognition read off millions of digitised pages, so a match comes back with
 * the book, the page, and the words around it.
 */

import { z } from "zod";
import type { ArchiveClient } from "../ia/client.js";
import { OCR_CAVEAT, ok, toToolError, truncate } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const searchInsideDescription = [
  "Search the text inside digitised books, newspapers and documents on the Internet Archive.",
  "This reads what optical recognition took off the scanned pages, so it finds a phrase that appears nowhere in a title or a catalogue record.",
  "Put a phrase in double quotes to match it whole; without quotes the words are matched separately, which finds far more.",
  "'total' counts the documents that match, and they page: ask for page 2, 3 and so on to see beyond the first answer. It is not a count of how many times the phrase occurs.",
  "The index reports no page number, so a match names the item and the passage, never a leaf. Follow source_url and search the item to find where the passage sits.",
  "When 'inside_container' is true the passage came from a document bundled inside the item, and the title, creator and year describe the container rather than the text that matched: read 'matched_file' for what actually holds it.",
  "Use search_items or search_books instead when looking for a work by its title, author or subject.",
].join(" ");

export const searchInsideInput = z.object({
  query: z
    .string()
    .min(2)
    .max(300)
    .describe("Words or a quoted phrase, such as '\"call me ishmael\"'."),
  limit: z.number().int().min(1).max(50).default(10).describe("Matches to return."),
  page: z.number().int().min(1).max(100).default(1).describe("Which page of matches, from 1."),
  max_excerpt_chars: z
    .number()
    .int()
    .min(80)
    .max(1200)
    .default(300)
    .describe(
      "Budget for one passage. Read it together with 'max_excerpts_per_match': the size of the answer is the product of the two and the number of matches.",
    ),
  max_excerpts_per_match: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe(
      "Passages to keep per match. The index finds several in a long work, and the later ones rarely say anything the first did not.",
    ),
});

export const searchInsideOutput = z.object({
  query: z.string(),
  total: z
    .number()
    .int()
    .describe(
      "Documents that match, not the number returned and not a count of occurrences. Raise 'page' to read further into it.",
    ),
  page: z.number().int(),
  hits: z.array(
    z.object({
      identifier: z.string().describe("Pass to get_item for the record."),
      title: z.string().nullable(),
      creator: z.string().nullable(),
      year: z.number().int().nullable(),
      matched_file: z
        .string()
        .nullable()
        .describe(
          "The document the passage was found in, when the item bundles several. Null when the item is the document itself.",
        ),
      inside_container: z
        .boolean()
        .describe(
          "True when the passage comes from a document bundled inside the item, in which case the title, creator and year above describe the container and not the text that matched.",
        ),
      excerpts: z.array(z.string()).describe("Passages as a machine read them off the page."),
      source_url: z.string(),
    }),
  ),
  notes: z.array(z.string()),
});

export type SearchInsideArgs = z.infer<typeof searchInsideInput>;

export async function runSearchInside(
  client: ArchiveClient,
  args: SearchInsideArgs,
): Promise<ToolResult> {
  try {
    const { data, cached, skipped } = await client.searchInside(args.query, args.limit, args.page);
    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");
    if (skipped) {
      notes.push(
        `${skipped} match(es) came back in a shape this server could not read and were left out. The count above is what the Archive reported.`,
      );
    }

    let passagesDropped = 0;
    const hits = data.hits.map((hit) => {
      if (hit.excerpts.length > args.max_excerpts_per_match) {
        passagesDropped += hit.excerpts.length - args.max_excerpts_per_match;
      }
      return {
        identifier: hit.identifier,
        title: hit.title,
        creator: hit.creator,
        year: hit.year,
        matched_file: hit.matchedFile,
        inside_container: hit.insideContainer,
        excerpts: hit.excerpts
          .slice(0, args.max_excerpts_per_match)
          .map((excerpt) => truncate(excerpt, args.max_excerpt_chars)),
        source_url: hit.sourceUrl,
      };
    });

    if (passagesDropped > 0) {
      notes.push(
        `${passagesDropped} further passage(s) were left out, at ${args.max_excerpts_per_match} per match. Raise 'max_excerpts_per_match' to see more of what each match holds.`,
      );
    }

    if (hits.length > 0) notes.push(OCR_CAVEAT);
    if (data.total > hits.length) {
      notes.push(
        `${data.total} documents match and ${hits.length} are shown. Ask for page ${args.page + 1} to continue: this count pages, so the answer in hand is not the whole of it.`,
      );
    }
    if (data.total === 0) {
      notes.push(
        "No digitised document carries this phrase. An unquoted query matches the words separately, which usually finds more.",
      );
    }

    if (hits.length === 0 && data.total > 0) {
      notes.push(
        `Page ${args.page} is past the last match. ${data.total} documents match, so ask for a lower page.`,
      );
    }

    const body =
      hits.length === 0
        ? data.total > 0
          ? `Page ${args.page} is past the last of ${data.total} documents containing ${args.query}.`
          : `Nothing found inside the scans for ${args.query}.`
        : `${hits.length} of ${data.total} documents containing ${args.query}:\n` +
          hits
            .map((hit, index) => {
              const where = [
                `${index + 1}. ${hit.title ?? hit.identifier}`,
                hit.year === null ? "" : `(${hit.year})`,
                hit.inside_container && hit.matched_file ? `· in ${hit.matched_file}` : "",
              ]
                .filter(Boolean)
                .join(" ");
              const passages = hit.excerpts.map((excerpt) => `     ${excerpt}`).join("\n");
              return `${where}\n${passages}\n     ${hit.source_url}`;
            })
            .join("\n");

    return ok({ query: args.query, total: data.total, page: args.page, hits, notes }, body, {
      notes,
    });
  } catch (error) {
    return toToolError(error);
  }
}
