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
  "'oldest' and 'newest' rank on the date a depositor typed into the record, and an item with no date carries a placeholder the index sorts as a real one, so those orders lead with rows whose 'year' is null. The field also holds no era, so a date before the common era is filed as a year of it. Read them as an order on that field.",
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
      "'downloads' surfaces what people actually read, which relevance alone often buries. 'oldest' and 'newest' rank on a declared date, not on when a thing was made.",
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

    // An order by date is the one answer here a caller reads as a fact about
    // the world rather than about the index, so what it rests on travels with
    // it. The Archive's date is declared by whoever deposited the item, the
    // server holds no way to check it, and the tools below say so instead of
    // reordering on a value the source does not carry.
    if (items.length > 0 && (args.sort === "oldest" || args.sort === "newest")) {
      notes.push(
        args.sort === "oldest"
          ? "'oldest' ranks on the catalogue's date field, which whoever deposited an item typed in. An item the Archive holds no date for carries a placeholder at the very start of the calendar, and the index sorts that placeholder as a real date, so undated items head this order rather than early ones."
          : "'newest' ranks on the catalogue's date field, which whoever deposited an item typed in. A date typed centuries ahead of now is as real to the index as any other, so items carrying one head this order rather than recent ones.",
      );
      notes.push(
        "That field carries no era: a date before the common era is stored as a year of it, so an object made in 1744 BCE reads as 1744. Read this as the order of that field, and check a row against its source_url before calling it the oldest or the newest.",
      );
      const undated = items.filter((item) => item.year === null).length;
      if (undated > 0) {
        notes.push(
          `${undated} of the ${items.length} rows shown carry no year this server could read, so nothing on those rows supports the place they hold in this order.`,
        );
      }
    }

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
