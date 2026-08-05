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
import { ok, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const searchBooksDescription = [
  "Find a book on Open Library, the Internet Archive's catalogue of works, by title, author or subject.",
  "Answers who wrote a book, when it first appeared and how many editions exist, which the item catalogue describes poorly because it holds one upload at a time.",
  "'archive_identifiers' lists scans of the work: pass one to get_item, or use it to read the book itself.",
  "Use this to identify a work, and search_inside to find a phrase within one.",
].join(" ");

export const searchBooksInput = z.object({
  query: z.string().min(2).max(300).describe("Title, author or subject."),
  limit: z.number().int().min(1).max(50).default(10),
  page: z.number().int().min(1).max(100).default(1),
});

export const searchBooksOutput = z.object({
  query: z.string(),
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
    const { data, cached, skipped } = await client.searchBooks(args.query, args.limit, args.page);

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
        ? `No work found for "${args.query}".`
        : `${books.length} of ${data.total} works for "${args.query}":\n` +
          books
            .map((book, index) => {
              const bits = [
                `${index + 1}. ${book.title}`,
                book.authors.length > 0 ? `· ${book.authors.join(", ")}` : "",
                book.first_published_year === null ? "" : `(${book.first_published_year})`,
                book.edition_count === null ? "" : `· ${book.edition_count} editions`,
                book.archive_identifiers.length > 0
                  ? `· ${book.archive_identifiers.length} scan(s)`
                  : "· no scan",
              ];
              return `${bits.filter(Boolean).join(" ")}\n   ${book.source_url}`;
            })
            .join("\n");

    return ok({ query: args.query, total: data.total, page: args.page, books, notes }, body, {
      notes,
    });
  } catch (error) {
    return toToolError(error);
  }
}
