/**
 * search_items: find things in the catalogue by title, creator or subject.
 *
 * The Archive holds tens of millions of items across every medium, so the
 * filters matter more than the query: without a media type, a search for a film
 * returns the book, the soundtrack and the fan upload alongside it.
 */

import { z } from "zod";
import type { ArchiveClient } from "../ia/client.js";
import { strictInput } from "./arguments.js";
import { itemSummarySchema, ok, renderItems, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const searchItemsDescription = [
  "Search the Internet Archive catalogue: films, books, recordings, images, software and datasets.",
  "This matches titles, creators and descriptions, so a compilation whose notes mention a name ranks alongside that person's own work: read 'creator' on each row before treating a result as theirs. It does not read the contents of a scan; use search_inside for a phrase within a book.",
  "Set 'media_type' whenever the kind of thing is known, because one title exists across several media and mixing them makes a result list unreadable.",
  "Every row carries an 'identifier', which get_item takes.",
].join(" ");

export const searchItemsInput = strictInput({
  query: z
    .string()
    .min(1)
    .max(300)
    .describe("Words to look for in titles, creators and descriptions."),
  media_type: z
    .enum(["texts", "movies", "audio", "image", "software", "data", "web"])
    .optional()
    .describe("Narrow to one kind of thing. Strongly recommended."),
  year_from: z.number().int().min(1).max(2200).optional().describe("Earliest year, inclusive."),
  year_to: z.number().int().min(1).max(2200).optional().describe("Latest year, inclusive."),
  sort: z
    .enum(["relevance", "downloads", "newest", "oldest", "title"])
    .default("relevance")
    .describe(
      "'downloads' surfaces what people actually read, which relevance alone often buries.",
    ),
  limit: z.number().int().min(1).max(50).default(10),
  page: z.number().int().min(1).max(100).default(1),
});

export const searchItemsOutput = z.object({
  query: z.string(),
  total: z.number().int().describe("Items matching across the catalogue, not the number returned."),
  page: z.number().int(),
  items: z.array(itemSummarySchema),
  notes: z.array(z.string()),
});

export type SearchItemsArgs = z.infer<typeof searchItemsInput>;

export async function runSearchItems(
  client: ArchiveClient,
  args: SearchItemsArgs,
): Promise<ToolResult> {
  try {
    if (
      args.year_from !== undefined &&
      args.year_to !== undefined &&
      args.year_from > args.year_to
    ) {
      return toToolError(
        new Error(`year_from ${args.year_from} is later than year_to ${args.year_to}.`),
      );
    }

    const { data, cached, skipped } = await client.searchItems({
      query: args.query,
      ...(args.media_type ? { mediaType: args.media_type } : {}),
      ...(args.year_from !== undefined ? { yearFrom: args.year_from } : {}),
      ...(args.year_to !== undefined ? { yearTo: args.year_to } : {}),
      sort: args.sort,
      limit: args.limit,
      page: args.page,
    });

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");
    if (skipped) {
      notes.push(
        `${skipped} row(s) came back in a shape this server could not read and were left out.`,
      );
    }

    const items = data.items.map((item) => ({
      identifier: item.identifier,
      title: item.title,
      creator: item.creator,
      year: item.year,
      media_type: item.mediaType,
      downloads: item.downloads,
      source_url: item.sourceUrl,
    }));

    if (data.total > items.length) {
      notes.push(`${data.total} items match and ${items.length} are shown.`);
    }
    if (items.length > 0) {
      notes.push(
        "A match can name the query in its description rather than being the thing itself, and nothing in a row distinguishes the two. Check 'creator', or read the item, before attributing a result.",
      );
    }
    if (data.total === 0) {
      notes.push(
        "Nothing in the catalogue matches. A search here reads titles and descriptions only, so a phrase from inside a book belongs in search_inside.",
      );
    }
    if (!args.media_type && items.length > 1) {
      const kinds = new Set(items.map((item) => item.media_type).filter(Boolean));
      if (kinds.size > 1) {
        notes.push(
          `These results mix ${[...kinds].join(", ")}. Set 'media_type' to keep one kind.`,
        );
      }
    }

    const body =
      items.length === 0
        ? `Nothing in the catalogue for "${args.query}".`
        : `${items.length} of ${data.total} items for "${args.query}":\n${renderItems(items)}`;

    return ok({ query: args.query, total: data.total, page: args.page, items, notes }, body, {
      notes,
    });
  } catch (error) {
    return toToolError(error);
  }
}
