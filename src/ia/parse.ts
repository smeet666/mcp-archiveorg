/**
 * Turning the Archive's answers into the shapes this server publishes.
 *
 * Two rules run through every function here. A response that cannot be read is
 * a `parse_failure`, never an empty result, because a caller cannot tell an
 * empty result from an absence and will report one as the other. And a single
 * unreadable row among many is skipped rather than failing the page it sat in;
 * where a parser is given a counter, the rows it dropped are reported.
 */

import { invalidInput, notFound, parseFailure } from "../errors.js";
import type {
  Book,
  InsideHit,
  InsideResults,
  ItemDetail,
  ItemFile,
  ItemSummary,
  NearestSnapshot,
  SearchResults,
  Snapshot,
  SnapshotHistory,
} from "../types.js";
import {
  BOOK_FIELD,
  MOST_SUBJECTS,
  HIT_FIELD,
  META_FIELD,
  bookUrl,
  downloadUrl,
  itemUrl,
  snapshotUrl,
} from "./paths.js";
import { decodeEntities } from "./text.js";
import { fromArchiveStamp } from "./urls.js";

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : null;

/**
 * Several fields arrive either as one value or as a list of them, depending on
 * how many the item carries. Both are read the same way.
 */
function asStrings(value: unknown): string[] {
  if (typeof value === "string") return value.trim() === "" ? [] : [value];
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return [];
}

const asString = (value: unknown): string | null => asStrings(value)[0] ?? null;

/**
 * A field the source wrote as prose, read back from any escaping it carries.
 *
 * Identifiers, file names, dates and addresses go through `asString` instead:
 * they name something the Archive addresses by that exact spelling, and reading
 * an escape in one would point at a thing that does not exist.
 */
const sourceTexts = (value: unknown): string[] => asStrings(value).map(decodeEntities);

const sourceText = (value: unknown): string | null => sourceTexts(value)[0] ?? null;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  if (Array.isArray(value)) return asNumber(value[0]);
  return null;
}

/**
 * A year reaches us as "1998", as "1998-04-03" or as a number, and sometimes as
 * nothing at all: a record with no date carries "0000-01-01" rather than an
 * empty field. Read as a year, that zero sorts ahead of every real one, so the
 * oldest recording of a work turns out to be the one nobody dated. The same
 * check therefore applies however the value was written.
 */
const PLAUSIBLE_YEAR = { first: 1000, last: 2200 } as const;

function asYear(value: unknown): number | null {
  const plausible = (year: number): number | null =>
    Number.isFinite(year) && year >= PLAUSIBLE_YEAR.first && year <= PLAUSIBLE_YEAR.last
      ? Math.trunc(year)
      : null;

  const direct = asNumber(value);
  if (direct !== null) return plausible(direct);

  const text = asString(value);
  const m = text ? /(\d{4})/.exec(text) : null;
  return m ? plausible(Number(m[1])) : null;
}

/**
 * The search route wraps its answer in an envelope carrying session, request
 * and caching blocks that are of no use to anyone here. Only the body is read,
 * and its absence is the signal that the shape has changed.
 */
function searchBody(payload: unknown, url: string): Json {
  const root = asObject(payload);
  const response = root ? asObject(root.response) : null;
  const header = response ? asObject(response.header) : null;

  // The site answers a query it will not run with HTTP 200 and no rows, so
  // reading only the rows turns "I refused this" into "there is none of it".
  if (header && header.succeeded === false) {
    const errors = Array.isArray(header.errors) ? header.errors.map(asObject) : [];
    const reason = asString(errors[0]?.message) ?? "the site did not say why";
    throw invalidInput(
      `The Internet Archive refused this query: ${reason}`,
      "Check the query syntax. A quotation mark, bracket or colon left unbalanced is read as an operator.",
    );
  }

  const body = response ? asObject(response.body) : null;
  const hits = body ? asObject(body.hits) : null;
  if (!hits) {
    throw parseFailure("The search answer did not carry the hits this server reads.", { url });
  }
  return hits;
}

/**
 * The match count, or a refusal to guess at one.
 *
 * Returning zero for a count that could not be read publishes an absence the
 * response never established, and the tools go on to say so in as many words.
 */
function hitTotal(hits: Json, url: string): number {
  const direct = asNumber(hits.total);
  if (direct !== null) return direct;
  // Some answers count in a nested object rather than a bare number.
  const nested = asObject(hits.total);
  const inner = nested ? asNumber(nested.value) : null;
  if (inner !== null) return inner;
  throw parseFailure("The search answer carried no readable count of matches.", { url });
}

function hitRows(hits: Json, url: string): Json[] {
  if (!Array.isArray(hits.hits)) {
    throw parseFailure(
      "The search answer carried its matches in a shape this server cannot read.",
      {
        url,
      },
    );
  }
  return hits.hits.map(asObject).filter((r): r is Json => r !== null);
}

export function toSearchResults(
  payload: unknown,
  url: string,
  onSkip: (n: number) => void,
): SearchResults {
  const hits = searchBody(payload, url);
  const rows = hitRows(hits, url);

  const items: ItemSummary[] = [];
  let skipped = 0;
  for (const row of rows) {
    const fields = asObject(row.fields) ?? row;
    const identifier = asString(fields[HIT_FIELD.identifier]);
    if (!identifier) {
      skipped += 1;
      continue;
    }
    items.push({
      identifier,
      title: sourceText(fields[HIT_FIELD.title]),
      creator: sourceTexts(fields[HIT_FIELD.creator]).join(", ") || null,
      year: asYear(fields[HIT_FIELD.year] ?? fields[HIT_FIELD.date]),
      mediaType: asString(fields[HIT_FIELD.mediaType]),
      downloads: asNumber(fields[HIT_FIELD.downloads]),
      sourceUrl: itemUrl(identifier),
    });
  }

  if (skipped > 0) onSkip(skipped);
  if (rows.length > 0 && items.length === 0) {
    throw parseFailure(`${rows.length} results came back and none could be read.`, { url });
  }
  // Paging follows the count the site reported, not the count that survived
  // reading: a shortened page reads as the end of the results.
  return { total: hitTotal(hits, url), items };
}

/**
 * The full-text index wraps the words it matched in triple braces inside its
 * highlight block. The braces are its notation, not part of the page.
 */
export function stripHighlightMarkers(text: string): string {
  return text.replace(/\{\{\{/g, "").replace(/\}\}\}/g, "");
}

export function toInsideResults(
  payload: unknown,
  url: string,
  onSkip: (n: number) => void,
): InsideResults {
  const hits = searchBody(payload, url);
  const rows = hitRows(hits, url);

  const found: InsideHit[] = [];
  let skipped = 0;
  for (const row of rows) {
    const fields = asObject(row.fields);
    const identifier = fields ? asString(fields[HIT_FIELD.identifier]) : null;
    if (!fields || !identifier) {
      skipped += 1;
      continue;
    }
    const highlight = asObject(row.highlight);
    const excerpts = highlight
      ? sourceTexts(highlight.text).map((t) => stripHighlightMarkers(t).replace(/\s+/g, " ").trim())
      : [];
    // A bundled item carries several documents, and the title, creator and
    // year on the hit describe the item rather than the one that matched.
    const insideContainer = fields[HIT_FIELD.inSubfile] === true;
    found.push({
      identifier,
      title: sourceText(fields[HIT_FIELD.title]),
      creator: sourceTexts(fields[HIT_FIELD.creator]).join(", ") || null,
      year: asYear(fields[HIT_FIELD.year] ?? fields[HIT_FIELD.date]),
      matchedFile: insideContainer ? asString(fields[HIT_FIELD.matchedFile]) : null,
      insideContainer,
      excerpts,
      sourceUrl: itemUrl(identifier),
    });
  }

  if (skipped > 0) onSkip(skipped);
  if (rows.length > 0 && found.length === 0) {
    throw parseFailure(`${rows.length} matches came back and none could be read.`, { url });
  }
  return { total: hitTotal(hits, url), hits: found };
}

export function toItemDetail(payload: unknown, identifier: string, url: string): ItemDetail {
  const root = asObject(payload);
  if (!root) throw parseFailure("The item answer was not an object.", { url });

  // An identifier that does not exist answers with an empty document rather
  // than an error status, so emptiness is what "no such item" looks like here.
  const metadata = asObject(root.metadata);
  // Absence is an empty document and nothing else. A document carrying
  // something this parser cannot read is a failure to read, and reporting it as
  // an absence would state that the Archive holds nothing under this name.
  if (metadata === null) {
    if (Object.keys(root).length === 0) {
      throw notFound(`The Internet Archive has no item called "${identifier}".`, { url });
    }
    throw parseFailure(
      `The record for "${identifier}" came back without the metadata block this server reads.`,
      { url },
    );
  }
  if (Object.keys(metadata).length === 0) {
    throw notFound(`The Internet Archive has no item called "${identifier}".`, { url });
  }

  const rawFiles = Array.isArray(root.files) ? root.files.map(asObject) : [];
  const files: ItemFile[] = [];
  for (const entry of rawFiles) {
    const name = entry ? asString(entry.name) : null;
    if (!name) continue;
    files.push({
      name,
      format: asString(entry?.format),
      size: asNumber(entry?.size),
      downloadUrl: downloadUrl(identifier, name),
    });
  }

  return {
    identifier,
    isCollection: root.is_collection === true,
    title: sourceText(metadata[META_FIELD.title]),
    creator: sourceTexts(metadata[META_FIELD.creator]).join(", ") || null,
    year: asYear(metadata[META_FIELD.year] ?? metadata[META_FIELD.date]),
    mediaType: asString(metadata[META_FIELD.mediaType]),
    downloads: asNumber(metadata[META_FIELD.downloads]),
    sourceUrl: itemUrl(identifier),
    description: sourceText(metadata[META_FIELD.description]),
    date: asString(metadata[META_FIELD.date]),
    publisher: sourceTexts(metadata[META_FIELD.publisher]).join(", ") || null,
    language: sourceTexts(metadata[META_FIELD.language]).join(", ") || null,
    collections: asStrings(metadata[META_FIELD.collection]),
    licenseUrl: asString(metadata[META_FIELD.licenseUrl]),
    fileCount: asNumber(root.files_count) ?? rawFiles.length,
    totalBytes: asNumber(root.item_size),
    files,
    raw: metadata,
  };
}

export function toNearestSnapshot(
  payload: unknown,
  target: string,
  requestedAt: Date | null,
  url: string,
): NearestSnapshot {
  const root = asObject(payload);
  const archived = root ? asObject(root.archived_snapshots) : null;
  if (!archived) {
    throw parseFailure("The capture answer did not carry the snapshot block.", { url });
  }

  const closest = asObject(archived.closest);
  if (!closest || closest.available === false) {
    throw notFound(`The Wayback Machine holds no capture of ${target}.`, { url });
  }

  const stamp = asString(closest.timestamp);
  const capturedAt = stamp ? fromArchiveStamp(stamp) : null;
  if (!stamp || !capturedAt) {
    throw parseFailure("A capture came back without a readable date.", { url });
  }

  const status = asNumber(closest.status);
  return {
    capturedAt: capturedAt.toISOString(),
    url: asString(closest.url) ?? snapshotUrl(stamp, target),
    status,
    // Stated in days, because "the closest capture" to 2005 can be 2019 and
    // presenting that as the answer without the gap is how a model states a
    // date it never checked.
    daysFromRequested:
      requestedAt === null
        ? null
        : Math.round(Math.abs(capturedAt.getTime() - requestedAt.getTime()) / 86_400_000),
  };
}

/**
 * The capture index answers as rows of an array, the first being the column
 * names. Reading positions by name rather than by index keeps a reordering
 * upstream from silently swapping dates and statuses.
 */
export function toSnapshotHistory(
  payload: unknown,
  target: string,
  url: string,
  onSkip: (n: number) => void = () => undefined,
): SnapshotHistory {
  if (!Array.isArray(payload)) {
    throw parseFailure("The capture index did not answer with rows.", { url });
  }
  if (payload.length === 0) {
    return {
      url: target,
      total: 0,
      rowsReceived: 0,
      resumeKey: null,
      first: null,
      last: null,
      snapshots: [],
    };
  }

  const header = payload[0];
  if (!Array.isArray(header)) {
    throw parseFailure("The capture index answered without its column names.", { url });
  }
  const columns = header.map(String);
  const at = (row: unknown[], name: string): string | null => {
    const index = columns.indexOf(name);
    if (index < 0) return null;
    const value = row[index];
    return typeof value === "string" ? value : null;
  };

  // The key arrives as a final one-cell row, separated from the captures by a
  // blank one. Neither is a capture, and neither is an unreadable row.
  let dataRows = payload.slice(1);
  let resumeKey: string | null = null;
  const tail = dataRows[dataRows.length - 1];
  const separator = dataRows[dataRows.length - 2];
  if (
    Array.isArray(tail) &&
    tail.length === 1 &&
    Array.isArray(separator) &&
    separator.length === 0
  ) {
    resumeKey = typeof tail[0] === "string" ? tail[0] : null;
    dataRows = dataRows.slice(0, -2);
  }

  const snapshots: Snapshot[] = [];
  let skipped = 0;
  for (const row of dataRows) {
    if (!Array.isArray(row)) {
      skipped += 1;
      continue;
    }
    const stamp = at(row, "timestamp");
    const when = stamp ? fromArchiveStamp(stamp) : null;
    if (!stamp || !when) {
      skipped += 1;
      continue;
    }
    const status = at(row, "statuscode");
    const snapshot: Snapshot = {
      capturedAt: when.toISOString(),
      url: snapshotUrl(stamp, at(row, "original") ?? target),
      status: status === null ? null : (asNumber(status) ?? null),
    };
    // The index can hold more than one row for a single visit, identical to the
    // second and pointing at the same capture. Two of them read as two visits
    // and inflate any count made from the list, so a capture is kept once.
    const alreadyHave = snapshots.some(
      (kept) => kept.capturedAt === snapshot.capturedAt && kept.url === snapshot.url,
    );
    if (!alreadyHave) snapshots.push(snapshot);
  }

  if (skipped > 0) onSkip(skipped);
  if (dataRows.length > 0 && snapshots.length === 0) {
    throw parseFailure("The capture index answered with rows this server could not read.", { url });
  }

  const dates = snapshots.map((s) => s.capturedAt).sort();
  return {
    url: target,
    total: snapshots.length,
    // Paging follows what the index sent, so a row nobody could read does not
    // read as the end of the history.
    rowsReceived: dataRows.length,
    resumeKey,
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
    snapshots,
  };
}

export function toBooks(
  payload: unknown,
  url: string,
  onSkip: (n: number) => void,
): { total: number; books: Book[] } {
  const root = asObject(payload);
  if (!root || !Array.isArray(root.docs)) {
    throw parseFailure("The book search did not answer with a list of works.", { url });
  }

  const books: Book[] = [];
  let skipped = 0;
  for (const entry of root.docs) {
    const doc = asObject(entry);
    const key = doc ? asString(doc[BOOK_FIELD.key]) : null;
    const title = doc ? sourceText(doc[BOOK_FIELD.title]) : null;
    if (!doc || !key || !title) {
      skipped += 1;
      continue;
    }
    books.push({
      key,
      title,
      authors: sourceTexts(doc[BOOK_FIELD.authors]),
      firstPublishedYear: asYear(doc[BOOK_FIELD.firstYear]),
      editionCount: asNumber(doc[BOOK_FIELD.editions]),
      archiveIdentifiers: asStrings(doc[BOOK_FIELD.scans]),
      pageCount: asNumber(doc[BOOK_FIELD.pages]),
      subjects: sourceTexts(doc[BOOK_FIELD.subjects]).slice(0, MOST_SUBJECTS),
      sourceUrl: bookUrl(key),
    });
  }

  if (skipped > 0) onSkip(skipped);
  if (root.docs.length > 0 && books.length === 0) {
    throw parseFailure(`${root.docs.length} works came back and none could be read.`, { url });
  }
  const total = asNumber(root.numFound);
  if (total === null) {
    throw parseFailure("The book search carried no readable count of works.", { url });
  }
  return { total, books };
}
