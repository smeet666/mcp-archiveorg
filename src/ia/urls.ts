/**
 * Builders for every address the client fetches.
 *
 * Query strings are assembled here so no caller can smuggle a parameter past
 * the trimming: the set of fields a search asks for is decided by this file,
 * not by whoever calls the tool.
 */

import { BACKEND, BOOK_FIELD, HOST, HIT_FIELD, ROUTE, SORT } from "./paths.js";

function withQuery(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export interface CatalogueQuery {
  query: string;
  mediaType?: string;
  yearFrom?: number;
  yearTo?: number;
  sort?: keyof typeof SORT;
  limit: number;
  page: number;
}

/**
 * The catalogue accepts a Lucene expression, and the filters are folded into
 * the query itself. The caller's words are parenthesised so those filters
 * combine with the whole of what was asked rather than with its last clause.
 * Lucene syntax inside the words is passed through, so a colon or a bracket is
 * read as an operator: the site answers a malformed expression with an error
 * the parsers turn into `invalid_input` rather than into an empty result.
 */
export function catalogueUrl(q: CatalogueQuery): string {
  const clauses = [`(${q.query})`];
  if (q.mediaType) clauses.push(`mediatype:${q.mediaType}`);
  if (q.yearFrom !== undefined || q.yearTo !== undefined) {
    const from = q.yearFrom ?? "*";
    const to = q.yearTo ?? "*";
    clauses.push(`year:[${from} TO ${to}]`);
  }

  const sort = q.sort ? SORT[q.sort] : "";
  const url = new URL(HOST.archive + ROUTE.search);
  url.searchParams.set("service_backend", BACKEND.catalogue);
  url.searchParams.set("user_query", clauses.join(" AND "));
  url.searchParams.set("hits_per_page", String(q.limit));
  url.searchParams.set("page", String(q.page));
  url.searchParams.set("aggregations", "false");
  if (sort) url.searchParams.append("sort[]", sort);
  for (const field of Object.values(HIT_FIELD)) url.searchParams.append("fields[]", field);
  return url.toString();
}

export function insideUrl(query: string, limit: number, page: number): string {
  const url = new URL(HOST.archive + ROUTE.search);
  url.searchParams.set("service_backend", BACKEND.inside);
  url.searchParams.set("user_query", query);
  url.searchParams.set("hits_per_page", String(limit));
  url.searchParams.set("page", String(page));
  url.searchParams.set("aggregations", "false");
  return url.toString();
}

export const metadataUrl = (identifier: string) =>
  `${HOST.archive}${ROUTE.metadata}${encodeURIComponent(identifier)}`;

/**
 * The nearest-capture route takes the Archive's own stamp format, so a caller's
 * date is converted here rather than at the tool layer.
 */
export const nearestUrl = (target: string, timestamp?: string) =>
  withQuery(HOST.archive + ROUTE.nearest, { url: target, timestamp });

/**
 * A window of the capture index, and the key that opens the next one.
 *
 * The index holds one row per capture and a busy address has hundreds of
 * thousands, so a window is what makes this route answerable at all. It counts
 * rows rather than positions: the way onwards is the key it hands back with
 * each answer, which encodes where the scan stopped.
 */
export const historyUrl = (target: string, limit: number, cursor?: string) =>
  withQuery(HOST.wayback + ROUTE.index, {
    url: target,
    output: "json",
    limit,
    showResumeKey: "true",
    resumeKey: cursor,
    // Repeat captures of an unchanged page say nothing new.
    collapse: "digest",
    fl: "timestamp,original,statuscode",
  });

export const booksUrl = (query: string, limit: number, page: number) =>
  withQuery(HOST.openLibrary + ROUTE.books, {
    q: query,
    limit,
    page,
    fields: Object.values(BOOK_FIELD).join(","),
  });

/** The Archive stamps captures as YYYYMMDDhhmmss, in UTC. */
export function toArchiveStamp(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/** Reads a stamp back, returning null rather than an invalid date. */
export function fromArchiveStamp(stamp: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(stamp.trim());
  if (!m) return null;
  const date = new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
