/**
 * get_item: read one catalogue record.
 *
 * The file listing is the weight here: a single scanned film carries dozens of
 * derivatives, thumbnails and checksums, and on a large item that block is most
 * of the answer. Files are therefore asked for rather than assumed, and the
 * count is always reported whether or not they were returned.
 */

import { z } from "zod";
import type { ArchiveClient } from "../ia/client.js";
import { invalidInput } from "../errors.js";
import { strictInput } from "./arguments.js";
import { itemSummarySchema, ok, toToolError, truncate } from "./shared.js";
import type { ToolResult } from "./shared.js";

/**
 * Put the files a caller asked for into the payload, and say what was left out.
 *
 * A format that matches nothing is different from an item holding no files: the
 * formats the item does carry are named, so a caller can ask again for one of
 * them rather than concluding the item is empty.
 */
function attachFiles(
  structured: Record<string, unknown>,
  data: {
    files: ReadonlyArray<{
      name: string;
      format: string | null;
      size: number | null;
      downloadUrl: string;
    }>;
  },
  args: { file_format?: string | undefined; max_files: number },
  wanted: Set<string>,
  notes: string[],
): void {
  if (!wanted.has("files")) {
    return;
  }

  const wantedFormat = args.file_format?.toLowerCase();
  const matching =
    wantedFormat === undefined
      ? data.files
      : data.files.filter((file) => (file.format ?? "").toLowerCase() === wantedFormat);
  const shown = matching.slice(0, args.max_files);

  structured.files = shown.map((file) => ({
    name: file.name,
    format: file.format,
    size_bytes: file.size,
    download_url: file.downloadUrl,
  }));

  if (args.file_format && matching.length === 0) {
    const formats = [...new Set(data.files.map((f) => f.format).filter(Boolean))];
    notes.push(
      `No file of format "${args.file_format}". The item holds ${formats.join(", ") || "no format the Archive named"}.`,
    );
    return;
  }
  if (matching.length > shown.length) {
    notes.push(`${matching.length} files match and the first ${shown.length} are shown.`);
  }
}

const SECTIONS = ["basic", "files", "full_metadata"] as const;

export const getItemDescription = [
  "Read one Internet Archive item by its identifier, as returned by search_items or search_inside.",
  "Sections are opt-in: 'basic' is the default and covers what a description needs.",
  "'files' lists the downloadable files, which on a scanned film or book run to dozens of derivatives, so filter by format when a particular one is wanted.",
  "'full_metadata' returns every field the Archive publishes for the item, which is large and rarely needed.",
  "'file_count' and 'total_bytes' are always reported, whether or not the file list was asked for.",
].join(" ");

export const getItemInput = strictInput({
  identifier: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Archive identifier, such as 'nasa'. It is the last part of an item's address rather than the address itself, and it is matched exactly, capitals included.",
    ),
  sections: z
    .array(z.enum(SECTIONS))
    .default(["basic"])
    .describe("Which parts to return. Each one beyond 'basic' adds to the size of the answer."),
  file_format: z
    .string()
    .max(60)
    .optional()
    .describe(
      "Keep only files of this format, such as 'PDF' or 'MP3'. Matched case-insensitively.",
    ),
  max_files: z.number().int().min(1).max(200).default(25).describe("Ceiling on files returned."),
  max_description_chars: z.number().int().min(100).max(20000).default(2000),
});

export const getItemOutput = z.object({
  item: itemSummarySchema,
  description: z.string().nullable(),
  date: z.string().nullable(),
  publisher: z.string().nullable(),
  language: z.string().nullable(),
  collections: z.array(z.string()).describe("Collections the item sits in."),
  license_url: z
    .string()
    .nullable()
    .describe("Terms the uploader attached, when they attached any."),
  file_count: z.number().int().describe("Files the item holds, whatever this answer returned."),
  total_bytes: z.number().int().nullable(),
  files: z
    .array(
      z.object({
        name: z.string(),
        format: z.string().nullable(),
        size_bytes: z.number().int().nullable(),
        download_url: z.string(),
      }),
    )
    .optional(),
  full_metadata: z.record(z.string(), z.unknown()).optional(),
  notes: z.array(z.string()),
});

export type GetItemArgs = z.infer<typeof getItemInput>;

/**
 * An identifier as the caller wrote it, refused when the value is an address.
 *
 * The metadata route reads what it is handed up to the first slash, so a full
 * address arrives as a request for an item called "https:" and a path as one
 * called "details". Both come back unreadable, and reporting that as a shape
 * this server cannot read blames the Archive for a mistake in the call. The
 * spelling that would work sits inside the value, so the refusal hands it back.
 */
function readIdentifier(value: string): { identifier: string; spaceRemoved: boolean } {
  const identifier = value.trim();
  if (identifier === "") {
    throw invalidInput(
      "An item identifier is required, and this one is empty.",
      "Pass an Archive identifier, such as 'nasa'.",
    );
  }

  const address = /^[a-z][a-z0-9+.-]*:\/\//i.test(identifier) || identifier.includes("/");
  if (address || /[?#\s]/.test(identifier)) {
    const last =
      (identifier.split(/[?#]/)[0] ?? "")
        .split("/")
        .filter((part) => part !== "")
        .pop() ?? "";
    throw invalidInput(
      `"${identifier}" is a web address, not an Archive identifier.`,
      last === "" || last === identifier
        ? "An identifier is the last part of an item's address, such as 'nasa' in 'https://archive.org/details/nasa'."
        : `An identifier is the last part of an item's address, so pass '${last}'.`,
    );
  }

  return { identifier, spaceRemoved: identifier !== value };
}

export async function runGetItem(client: ArchiveClient, args: GetItemArgs): Promise<ToolResult> {
  try {
    const wanted = new Set(args.sections);
    const { identifier, spaceRemoved } = readIdentifier(args.identifier);
    const { data, cached } = await client.getItem(identifier);
    const notes: string[] = [];
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }
    if (spaceRemoved) {
      // An identifier is matched exactly, so a caller who is not told that the
      // space was set aside keeps the padded form for every later call.
      notes.push(
        `The identifier was read as "${identifier}": the space around the value given is not part of it.`,
      );
    }

    const structured: Record<string, unknown> = {
      item: {
        identifier: data.identifier,
        title: data.title,
        creator: data.creator,
        year: data.year,
        media_type: data.mediaType,
        downloads: data.downloads,
        source_url: data.sourceUrl,
      },
      description: data.description ? truncate(data.description, args.max_description_chars) : null,
      date: data.date,
      publisher: data.publisher,
      language: data.language,
      collections: data.collections,
      license_url: data.licenseUrl,
      file_count: data.fileCount,
      total_bytes: data.totalBytes,
      notes,
    };

    if (data.description && data.description.length > args.max_description_chars) {
      notes.push(
        `The description runs to ${data.description.length} characters and was cut at ${args.max_description_chars}. Raise 'max_description_chars' for the rest.`,
      );
    }

    attachFiles(structured, data, args, wanted, notes);

    if (wanted.has("full_metadata")) {
      structured.full_metadata = data.raw ?? {};
    }

    if (!data.licenseUrl) {
      notes.push(
        "The uploader attached no licence, so nothing here states what may be reused. Check the item page before republishing.",
      );
    }

    const lines = [
      [data.title ?? data.identifier, data.year === null ? "" : `(${data.year})`]
        .filter(Boolean)
        .join(" "),
      data.creator ? `By ${data.creator}` : "",
      data.mediaType ? `Kind: ${data.mediaType}` : "",
      data.collections.length > 0 ? `Collections: ${data.collections.join(", ")}` : "",
      `Files: ${data.fileCount}${data.totalBytes === null ? "" : ` · ${Math.round(data.totalBytes / 1024)} KB`}`,
    ].filter(Boolean);

    if (structured.description) {
      lines.push("", String(structured.description));
    }

    const files = structured.files as Array<{ name: string; format: string | null }> | undefined;
    if (files && files.length > 0) {
      lines.push("", "Files:");
      for (const file of files) {
        lines.push(`  ${file.name}${file.format ? ` (${file.format})` : ""}`);
      }
    }

    return ok(structured, lines.join("\n"), { notes, sourceUrl: data.sourceUrl });
  } catch (error) {
    return toToolError(error);
  }
}
