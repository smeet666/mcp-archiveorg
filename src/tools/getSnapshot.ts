/**
 * get_snapshot: read a page as it stood on or near a date.
 *
 * The Wayback Machine answers with the closest capture it holds, which for a
 * quiet site can be years away from the date that was asked for. That gap is
 * the whole point of this tool's output: without it, a capture from 2019 gets
 * described as the state of the page in 2005.
 */

import { z } from "zod";
import type { ArchiveClient, Read } from "../ia/client.js";
import { ArchiveError, invalidInput } from "../errors.js";
import { wholeDaysBetween } from "../ia/parse.js";
import type { NearestSnapshot } from "../types.js";
import { strictInput } from "./arguments.js";
import { ok, readAddress, sameAddress, snapshotSchema, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const getSnapshotDescription = [
  "Find the Wayback Machine capture of a web page closest to a given date.",
  "Give 'at' to ask for a moment in time; leave it out for the most recent capture.",
  "The answer always states 'days_from_requested', because the closest capture can be years away from the date asked for: read it before describing what the page said on that date.",
  "It also states the address the capture is of, which the Wayback Machine can resolve to a neighbouring form of the one asked about.",
  "This finds the capture and links to it. It does not return the page's contents.",
].join(" ");

export const getSnapshotInput = strictInput({
  url: z
    .string()
    .min(3)
    .max(2000)
    .describe("Address to look up, such as 'lemonde.fr' or a full URL."),
  at: z
    .string()
    .optional()
    .describe(
      "Date to aim for, as YYYY-MM-DD or a full ISO 8601 timestamp. Omit for the newest capture.",
    ),
});

export const getSnapshotOutput = z.object({
  requested_url: z.string(),
  requested_at: z.string().nullable(),
  snapshot: snapshotSchema.extend({
    days_from_requested: z
      .number()
      .int()
      .nullable()
      .describe(
        "Whole days between this capture and the moment asked for, counted down: a capture taken on the day asked about, when no time was given, is 0. Null when no date was given.",
      ),
  }),
  notes: z.array(z.string()),
});

export type GetSnapshotArgs = z.infer<typeof getSnapshotInput>;

/** A date the caller can express two ways, refused rather than guessed at. */
function readDate(value: string): Date {
  // A day outside its month rolls forward: "2020-02-30" becomes 29 February,
  // and the answer then reports a capture as some number of days from a date
  // nobody can point at. The calendar fields are checked on their own, so the
  // check holds whatever time zone offset follows them.
  const named = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (named) {
    const [year, month, day] = [Number(named[1]), Number(named[2]), Number(named[3])];
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      throw invalidInput(
        `"${value}" names a day the calendar does not have.`,
        "Give a day that exists: a month has 28 to 31 days, and February reaches 29 only in a leap year.",
      );
    }
  }

  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw invalidInput(
      `"${value}" is not a date this server can read.`,
      "Use YYYY-MM-DD, or a full ISO 8601 timestamp such as 2005-01-01T12:00:00Z.",
    );
  }
  return parsed;
}

/** Whole days between a capture and the moment asked for, as a distance. */
const wholeDays = (capturedAt: string, asked: Date): number =>
  wholeDaysBetween(new Date(capturedAt), asked);

export async function runGetSnapshot(
  client: ArchiveClient,
  args: GetSnapshotArgs,
): Promise<ToolResult> {
  try {
    const address = readAddress(args.url);
    const at = args.at === undefined ? undefined : readDate(args.at);

    // A date is a restriction on the lookup, so an empty answer under it says
    // nothing about the address. Asking again without it separates "captured,
    // though not around that date" from "never captured at all", which are the
    // two things a single not_found would collapse.
    let read: Read<NearestSnapshot>;
    let dateSetAside = false;
    try {
      read = await client.getSnapshot(address, at);
    } catch (error) {
      if (at === undefined || !(error instanceof ArchiveError) || error.code !== "not_found") {
        throw error;
      }
      read = await client.getSnapshot(address);
      dateSetAside = true;
    }
    const { data, cached } = read;

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    const gap =
      dateSetAside && at !== undefined ? wholeDays(data.capturedAt, at) : data.daysFromRequested;

    if (dateSetAside) {
      notes.push(
        `The lookup aimed at ${args.at} came back with no capture, so that date was set aside and the address was asked about on its own. This capture is ${gap} day(s) from the date asked for, and it is not the closest one to it that the index may hold.`,
      );
    }

    // The lookup resolves across the address forms the index keeps apart, so
    // the capture can be of a neighbour of what was asked about. Left unsaid,
    // it reads as a capture of the address the caller typed.
    const elsewhere = !sameAddress(address, data.address);
    if (elsewhere) {
      notes.push(
        `This capture is of ${data.address}. The Wayback Machine answered a lookup for ${address} with it, and the index keeps the two as separate addresses, so nothing here says what ${address} held.`,
      );
    }

    if (gap !== null && gap > 30) {
      const years = Math.floor(gap / 365);
      notes.push(
        `The closest capture is ${gap} days${years >= 1 ? ` (about ${years} year${years === 1 ? "" : "s"})` : ""} from the date asked for. It shows the page on ${data.capturedAt.slice(0, 10)}, not on ${args.at}.`,
      );
    }
    if (data.status !== null && data.status >= 400) {
      notes.push(
        `The site answered ${data.status} when this capture was taken, so the archived page is that error rather than the content.`,
      );
    }

    const lines = [
      elsewhere
        ? `Capture of ${data.address} taken ${data.capturedAt.slice(0, 10)}, answering a lookup for ${address}`
        : `${address} captured ${data.capturedAt.slice(0, 10)}`,
      data.status === null ? "" : `Answered ${data.status} at capture time`,
      gap === null ? "" : `${gap} day(s) from the date asked for`,
      data.url,
    ].filter(Boolean);

    return ok(
      {
        requested_url: address,
        requested_at: args.at ?? null,
        snapshot: {
          captured_at: data.capturedAt,
          url: data.url,
          address: data.address,
          status: data.status,
          days_from_requested: gap,
        },
        notes,
      },
      lines.join("\n"),
      { notes, sourceUrl: data.url },
    );
  } catch (error) {
    return toToolError(error);
  }
}
