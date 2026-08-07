/**
 * list_snapshots: how often a page was captured, and between which dates.
 *
 * The capture index is the slowest route this server calls: a busy address has
 * hundreds of thousands of rows and the query takes tens of seconds. It gets a
 * deadline of its own, and asking for a window rather than a history is what
 * keeps the call answerable at all.
 */

import { z } from "zod";
import type { ArchiveClient } from "../ia/client.js";
import { strictInput } from "./arguments.js";
import { ok, snapshotSchema, toToolError } from "./shared.js";
import type { ToolResult } from "./shared.js";

export const listSnapshotsDescription = [
  "List Wayback Machine captures of a web page, oldest first, with the dates they were taken.",
  "Answers how long a page has been archived and how often, which get_snapshot cannot.",
  "Identical consecutive captures are collapsed, so a date marks a visit on which the page was seen to differ from the previous one. A capture records when the crawler came, not when the page changed: the change happened somewhere between two dates.",
  "This route is slow, tens of seconds on a heavily archived address, and it is paged for that reason.",
  "To walk further back, pass the 'next_cursor' from the previous answer as 'cursor'. The index counts rows rather than positions, so there is no page number and no arithmetic to do: a null 'next_cursor' means the end of what it holds.",
].join(" ");

export const listSnapshotsInput = strictInput({
  url: z.string().min(3).max(2000).describe("Address to look up."),
  limit: z.number().int().min(1).max(100).default(20).describe("Captures to return."),
  cursor: z
    .string()
    .max(500)
    .optional()
    .describe("The 'next_cursor' from a previous answer. Omit to start at the oldest capture."),
});

export const listSnapshotsOutput = z.object({
  url: z.string(),
  returned: z.number().int().describe("Captures in this answer."),
  first: z
    .string()
    .nullable()
    .describe("Earliest capture in this answer, not in the whole history."),
  last: z.string().nullable().describe("Latest capture in this answer, not in the whole history."),
  next_cursor: z
    .string()
    .nullable()
    .describe(
      "Pass back as 'cursor' to read the window after this one. Null at the end of the history.",
    ),
  snapshots: z.array(snapshotSchema),
  notes: z.array(z.string()),
});

export type ListSnapshotsArgs = z.infer<typeof listSnapshotsInput>;

export async function runListSnapshots(
  client: ArchiveClient,
  args: ListSnapshotsArgs,
): Promise<ToolResult> {
  try {
    const { data, cached, skipped } = await client.listSnapshots(args.url, args.limit, args.cursor);

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    if (skipped) {
      notes.push(
        `${skipped} row(s) came back in a shape this server could not read and were left out.`,
      );
    }
    if (data.resumeKey !== null) {
      notes.push(
        `This is a window of ${data.snapshots.length} captures, not the whole history. The index reports no total, so 'first' and 'last' describe this window alone; pass 'next_cursor' back as 'cursor' to continue.`,
      );
    }
    if (data.snapshots.length === 0) {
      notes.push(
        args.cursor === undefined
          ? "The Wayback Machine holds no capture of this address."
          : "This cursor is past the end of what the index holds for this address.",
      );
    }

    const snapshots = data.snapshots.map((snapshot) => ({
      captured_at: snapshot.capturedAt,
      url: snapshot.url,
      status: snapshot.status,
    }));

    const body =
      snapshots.length === 0
        ? `No capture listed for ${args.url}.`
        : `${snapshots.length} captures of ${args.url}, ${data.first?.slice(0, 10)} to ${data.last?.slice(0, 10)}:\n` +
          snapshots
            .map(
              (snapshot) =>
                `  ${snapshot.captured_at.slice(0, 10)}${snapshot.status === null ? "" : ` · ${snapshot.status}`}\n     ${snapshot.url}`,
            )
            .join("\n");

    return ok(
      {
        url: args.url,
        returned: snapshots.length,
        first: data.first,
        last: data.last,
        next_cursor: data.resumeKey,
        snapshots,
        notes,
      },
      body,
      { notes },
    );
  } catch (error) {
    return toToolError(error);
  }
}
