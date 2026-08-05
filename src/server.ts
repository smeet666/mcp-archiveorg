/**
 * Wiring: one client, six tools, and the guidance a model reads before using
 * any of them.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import { ArchiveClient } from "./ia/client.js";
import { getItemDescription, getItemInput, getItemOutput, runGetItem } from "./tools/getItem.js";
import type { GetItemArgs } from "./tools/getItem.js";
import {
  getSnapshotDescription,
  getSnapshotInput,
  getSnapshotOutput,
  runGetSnapshot,
} from "./tools/getSnapshot.js";
import type { GetSnapshotArgs } from "./tools/getSnapshot.js";
import {
  listSnapshotsDescription,
  listSnapshotsInput,
  listSnapshotsOutput,
  runListSnapshots,
} from "./tools/listSnapshots.js";
import type { ListSnapshotsArgs } from "./tools/listSnapshots.js";
import {
  runSearchBooks,
  searchBooksDescription,
  searchBooksInput,
  searchBooksOutput,
} from "./tools/searchBooks.js";
import type { SearchBooksArgs } from "./tools/searchBooks.js";
import {
  runSearchInside,
  searchInsideDescription,
  searchInsideInput,
  searchInsideOutput,
} from "./tools/searchInside.js";
import type { SearchInsideArgs } from "./tools/searchInside.js";
import {
  runSearchItems,
  searchItemsDescription,
  searchItemsInput,
  searchItemsOutput,
} from "./tools/searchItems.js";
import type { SearchItemsArgs } from "./tools/searchItems.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** Nothing here writes, uploads or deletes; every tool only reads. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const INSTRUCTIONS = [
  "Tools for the Internet Archive. No API key and no account are needed.",
  "Three questions lead to three different tools, and choosing the wrong one gives a confident empty answer.",
  "To find a phrase written inside a book, newspaper or document, use search_inside: it reads the text scanned off the pages and returns the item and the passage.",
  "To find a work by its title, creator or subject, use search_items for anything in the catalogue, or search_books when it is a book and the author, the year or the editions matter.",
  "To see a web page as it was, use get_snapshot for one date, or list_snapshots for how often it was captured.",
  "search_inside reports 'total' as the number of documents that match, and they page: ask for the next page rather than treating the first answer as the whole of it. It reports no page number, because the index holds none.",
  "Excerpts come from optical character recognition, so the words can be wrong; repeat them as scanned text and link the page.",
  "get_snapshot always states how many days separate the capture from the date asked for, because the closest capture can be years away. Read that before describing what a page said on a date.",
  "The Internet Archive is a non-profit that charges nothing. This server paces itself, and a rate_limited error means it was asked to slow down, never that the thing you asked for is missing.",
  "Catalogue, book and full-text results carry a source_url; capture results carry the address of the capture itself. Credit the Internet Archive and link what you use.",
].join(" ");

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = new ArchiveClient({
    config,
    logger,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const server = new McpServer(
    { name: "mcp-internetarchive", version: PKG_VERSION },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "search_inside",
    {
      title: "Search inside scanned pages",
      description: searchInsideDescription,
      inputSchema: searchInsideInput,
      outputSchema: searchInsideOutput,
      annotations: READ_ONLY,
    },
    async (args) => runSearchInside(client, args as SearchInsideArgs),
  );

  server.registerTool(
    "search_items",
    {
      title: "Search the catalogue",
      description: searchItemsDescription,
      inputSchema: searchItemsInput,
      outputSchema: searchItemsOutput,
      annotations: READ_ONLY,
    },
    async (args) => runSearchItems(client, args as SearchItemsArgs),
  );

  server.registerTool(
    "get_item",
    {
      title: "Read an item",
      description: getItemDescription,
      inputSchema: getItemInput,
      outputSchema: getItemOutput,
      annotations: READ_ONLY,
    },
    async (args) => runGetItem(client, args as GetItemArgs),
  );

  server.registerTool(
    "get_snapshot",
    {
      title: "Read a page as it was",
      description: getSnapshotDescription,
      inputSchema: getSnapshotInput,
      outputSchema: getSnapshotOutput,
      annotations: READ_ONLY,
    },
    async (args) => runGetSnapshot(client, args as GetSnapshotArgs),
  );

  server.registerTool(
    "list_snapshots",
    {
      title: "List captures of a page",
      description: listSnapshotsDescription,
      inputSchema: listSnapshotsInput,
      outputSchema: listSnapshotsOutput,
      annotations: READ_ONLY,
    },
    async (args) => runListSnapshots(client, args as ListSnapshotsArgs),
  );

  server.registerTool(
    "search_books",
    {
      title: "Search works and editions",
      description: searchBooksDescription,
      inputSchema: searchBooksInput,
      outputSchema: searchBooksOutput,
      annotations: READ_ONLY,
    },
    async (args) => runSearchBooks(client, args as SearchBooksArgs),
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", ${config.minIntervalMs}ms between requests, cache ${config.cacheTtlMs}ms`,
  );

  return server;
}
