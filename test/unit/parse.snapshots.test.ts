/**
 * toNearestSnapshot and toSnapshotHistory: the Wayback Machine.
 *
 * The number that carries the weight here is the gap in days between the
 * capture and the date that was asked for: without it, a capture from 2019 gets
 * described as the state of a page in 2005. The capture index is read by column
 * name, because the columns arrive in whatever order the index chose.
 */

import { describe, expect, it } from "vitest";
import { ArchiveError } from "../../src/errors.js";
import { toNearestSnapshot, toSnapshotHistory } from "../../src/ia/parse.js";
import { snapshotUrl } from "../../src/ia/paths.js";
import { capture, fixture } from "./helpers.js";

const TARGET = "example.invalid";
const URL_UNDER_TEST = "https://archive.org/wayback/available?url=example.invalid";
const HISTORY_URL = "https://web.archive.org/cdx/search/cdx?url=example.invalid";

/** The capture the `snapshot` fixture holds: 2001-04-28T10:22:48Z. */
const CAPTURE_MS = Date.UTC(2001, 3, 28, 10, 22, 48);
const DAY_MS = 86_400_000;

const nearest = (name: string, at: Date | null) =>
  toNearestSnapshot(fixture(name), TARGET, at, URL_UNDER_TEST);

describe("toNearestSnapshot, good path", () => {
  it("converts the Archive's own stamp into an ISO instant", () => {
    const snapshot = nearest("snapshot", null);
    expect(
      new Date(snapshot.capturedAt).getTime(),
      "20010428102248 is 2001-04-28T10:22:48Z, and a stamp read as local time would drift by hours",
    ).toBe(CAPTURE_MS);
    expect(snapshot.capturedAt, "the published date is ISO 8601").toMatch(/^2001-04-28T10:22:48/);
  });

  it("keeps the capture's own address, which is what the caller opens", () => {
    expect(nearest("snapshot", null).url).toBe(
      "http://web.archive.org/web/20010428102248/http://example.invalid/",
    );
  });

  it("reads the status the original site answered, as a number", () => {
    expect(
      nearest("snapshot", null).status,
      "a status quoted as a string must still be a number",
    ).toBe(200);
  });
});

describe("toNearestSnapshot, the distance from the date asked for", () => {
  it("says nothing about a gap when no date was asked for", () => {
    expect(
      nearest("snapshot", null).daysFromRequested,
      "with no date asked for there is no gap to state, and zero would be a lie",
    ).toBeNull();
  });

  it("counts zero days when the capture falls on the moment asked for", () => {
    expect(nearest("snapshot", new Date(CAPTURE_MS)).daysFromRequested).toBe(0);
  });

  it("counts the whole days when the capture is later than the date asked for", () => {
    const asked = new Date(CAPTURE_MS - 10 * DAY_MS);
    expect(
      nearest("snapshot", asked).daysFromRequested,
      "ten days before the capture is a gap of ten days",
    ).toBe(10);
  });

  it("counts the whole days when the capture is earlier than the date asked for", () => {
    const asked = new Date(CAPTURE_MS + 10 * DAY_MS);
    expect(
      nearest("snapshot", asked).daysFromRequested,
      "a gap is a distance, so it does not change sign with the direction",
    ).toBe(10);
  });

  it("stays right when the capture is years away", () => {
    const asked = new Date(CAPTURE_MS + 3653 * DAY_MS);
    expect(
      nearest("snapshot", asked).daysFromRequested,
      "a decade of leap years must not shift the count, which is why it is computed from instants",
    ).toBe(3653);
  });

  it("reports whole days for a gap of part of a day", () => {
    const asked = new Date(CAPTURE_MS + 5 * DAY_MS + 3 * 3600_000);
    expect(
      nearest("snapshot", asked).daysFromRequested,
      "five days and three hours is five whole days",
    ).toBe(5);
  });
});

describe("toNearestSnapshot, the capture that is an error page", () => {
  it("returns the capture and its status rather than hiding it", () => {
    const snapshot = nearest("snapshot-error-status", null);
    expect(
      snapshot.status,
      "the capture exists; that the site answered 404 when it was taken is for the caller to weigh",
    ).toBe(404);
    expect(new Date(snapshot.capturedAt).getTime()).toBe(Date.UTC(2019, 0, 1, 0, 0, 0));
  });
});

describe("toNearestSnapshot, nothing held", () => {
  it("throws not_found when the Archive answers with no capture", () => {
    const outcome = capture(() => nearest("snapshot-none", null));
    expect(
      outcome.threw,
      `no capture is an absence and must be said so; it returned ${JSON.stringify(outcome.returned)}`,
    ).toBe(true);
    expect(outcome.error).toBeInstanceOf(ArchiveError);
    expect(
      (outcome.error as ArchiveError).code,
      "the Wayback Machine answered and holds nothing, which is not_found",
    ).toBe("not_found");
  });
});

describe("toNearestSnapshot, the shape that cannot be recognised", () => {
  const unrecognisable: Array<[string, unknown]> = [
    ["null", null],
    ["a bare string", "bad gateway"],
    ["an answer with no snapshot block", { url: TARGET }],
    [
      "a capture with no readable date",
      { archived_snapshots: { closest: { url: "x", status: "200", timestamp: "yesterday" } } },
    ],
  ];

  for (const [label, payload] of unrecognisable) {
    it(`throws parse_failure for ${label}`, () => {
      const outcome = capture(() => toNearestSnapshot(payload, TARGET, null, URL_UNDER_TEST));
      expect(
        outcome.threw,
        `an unreadable answer must throw; it returned ${JSON.stringify(outcome.returned)}`,
      ).toBe(true);
      expect(
        (outcome.error as ArchiveError).code,
        "an unreadable answer is a parse_failure, never a capture with a made-up date",
      ).toBe("parse_failure");
    });
  }
});

describe("toSnapshotHistory, good path", () => {
  const history = () => toSnapshotHistory(fixture("history"), TARGET, HISTORY_URL);

  it("reads every capture row under the header", () => {
    expect(history().snapshots.length, "the fixture holds three captures and one header row").toBe(
      3,
    );
    expect(
      history().snapshots.some((snapshot) => snapshot.capturedAt.startsWith("timestamp")),
      "the header row names the columns and is not itself a capture",
    ).toBe(false);
  });

  it("returns captures oldest first, which is what the dates are read as", () => {
    const dates = history().snapshots.map((snapshot) => snapshot.capturedAt);
    const sorted = [...dates].sort();
    expect(dates, "the order must be oldest first, as the tool's description promises").toEqual(
      sorted,
    );
  });

  it("reports the window's own first and last dates", () => {
    const data = history();
    expect(data.first, "first is the earliest capture in this window").toBe(
      data.snapshots[0]!.capturedAt,
    );
    expect(data.last, "last is the latest capture in this window").toBe(
      data.snapshots[2]!.capturedAt,
    );
    expect(new Date(data.first!).getTime()).toBe(Date.UTC(2001, 3, 28, 10, 22, 48));
    expect(new Date(data.last!).getTime()).toBe(Date.UTC(2004, 8, 15, 7, 11, 22));
  });

  it("counts what it returned, because the index reports no total", () => {
    const data = history();
    expect(
      data.total,
      "the capture index never states a total, so the count must describe this window and not claim more",
    ).toBe(data.snapshots.length);
  });

  it("links each capture to the Wayback address that opens it", () => {
    const data = history();
    expect(data.snapshots[0]!.url).toBe(snapshotUrl("20010428102248", "http://example.invalid/"));
  });

  it("reads the status of each capture as a number", () => {
    expect(history().snapshots.map((snapshot) => snapshot.status)).toEqual([200, 200, 404]);
  });

  it("echoes the address that was asked about", () => {
    expect(history().url).toBe(TARGET);
  });
});

describe("toSnapshotHistory, columns in another order", () => {
  it("reads the columns by name, so a reordering upstream cannot swap date and status", () => {
    const data = toSnapshotHistory(fixture("history-reordered"), TARGET, HISTORY_URL);
    expect(data.snapshots.length).toBe(1);
    const only = data.snapshots[0]!;
    expect(
      new Date(only.capturedAt).getTime(),
      "the timestamp column sits second here, and reading position one would take the status as a date",
    ).toBe(Date.UTC(2003, 0, 1, 0, 0, 0));
    expect(
      only.status,
      "the status column sits first here, and reading position three would take the address as a status",
    ).toBe(301);
    expect(only.url).toBe(snapshotUrl("20030101000000", "http://example.invalid/"));
  });
});

describe("toSnapshotHistory, the empty result", () => {
  it("reports no captures without failing", () => {
    const data = toSnapshotHistory(fixture("history-empty"), TARGET, HISTORY_URL);
    expect(
      data.snapshots,
      "an address the index holds nothing for is an honest empty list",
    ).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.first, "there is no earliest capture to name").toBeNull();
    expect(data.last).toBeNull();
    expect(data.url).toBe(TARGET);
  });

  it("reports a header with no rows under it as no captures", () => {
    const data = toSnapshotHistory([["timestamp", "original", "statuscode"]], TARGET, HISTORY_URL);
    expect(data.snapshots, "a header alone is a page past the end of the history").toEqual([]);
    expect(data.total).toBe(0);
  });
});

describe("toSnapshotHistory, the shape that cannot be recognised", () => {
  const unrecognisable: Array<[string, unknown]> = [
    ["an object where rows were due", { rows: [] }],
    ["null", null],
    ["a bare string", "<html>error</html>"],
    [
      "rows whose header names nothing this server reads",
      [
        ["a", "b"],
        ["1", "2"],
      ],
    ],
  ];

  for (const [label, payload] of unrecognisable) {
    it(`throws parse_failure for ${label}, never an empty history`, () => {
      const outcome = capture(() => toSnapshotHistory(payload, TARGET, HISTORY_URL));
      expect(
        outcome.threw,
        `an unreadable index answer must throw; it returned ${JSON.stringify(outcome.returned)}, ` +
          "and an empty history reads as 'this page was never archived'",
      ).toBe(true);
      expect((outcome.error as ArchiveError).code).toBe("parse_failure");
    });
  }
});
