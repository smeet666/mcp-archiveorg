/**
 * toItemDetail: one metadata document.
 *
 * The distinction this parser has to keep is between an identifier the Archive
 * does not hold, which is a `not_found`, and a document in a shape this server
 * cannot read, which is a `parse_failure`. Collapsing either into an empty
 * record lets a caller report an absence that was never established.
 */

import { describe, expect, it } from "vitest";
import { ArchiveError } from "../../src/errors.js";
import { toItemDetail } from "../../src/ia/parse.js";
import { downloadUrl, itemUrl } from "../../src/ia/paths.js";
import { capture, fixture } from "./helpers.js";

const ID = "the-glass-orchard-1971";
const URL_UNDER_TEST = `https://archive.org/metadata/${ID}`;

const parse = (name: string, identifier = ID) =>
  toItemDetail(fixture(name), identifier, `https://archive.org/metadata/${identifier}`);

describe("toItemDetail, good path", () => {
  it("reads the descriptive fields a caller cites an item by", () => {
    const item = parse("item");
    expect(item.identifier).toBe(ID);
    expect(item.title).toBe("The Glass Orchard");
    expect(item.description).toContain("salt country");
    expect(item.date, "the full date is kept as the Archive wrote it").toBe("1971-06-04");
    expect(item.publisher).toBe("Orchard Pictures");
    expect(item.language).toBe("eng");
    expect(item.mediaType).toBe("movies");
    expect(item.downloads).toBe(8421);
    expect(item.year, "a year quoted as a string must still be a number").toBe(1971);
    expect(item.sourceUrl, "the item page is what a citation links to").toBe(itemUrl(ID));
  });

  it("reads a creator list without stringifying it into an object tag", () => {
    const item = parse("item");
    expect(typeof item.creator, "creator is published as a string or null").toBe("string");
    expect(item.creator).not.toContain("[object");
    expect(item.creator, "the first credited creator must survive the flattening").toContain(
      "Vashti Reame",
    );
  });

  it("keeps the collections, which is how the Archive groups things", () => {
    const item = parse("item");
    expect(item.collections, "collections come back in the order the Archive gave them").toEqual([
      "feature_films",
      "moviesandfilms",
    ]);
  });

  it("keeps the licence when the uploader attached one", () => {
    expect(parse("item").licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
  });
});

describe("toItemDetail, the file listing", () => {
  it("leaves out a file with no name, which nothing could link to", () => {
    const item = parse("item");
    expect(
      item.files.every((file) => file.name.length > 0),
      "a nameless file has no download address and must not be published",
    ).toBe(true);
    expect(item.files.length, "three of the four entries carry a name").toBe(3);
  });

  it("reports the count the Archive listed, not the count that could be read", () => {
    const item = parse("item");
    expect(
      item.fileCount,
      "file_count states what the item holds, so it follows the site's listing rather than this server's reading of it",
    ).toBe(4);
  });

  it("reports the item size the Archive stated rather than a sum of its own", () => {
    const item = parse("item");
    // The fixture's item_size deliberately differs from the sum of the file
    // sizes, so a parser that adds them up cannot pass by coincidence.
    expect(item.totalBytes, "total_bytes is the Archive's own item_size").toBe(5012340);
  });

  it("turns file sizes sent as strings into numbers and builds a download address", () => {
    const item = parse("item");
    const pdf = item.files.find((file) => file.name.endsWith(".pdf"))!;
    expect(pdf.format).toBe("PDF");
    expect(pdf.size, "a size quoted as a string must still be a number").toBe(4821004);
    expect(pdf.downloadUrl, "every file must carry the address it can be fetched from").toBe(
      downloadUrl(ID, "the-glass-orchard.pdf"),
    );
  });

  it("publishes every metadata field the Archive sent, and nothing outside it", () => {
    const item = parse("item");
    expect(
      item.raw,
      "full_metadata exists to carry what the trimmed record left out",
    ).not.toBeNull();
    expect(Object.keys(item.raw!), "the raw record is the metadata block itself").toContain(
      "licenseurl",
    );
    expect(
      Object.keys(item.raw!),
      "a node outside the metadata block is not part of the item's metadata",
    ).not.toContain("ignored_block");
    expect(Object.keys(item.raw!), "the file listing is not a metadata field").not.toContain(
      "files",
    );
  });
});

describe("toItemDetail, the sparse record", () => {
  const id = "letters-from-the-salt-flats";

  it("says a missing licence is missing rather than inventing terms", () => {
    const item = parse("item-no-licence", id);
    expect(
      item.licenseUrl,
      "no licence means nothing states what may be reused, and the tool warns on this null",
    ).toBeNull();
  });

  it("leaves every field the record never carried as null", () => {
    const item = parse("item-no-licence", id);
    expect(item.creator).toBeNull();
    expect(item.description).toBeNull();
    expect(item.year).toBeNull();
    expect(item.mediaType).toBeNull();
    expect(item.date).toBeNull();
    expect(item.publisher).toBeNull();
    expect(item.language).toBeNull();
  });

  it("reports an item with no files as holding none", () => {
    const item = parse("item-no-licence", id);
    expect(item.files).toEqual([]);
    expect(item.fileCount).toBe(0);
    expect(item.collections, "no collection is an empty list, never null").toEqual([]);
  });

  it("still carries the identifier and the citable page", () => {
    const item = parse("item-no-licence", id);
    expect(item.identifier).toBe(id);
    expect(item.sourceUrl).toBe(itemUrl(id));
  });
});

describe("toItemDetail, the identifier that does not exist", () => {
  it("throws not_found for the empty document the Archive answers with", () => {
    const outcome = capture(() =>
      toItemDetail(fixture("item-missing"), "no-such-item", URL_UNDER_TEST),
    );
    expect(
      outcome.threw,
      `an unknown identifier must throw; it returned ${JSON.stringify(outcome.returned)}, ` +
        "and a hollow record reads as an item that exists and is blank",
    ).toBe(true);
    expect(outcome.error).toBeInstanceOf(ArchiveError);
    expect(
      (outcome.error as ArchiveError).code,
      "the Archive answered and holds nothing, which is not_found and not parse_failure",
    ).toBe("not_found");
  });

  it("names the identifier that was not found", () => {
    const outcome = capture(() =>
      toItemDetail(fixture("item-missing"), "no-such-item", URL_UNDER_TEST),
    );
    expect(
      (outcome.error as ArchiveError).message,
      "the message must name what was looked for",
    ).toContain("no-such-item");
  });
});

describe("toItemDetail, the shape that cannot be recognised", () => {
  const unrecognisable: Array<[string, unknown]> = [
    ["null", null],
    ["a bare string", "not json at all"],
    ["a list where a document was due", [1, 2, 3]],
    ["a document whose metadata block is not an object", { metadata: "gone" }],
  ];

  for (const [label, payload] of unrecognisable) {
    it(`throws for ${label} rather than returning a hollow record`, () => {
      const outcome = capture(() => toItemDetail(payload, ID, URL_UNDER_TEST));
      expect(
        outcome.threw,
        `an unreadable document must throw; it returned ${JSON.stringify(outcome.returned)}`,
      ).toBe(true);
      expect(outcome.error).toBeInstanceOf(ArchiveError);
      expect(
        ["parse_failure", "not_found"],
        "an unreadable document is either an absence or a parse failure, never a success",
      ).toContain((outcome.error as ArchiveError).code);
    });
  }

  it("calls a document with a metadata block it cannot read a parse_failure", () => {
    const outcome = capture(() => toItemDetail({ metadata: "gone" }, ID, URL_UNDER_TEST));
    expect(
      (outcome.error as ArchiveError).code,
      "a metadata block in the wrong shape is a changed contract, not a missing item",
    ).toBe("parse_failure");
  });

  it("does not turn an error document into the claim that the item does not exist", () => {
    const outcome = capture(() =>
      toItemDetail({ error: "the service is temporarily unavailable" }, ID, URL_UNDER_TEST),
    );
    expect(outcome.threw, "an error document must not read as a record").toBe(true);
    expect(
      (outcome.error as ArchiveError).code,
      "reporting not_found here states an absence the Archive never confirmed, which is the one failure mode this server exists to prevent",
    ).toBe("parse_failure");
  });
});
