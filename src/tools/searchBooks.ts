/**
 * search_books: find a work, its author and its editions.
 *
 * The catalogue records what was uploaded, which for books means one scan of
 * one edition, described however the uploader chose. Open Library records the
 * work itself, so this is what turns an excerpt into a citation: which book,
 * whose, from when, and which scans hold it.
 */

import { z } from "zod";
import type { ArchiveClient } from "../ia/client.js";
import { invalidInput } from "../errors.js";
import { ok, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const searchBooksDescription = [
  "Find a book on Open Library, the Internet Archive's catalogue of works, either by name or by description.",
  "Pass 'query' when you know what you are looking for: a title, an author.",
  "Pass the criteria instead when you do not, and they combine: 'subject' for what a work is catalogued under, 'place' for where it is set, 'time' for the period it treats, 'person' for who it is about, plus ranges on the year of first publication and on the page count.",
  "'sort' by rating or by readers answers 'what is worth reading', which relevance alone does not.",
  "Answers who wrote a book, when it first appeared and how many editions exist, which the item catalogue describes poorly because it holds one upload at a time.",
  "'archive_identifiers' lists scans of the work: pass one to get_item, or use it to read the book itself.",
  "Use this to identify a work, and search_inside to find a phrase within one.",
].join(" ");

export const searchBooksInput = z.object({
  query: z
    .string()
    .min(2)
    .max(300)
    .optional()
    .describe("Title or author, as free text. Optional when a criterion below is given."),
  subject: z
    .string()
    .min(2)
    .max(100)
    .optional()
    .describe(
      "What the work is catalogued under, such as 'grief' or 'spy stories'. Also carries prizes and lists, such as 'Booker Prize'.",
    ),
  place: z
    .string()
    .min(2)
    .max(100)
    .optional()
    .describe("Where the work is set, such as 'Shanghai'."),
  time: z
    .string()
    .min(2)
    .max(100)
    .optional()
    .describe("The period the work treats, such as '20th century'."),
  person: z
    .string()
    .min(2)
    .max(100)
    .optional()
    .describe("Who the work is about, such as 'Napoleon'."),
  language: z
    .string()
    .min(2)
    .max(20)
    .optional()
    .describe("Three-letter code of the language, such as 'eng' or 'fre'."),
  year_from: z.number().int().min(1).max(2200).optional().describe("Earliest first publication."),
  year_to: z.number().int().min(1).max(2200).optional().describe("Latest first publication."),
  pages_min: z.number().int().min(1).max(100_000).optional().describe("Shortest acceptable work."),
  pages_max: z
    .number()
    .int()
    .min(1)
    .max(100_000)
    .optional()
    .describe("Longest acceptable work. The count is a median across editions."),
  sort: z
    .enum(["relevance", "rating", "readers", "newest", "oldest"])
    .default("relevance")
    .describe(
      "'rating' is how readers scored it, 'readers' is how many recorded reading it, and both answer a question relevance cannot.",
    ),
  limit: z.number().int().min(1).max(50).default(10),
  page: z.number().int().min(1).max(100).default(1),
});

export const searchBooksOutput = z.object({
  query: z.string().describe("What was searched for, criteria included."),
  total: z.number().int().describe("Works matching, not the number returned."),
  page: z.number().int(),
  books: z.array(
    z.object({
      title: z.string(),
      authors: z.array(z.string()),
      first_published_year: z.number().int().nullable(),
      edition_count: z.number().int().nullable(),
      archive_identifiers: z
        .array(z.string())
        .describe("Scans of this work held by the Archive. Pass one to get_item."),
      page_count: z
        .number()
        .int()
        .nullable()
        .describe("Median pages across editions, which is what the index holds."),
      subjects: z
        .array(z.string())
        .describe("What the work is catalogued under, trimmed to the most prominent."),
      source_url: z.string(),
    }),
  ),
  notes: z.array(z.string()),
});

export type SearchBooksArgs = z.infer<typeof searchBooksInput>;

export async function runSearchBooks(
  client: ArchiveClient,
  args: SearchBooksArgs,
): Promise<ToolResult> {
  try {
    const criteria = {
      ...(args.query ? { query: args.query } : {}),
      ...(args.subject ? { subject: args.subject } : {}),
      ...(args.place ? { place: args.place } : {}),
      ...(args.time ? { time: args.time } : {}),
      ...(args.person ? { person: args.person } : {}),
      ...(args.language ? { language: args.language } : {}),
      ...(args.year_from === undefined ? {} : { year_from: args.year_from }),
      ...(args.year_to === undefined ? {} : { year_to: args.year_to }),
      ...(args.pages_min === undefined ? {} : { pages_min: args.pages_min }),
      ...(args.pages_max === undefined ? {} : { pages_max: args.pages_max }),
      sort: args.sort,
    };

    // Every criterion is optional on its own, so nothing in the schema stops a
    // call that names none of them. Open Library answers such a query with its
    // whole catalogue, which would read as a result rather than as a mistake.
    if (Object.keys(criteria).length === 1) {
      throw invalidInput(
        "Give something to search for.",
        "Pass 'query' for a title or an author, or one of 'subject', 'place', 'time', 'person' or 'language', or a year or page range.",
      );
    }

    if (
      args.year_from !== undefined &&
      args.year_to !== undefined &&
      args.year_from > args.year_to
    ) {
      throw invalidInput(
        `year_from=${args.year_from} is after year_to=${args.year_to}, so no work can match.`,
        "Put the earlier year in 'year_from'.",
      );
    }
    if (
      args.pages_min !== undefined &&
      args.pages_max !== undefined &&
      args.pages_min > args.pages_max
    ) {
      throw invalidInput(
        `pages_min=${args.pages_min} is above pages_max=${args.pages_max}, so no work can match.`,
        "Put the smaller count in 'pages_min'.",
      );
    }

    const asked = describeCriteria(args);
    const { data, cached, skipped } = await client.searchBooks(criteria, args.limit, args.page);

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");
    if (skipped) {
      notes.push(`${skipped} work(s) came back without a title or a key and were left out.`);
    }

    const books = data.books.map((book) => ({
      title: book.title,
      authors: book.authors,
      first_published_year: book.firstPublishedYear,
      edition_count: book.editionCount,
      archive_identifiers: book.archiveIdentifiers,
      page_count: book.pageCount,
      subjects: book.subjects,
      source_url: book.sourceUrl,
    }));

    if (data.total > books.length) {
      notes.push(`${data.total} works match and ${books.length} are shown.`);
    }
    if (books.length > 0 && books.every((book) => book.archive_identifiers.length === 0)) {
      notes.push(
        "None of these works has a scan on the Archive, so there is nothing here to read or to search inside.",
      );
    }

    const body =
      books.length === 0
        ? `No work found for ${asked}.`
        : `${books.length} of ${data.total} works for ${asked}:\n` +
          books
            .map((book, index) => {
              const bits = [
                `${index + 1}. ${book.title}`,
                book.authors.length > 0 ? `· ${book.authors.join(", ")}` : "",
                book.first_published_year === null ? "" : `(${book.first_published_year})`,
                book.edition_count === null ? "" : `· ${book.edition_count} editions`,
                book.page_count === null ? "" : `· ${book.page_count} p.`,
                book.archive_identifiers.length > 0
                  ? `· ${book.archive_identifiers.length} scan(s)`
                  : "· no scan",
              ];
              return `${bits.filter(Boolean).join(" ")}\n   ${book.source_url}`;
            })
            .join("\n");

    return ok({ query: asked, total: data.total, page: args.page, books, notes }, body, {
      notes,
    });
  } catch (error) {
    return toToolError(error);
  }
}

/**
 * What was asked for, in words.
 *
 * A search by criteria has no free-text query to echo, and a result headed
 * `works for "undefined"` says nothing about what produced it. This names the
 * criteria instead, so the answer states its own question.
 */
function describeCriteria(args: SearchBooksArgs): string {
  const parts: string[] = [];
  if (args.query) parts.push(`"${args.query}"`);
  if (args.subject) parts.push(`subject "${args.subject}"`);
  if (args.place) parts.push(`set in "${args.place}"`);
  if (args.time) parts.push(`about "${args.time}"`);
  if (args.person) parts.push(`about "${args.person}"`);
  if (args.language) parts.push(`in ${args.language}`);
  if (args.year_from !== undefined || args.year_to !== undefined) {
    parts.push(`published ${args.year_from ?? "any time"} to ${args.year_to ?? "now"}`);
  }
  if (args.pages_min !== undefined || args.pages_max !== undefined) {
    parts.push(`${args.pages_min ?? 1} to ${args.pages_max ?? "any"} pages`);
  }
  if (args.sort !== "relevance") parts.push(`by ${args.sort}`);
  return parts.join(", ");
}
