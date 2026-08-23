/**
 * search_items: find things in the catalogue by title, creator or subject.
 *
 * The Archive holds tens of millions of items across every medium, so the
 * filters matter more than the query: without a media type, a search for a film
 * returns the book, the soundtrack and the fan upload alongside it.
 */

import { z } from "zod";
import type { ArchiveClient } from "../ia/client.js";
import { foldAmpersands } from "../ia/urls.js";
import { strictInput } from "./arguments.js";
import {
  MOST_PAGES,
  agreeing,
  counted,
  itemSummarySchema,
  ok,
  pastLastPage,
  renderItems,
  toToolError,
} from "./shared.js";
import type { ToolResult } from "./shared.js";

/**
 * Why a page of rows came back empty.
 *
 * A page past the last one and a catalogue holding nothing are different
 * statements about the Archive.
 */
function nothingOnThisPage(total: number, page: number, query: string): string {
  if (total > 0) {
    return `No row on page ${page} for "${query}", of ${counted(total, "item")} matching.`;
  }
  return `Nothing in the catalogue for "${query}".`;
}

/**
 * What ordering by date, or narrowing to a span of years, rests on.
 *
 * Both read the same catalogue field, so either one turns the answer into a
 * claim about that field: which rows were kept, or which came first. The field
 * is declared by whoever deposited the item and this server holds no way to
 * check it, so what it cannot carry travels with any answer resting on it,
 * rather than the rows being reordered or filtered on a value the source does
 * not hold.
 */
function notesOnTheOrderAndTheRange(
  items: ReadonlyArray<{ year: number | null }>,
  args: { sort: string; year_from?: number | undefined; year_to?: number | undefined },
): string[] {
  const notes: string[] = [];

  // A date order and a year range read the same catalogue field, so either
  // one turns the answer into a claim about that field: which rows were kept,
  // or which came first. The field is declared by whoever deposited the item
  // and the server holds no way to check it, so what it cannot carry travels
  // with any answer resting on it, rather than being reordered or filtered
  // out on a value the source does not hold.
  const orderedByDate = args.sort === "oldest" || args.sort === "newest";
  const rangeAsked = args.year_from !== undefined || args.year_to !== undefined;
  const undated = items.filter((item) => item.year === null).length;
  if (items.length > 0 && orderedByDate) {
    notes.push(
      args.sort === "oldest"
        ? "'oldest' ranks on the catalogue's date field, which whoever deposited an item typed in."
        : "'newest' ranks on the catalogue's date field, which whoever deposited an item typed in. A date typed centuries ahead of now is as real to the index as any other, so items carrying one head this order rather than recent ones.",
    );
    // The rows a placeholder or a fragment puts at the head of the order are
    // the rows carrying no year this server can read. A page holding none of
    // them is a page this explains nothing on.
    if (args.sort === "oldest" && undated > 0) {
      notes.push(
        'Two kinds of row head this order without being early: an item the Archive holds no date for carries a placeholder at the very start of the calendar, and an item whose date is a fragment such as "15" for a fifteenth-century manuscript is filed at the year 15. The index sorts both as real dates.',
      );
    }
  }
  if (items.length > 0 && rangeAsked) {
    notes.push(
      "'year_from' and 'year_to' filter the catalogue's date field, which whoever deposited an item typed in. A row is here because that field fell in the range, which is a different claim from the item having been made then.",
    );
  }
  if (items.length > 0 && (orderedByDate || rangeAsked)) {
    const readsTwoWays =
      (rangeAsked && (args.year_from ?? 1) < ERA_READS_TWO_WAYS_BEFORE) ||
      items.some((item) => item.year !== null && item.year < ERA_READS_TWO_WAYS_BEFORE);
    if (readsTwoWays) {
      notes.push(
        "That field carries no era: a date before the common era is stored as a year of it, so an object made in 1744 BCE reads as 1744, and a Babylonian tablet answers a search of the eighteenth century. Check a row against its source_url before dating what it holds.",
      );
    }
    if (undated > 0) {
      notes.push(
        `${undated} of the ${items.length} rows shown carry no year this server could read, so nothing on those rows shows the date the catalogue filed them under` +
          (orderedByDate
            ? ", nor supports the place they hold in this order."
            : ", nor shows them falling in the range asked for."),
      );
    }
  }

  // The index matches the text a record files, and that text is handed back
  // read: the characters an escape names, the words a tag holds. A row whose
  // filed title carries the words searched for while the title shown does not
  // is a row with nothing on it to say why it is in the list.

  return notes;
}

/**
 * What the rows show, and what their shape does not say.
 *
 * The Archive files a title one way and shows it another, pages a count it
 * publishes, and mixes kinds of material in one answer unless asked otherwise.
 * A row absent from a page is not a row absent from the catalogue.
 */
function notesOnWhatTheRowsShow(
  data: {
    total: number;
    items: ReadonlyArray<{ title?: string | null; titleAsFiled?: string | null }>;
  },
  args: { query: string; media_type?: string | undefined },
  items: ReadonlyArray<{ media_type?: string | null }>,
): string[] {
  const notes: string[] = [];

  const searchedWords = args.query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const matchedInFiledTitle = data.items.filter((item) => {
    const filed = item.titleAsFiled?.toLowerCase();
    if (!filed) {
      return false;
    }
    const shown = (item.title ?? "").toLowerCase();
    return searchedWords.some((word) => filed.includes(word) && !shown.includes(word));
  }).length;
  if (matchedInFiledTitle > 0) {
    notes.push(
      `${counted(matchedInFiledTitle, "row")} here ${agreeing(matchedInFiledTitle, "carries", "carry")} the words searched for in the text the record files rather than in the title shown: a title written with escapes such as "&nbsp;", or with markup, is handed back as the characters and the words those stand for.`,
    );
  }

  if (data.total > items.length) {
    notes.push(
      `${counted(data.total, "item")} ${agreeing(data.total, "matches", "match")} and ${items.length} ${agreeing(items.length, "is", "are")} shown.`,
    );
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
      notes.push(`These results mix ${[...kinds].join(", ")}. Set 'media_type' to keep one kind.`);
    }
  }

  // An empty page and an empty catalogue arrive in the same shape, and only
  // the total tells them apart, so the rendered line branches on it rather
  // than on the rows.

  return notes;
}

/**
 * The first year on which a date reads one way only.
 *
 * The catalogue's date field carries no era, so a year in it names two things
 * at once: something made that many years before the common era, and something
 * made in that year of it. The Internet Archive has been taking deposits since
 * 1996, and the years from then on are filled by things deposited as it
 * collected them, so an answer resting on those years alone rests on no date
 * the era can turn around. The caveat travels where it can change a reading,
 * because one carried by every answer is read on none of them.
 */
const ERA_READS_TWO_WAYS_BEFORE = 1996;

export const searchItemsDescription = [
  "Search the Internet Archive catalogue: films, books, recordings, images, software and datasets.",
  "This matches titles, creators and descriptions, so a compilation whose notes mention a name ranks alongside that person's own work: read 'creator' on each row before treating a result as theirs. It does not read the contents of a scan; use search_inside for a phrase within a book.",
  "Set 'media_type' whenever the kind of thing is known, because one title exists across several media and mixing them makes a result list unreadable.",
  "'oldest', 'newest', 'year_from' and 'year_to' all read one field: the date a depositor typed into the record. An item with no date carries a placeholder the index sorts as a real one, a date written as a fragment is filed at the year that fragment reads as, and the field holds no era, so a Babylonian tablet of 1712 BCE answers a search of 1700 to 1750. Read an order or a range as a statement about that field.",
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
  year_from: z
    .number()
    .int()
    .min(1)
    .max(2200)
    .optional()
    .describe("Earliest year, inclusive, on the record's declared date, which carries no era."),
  year_to: z
    .number()
    .int()
    .min(1)
    .max(2200)
    .optional()
    .describe("Latest year, inclusive, on the record's declared date, which carries no era."),
  sort: z
    .enum(["relevance", "downloads", "newest", "oldest", "title"])
    .default("relevance")
    .describe(
      "'downloads' surfaces what people actually read, which relevance alone often buries. 'oldest' and 'newest' rank on a declared date, not on when a thing was made.",
    ),
  limit: z.number().int().min(1).max(50).default(10),
  page: z.number().int().min(1).max(MOST_PAGES).default(1),
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
      ...(args.year_from === undefined ? {} : { yearFrom: args.year_from }),
      ...(args.year_to === undefined ? {} : { yearTo: args.year_to }),
      sort: args.sort,
      limit: args.limit,
      page: args.page,
    });

    const notes: string[] = [];
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }
    // The words that reached the catalogue are not always the words that were
    // typed, and a caller reading the rows against the query has no other way
    // of knowing which of the two they are looking at.
    const { query: asSent, folded } = foldAmpersands(args.query);
    if (folded.length > 0) {
      notes.push(
        `The catalogue's query parser refuses an ampersand written against a word, and ${folded.join(", ")} carries one, so the words sent were ${asSent}. The index folds punctuation before it matches, so the records printing the ampersand are what this finds.`,
      );
    }
    const outOfRange = pastLastPage(data.total, args.limit, args.page);
    if (outOfRange) {
      notes.push(outOfRange);
    }
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

    notes.push(...notesOnTheOrderAndTheRange(items, args));

    notes.push(...notesOnWhatTheRowsShow(data, args, items));

    const body =
      items.length > 0
        ? `${items.length} of ${counted(data.total, "item")} for "${args.query}":\n${renderItems(items)}`
        : nothingOnThisPage(data.total, args.page, args.query);

    return ok({ query: args.query, total: data.total, page: args.page, items, notes }, body, {
      notes,
    });
  } catch (error) {
    return toToolError(error);
  }
}
