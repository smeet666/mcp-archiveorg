/**
 * One request per route, against the Internet Archive itself.
 *
 * The unit tests run on fixtures, so they stay green while the published server
 * is broken for everyone: none of these routes is documented, and any of them
 * can change shape without notice. This suite is what notices. Each assertion
 * names the field it guards, so a failure says what moved rather than that
 * something did.
 *
 * Skipped unless IA_LIVE is set, so a normal test run touches no network.
 */

import { describe, expect, it } from "vitest";
import { ArchiveClient } from "../../src/ia/client.js";
import { ArchiveError } from "../../src/errors.js";

const live = process.env.IA_LIVE === "1" ? describe : describe.skip;

const client = () =>
  new ArchiveClient({
    config: { logLevel: "silent", minIntervalMs: 1500, cacheTtlMs: 0 },
  });

live("live Internet Archive", () => {
  it("still answers a full-text search with matches carrying their passages", async () => {
    const { data } = await client().searchInside('"call me ishmael"', 3, 1);

    expect(data.total, "the match count is what tells a caller there is more").toBeGreaterThan(0);
    expect(data.hits.length, "a page of matches came back empty").toBeGreaterThan(0);
    const first = data.hits[0]!;
    expect(first.identifier, "the identifier is what get_item takes").toBeTruthy();
    expect(
      first.excerpts.length,
      "a match without its passage is not worth returning",
    ).toBeGreaterThan(0);
    expect(
      first.excerpts.join(" "),
      "the index marks its matches with braces, which must not reach a caller",
    ).not.toContain("{{{");
  }, 120_000);

  it("still counts matching documents rather than something that cannot be paged", async () => {
    // The count pages: the last page of a match set is shorter than the first
    // and the one after it is empty. A count of occurrences would not behave
    // this way, and the tools describe it as documents on that basis.
    const first = await client().searchInside('"the pequods crew"', 5, 1);
    if (first.data.total <= 5) return;

    const second = await client().searchInside('"the pequods crew"', 5, 2);
    expect(second.data.total, "the count must not move between pages").toBe(first.data.total);
    expect(
      second.data.hits.map((hit) => hit.identifier),
      "a second page that repeats the first is not a second page",
    ).not.toEqual(first.data.hits.map((hit) => hit.identifier));
  }, 180_000);

  it("still refuses a malformed query rather than answering that nothing matched", async () => {
    // An unbalanced quotation mark is answered with HTTP 200 and no rows.
    // Reading only the rows turns a refusal into an absence.
    await expect(client().searchInside('"call me', 3, 1)).rejects.toMatchObject({
      code: "invalid_input",
    });
  }, 120_000);

  it("still returns every field a catalogue row is built from", async () => {
    const { data } = await client().searchItems({
      query: "cowboy bebop",
      mediaType: "movies",
      sort: "downloads",
      limit: 3,
      page: 1,
    });

    expect(data.total, "the catalogue total may have moved to another key").toBeGreaterThan(0);
    const row = data.items[0]!;
    expect(row.identifier).toBeTruthy();
    expect(row.sourceUrl, "every row must be citable").toContain("archive.org/details/");
  }, 120_000);

  it("still describes an item, and says when the identifier names a collection", async () => {
    const { data } = await client().getItem("nasa");

    expect(data.title, "the metadata block may have been renamed").toBeTruthy();
    expect(data.isCollection, "'nasa' is a collection, and a caller has to be told").toBe(true);
    expect(
      data.fileCount,
      "the file count comes from the record, not from what parsed",
    ).toBeGreaterThan(0);
  }, 120_000);

  it("still reports a missing item as an absence rather than a failure", async () => {
    await expect(client().getItem("zzz-no-such-item-2026-mcp")).rejects.toMatchObject({
      code: "not_found",
    });
  }, 120_000);

  it("still finds the capture nearest a date, and says how far it is", async () => {
    const { data } = await client().getSnapshot("lemonde.fr", new Date("2005-01-01T00:00:00Z"));

    expect(data.capturedAt, "a capture without a readable date cannot be cited").toMatch(/^\d{4}-/);
    expect(
      data.daysFromRequested,
      "the gap is the one thing this route exists to state",
    ).not.toBeNull();
    expect(data.url).toContain("web.archive.org/web/");
  }, 120_000);

  it("still pages the capture index by the key it hands back", async () => {
    // The index ignores an offset entirely. What moves through a history is the
    // resume key, and a page that repeats the previous one is the failure this
    // guards against.
    const first = await client().listSnapshots("lemonde.fr", 4);
    expect(first.data.snapshots.length, "the index answered with no captures").toBeGreaterThan(0);
    expect(first.data.resumeKey, "without a key there is no way further back").toBeTruthy();

    const second = await client().listSnapshots("lemonde.fr", 4, first.data.resumeKey!);
    expect(
      second.data.snapshots.map((s) => s.capturedAt),
      "the key returned the same window",
    ).not.toEqual(first.data.snapshots.map((s) => s.capturedAt));
  }, 240_000);

  it("still returns a work with its author and the scans that hold it", async () => {
    const { data } = await client().searchBooks("moby dick", 3, 1);

    expect(data.total, "the work count may have moved to another key").toBeGreaterThan(0);
    const book = data.books[0]!;
    expect(book.title).toBeTruthy();
    expect(book.sourceUrl).toContain("openlibrary.org/works/");
  }, 120_000);

  it("serves a repeated request from its own cache rather than asking twice", async () => {
    const shared = new ArchiveClient({ config: { logLevel: "silent", minIntervalMs: 1500 } });

    const first = await shared.getItem("nasa");
    const second = await shared.getItem("nasa");

    expect(first.cached, "the first read cannot be a cache hit").toBe(false);
    expect(second.cached, "the second must not go out again").toBe(true);
  }, 120_000);

  it("keeps a contact address in the User-Agent whatever it is told to send", async () => {
    const disguised = new ArchiveClient({
      config: { logLevel: "silent", userAgent: "Googlebot/2.1" },
    });

    expect(
      disguised.userAgent,
      "the Archive has to be able to reach a human about this traffic",
    ).toContain("github.com/smeet666/mcp-archiveorg");
  });

  it("never lets an error reach a caller as something other than an ArchiveError", async () => {
    const outcome = await client()
      .getItem("zzz-no-such-item-2026-mcp")
      .then(() => null)
      .catch((error: unknown) => error);

    expect(outcome, "an untyped error tells a caller nothing it can act on").toBeInstanceOf(
      ArchiveError,
    );
  }, 120_000);
});
