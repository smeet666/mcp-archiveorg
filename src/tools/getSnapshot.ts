/**
 * get_snapshot: read a page as it stood on or near a date.
 *
 * The Wayback Machine answers with the closest capture it holds, which for a
 * quiet site can be years away from the date that was asked for. That gap is
 * the whole point of this tool's output: without it, a capture from 2019 gets
 * described as the state of the page in 2005.
 */

import { z } from "zod";
import type { ArchiveClient } from "../ia/client.js";
import { invalidInput } from "../errors.js";
import { ok, snapshotSchema, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const getSnapshotDescription = [
  "Find the Wayback Machine capture of a web page closest to a given date.",
  "Give 'at' to ask for a moment in time; leave it out for the most recent capture.",
  "The answer always states 'days_from_requested', because the closest capture can be years away from the date asked for: read it before describing what the page said on that date.",
  "This finds the capture and links to it. It does not return the page's contents.",
].join(" ");

export const getSnapshotInput = z.object({
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
        "Whole days between this capture and the date asked for. Null when no date was given.",
      ),
  }),
  notes: z.array(z.string()),
});

export type GetSnapshotArgs = z.infer<typeof getSnapshotInput>;

/** A date the caller can express two ways, refused rather than guessed at. */
function readDate(value: string): Date {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw invalidInput(
      `"${value}" is not a date this server can read.`,
      "Use YYYY-MM-DD, or a full ISO 8601 timestamp such as 2005-01-01T12:00:00Z.",
    );
  }
  return parsed;
}

export async function runGetSnapshot(
  client: ArchiveClient,
  args: GetSnapshotArgs,
): Promise<ToolResult> {
  try {
    const at = args.at === undefined ? undefined : readDate(args.at);
    const { data, cached } = await client.getSnapshot(args.url, at);

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    const gap = data.daysFromRequested;
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
      `${args.url} captured ${data.capturedAt.slice(0, 10)}`,
      data.status === null ? "" : `Answered ${data.status} at capture time`,
      gap === null ? "" : `${gap} day(s) from the date asked for`,
      data.url,
    ].filter(Boolean);

    return ok(
      {
        requested_url: args.url,
        requested_at: args.at ?? null,
        snapshot: {
          captured_at: data.capturedAt,
          url: data.url,
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
