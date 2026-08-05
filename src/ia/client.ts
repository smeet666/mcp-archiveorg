/**
 * The one place that talks to the Internet Archive.
 *
 * It holds a single rate limiter and a single cache, so pacing applies to the
 * server as a whole rather than to whichever tool happens to be running. It
 * imports nothing from the MCP layer and is published on its own, so the same
 * code serves a plain script.
 *
 * Every read fetches, parses and only then stores: a response nobody could
 * parse must not be served back for the rest of the cache's lifetime.
 */

import { invalidInput } from "../errors.js";
import type { Config, Logger } from "../config.js";
import { MIN_ALLOWED_INTERVAL_MS, createLogger, loadConfig } from "../config.js";
import { REPO_URL } from "../version.js";
import type {
  Book,
  InsideResults,
  ItemDetail,
  NearestSnapshot,
  SearchResults,
  SnapshotHistory,
} from "../types.js";
import { Cache } from "./cache.js";
import { fetchJson } from "./http.js";
import {
  toBooks,
  toInsideResults,
  toItemDetail,
  toNearestSnapshot,
  toSearchResults,
  toSnapshotHistory,
} from "./parse.js";
import { RateLimiter } from "./rateLimiter.js";
import type { CatalogueQuery } from "./urls.js";
import {
  booksUrl,
  catalogueUrl,
  historyUrl,
  insideUrl,
  metadataUrl,
  nearestUrl,
  toArchiveStamp,
} from "./urls.js";

export interface ClientOptions {
  config?: Partial<Config>;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** Every read reports whether it went out, so a caller can say what it knows. */
export interface Read<T> {
  data: T;
  cached: boolean;
  /** Rows the site sent that could not be read, which paging still counts. */
  skipped?: number;
}

/**
 * The two things this server owes the Internet Archive, applied to whatever it
 * is handed.
 *
 * A configuration object assembled by a caller has not been through
 * `loadConfig`, so it can carry a missing value, a value of the wrong shape, or
 * a User-Agent that names somebody else. Requests stay spaced, and the address
 * the Archive would use to reach a human stays in the User-Agent, whichever of
 * those arrives.
 */
function withGuarantees(config: Config): Config {
  const defaults = loadConfig({});

  /** A setting that is absent or unreadable falls back rather than propagating. */
  const number = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const claimed = typeof config.userAgent === "string" ? config.userAgent.trim() : "";
  const identifier = defaults.userAgent;

  return {
    ...config,
    // A caller may say who they are. Appending rather than replacing means the
    // Archive can always tell which software is calling, and reach someone.
    userAgent:
      claimed === "" || claimed.includes(REPO_URL) ? identifier : `${claimed} ${identifier}`,
    minIntervalMs: Math.max(
      MIN_ALLOWED_INTERVAL_MS,
      number(config.minIntervalMs, defaults.minIntervalMs),
    ),
    timeoutMs: number(config.timeoutMs, defaults.timeoutMs),
    historyTimeoutMs: number(config.historyTimeoutMs, defaults.historyTimeoutMs),
    maxRetries: number(config.maxRetries, defaults.maxRetries),
    cacheTtlMs: number(config.cacheTtlMs, defaults.cacheTtlMs),
    cacheMaxEntries: number(config.cacheMaxEntries, defaults.cacheMaxEntries),
  };
}

export class ArchiveClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly limiter: RateLimiter;
  private readonly cache: Cache<unknown>;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: ClientOptions = {}) {
    const base = { ...loadConfig(), ...options.config };
    this.config = withGuarantees(base);
    this.logger = options.logger ?? createLogger(this.config.logLevel);
    this.limiter = new RateLimiter({ intervalMs: this.config.minIntervalMs });
    this.cache = new Cache(this.config.cacheTtlMs, this.config.cacheMaxEntries);
    this.fetchImpl = options.fetchImpl;
  }

  /** The pacing in force, which widens when the Archive pushes back. */
  get intervalMs(): number {
    return this.limiter.currentIntervalMs;
  }

  /** What the Archive sees this client call itself. */
  get userAgent(): string {
    return this.config.userAgent;
  }

  private async read<T>(
    url: string,
    parse: (payload: unknown, onSkip: (n: number) => void) => T,
    timeoutMs = this.config.timeoutMs,
  ): Promise<Read<T>> {
    const cached = this.cache.get(url) as T | undefined;
    if (cached !== undefined) {
      this.logger.debug(`cache hit ${url}`);
      return { data: cached, cached: true };
    }

    let skipped = 0;
    const payload = await this.limiter.schedule(() =>
      fetchJson({
        url,
        userAgent: this.config.userAgent,
        timeoutMs,
        maxRetries: this.config.maxRetries,
        limiter: this.limiter,
        logger: this.logger,
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      }),
    );

    const data = parse(payload, (n) => {
      skipped += n;
      this.logger.warn(`skipped ${n} unreadable row(s) from ${url}`);
    });
    this.cache.set(url, data);
    return skipped > 0 ? { data, cached: false, skipped } : { data, cached: false };
  }

  searchItems(query: CatalogueQuery): Promise<Read<SearchResults>> {
    const url = catalogueUrl(query);
    return this.read(url, (payload, onSkip) => toSearchResults(payload, url, onSkip));
  }

  searchInside(query: string, limit: number, page: number): Promise<Read<InsideResults>> {
    const url = insideUrl(query, limit, page);
    return this.read(url, (payload, onSkip) => toInsideResults(payload, url, onSkip));
  }

  getItem(identifier: string): Promise<Read<ItemDetail>> {
    const trimmed = identifier.trim();
    if (trimmed === "") {
      return Promise.reject(invalidInput("An item identifier is required."));
    }
    const url = metadataUrl(trimmed);
    return this.read(url, (payload) => toItemDetail(payload, trimmed, url));
  }

  getSnapshot(target: string, at?: Date): Promise<Read<NearestSnapshot>> {
    const url = nearestUrl(target, at ? toArchiveStamp(at) : undefined);
    return this.read(url, (payload) => toNearestSnapshot(payload, target, at ?? null, url));
  }

  /** Uses its own deadline: the capture index answers in tens of seconds. */
  listSnapshots(target: string, limit: number, cursor?: string): Promise<Read<SnapshotHistory>> {
    const url = historyUrl(target, limit, cursor);
    return this.read(
      url,
      (payload, onSkip) => toSnapshotHistory(payload, target, url, onSkip),
      this.config.historyTimeoutMs,
    );
  }

  searchBooks(
    query: string,
    limit: number,
    page: number,
  ): Promise<Read<{ total: number; books: Book[] }>> {
    const url = booksUrl(query, limit, page);
    return this.read(url, (payload, onSkip) => toBooks(payload, url, onSkip));
  }
}
