/**
 * Cache, and the client's rule about what may enter it.
 *
 * It exists so that a conversation asking the same thing twice does not ask the
 * site twice. Entries expire, the store is bounded, and only what was read
 * successfully goes in: storing an answer nobody could parse would serve that
 * failure back for the rest of its lifetime.
 */

import { describe, expect, it } from "vitest";
import { Cache } from "../../src/ia/cache.js";
import { ArchiveClient } from "../../src/ia/client.js";
import { captureAsync, fixture, routedFetch, silentLogger, wait } from "./helpers.js";

const client = (fetchImpl: typeof fetch, config: Record<string, unknown> = {}) =>
  new ArchiveClient({
    config: { minIntervalMs: 500, maxRetries: 0, ...config },
    logger: silentLogger,
    fetchImpl,
  });

describe("Cache, holding a value", () => {
  it("returns what it was given, under the address that produced it", () => {
    const cache = new Cache<string>(1000, 10);
    cache.set("https://archive.org/a", "first");
    cache.set("https://archive.org/b", "second");
    expect(cache.get("https://archive.org/a")).toBe("first");
    expect(cache.get("https://archive.org/b")).toBe("second");
  });

  it("says nothing about an address it never held", () => {
    const cache = new Cache<string>(1000, 10);
    expect(
      cache.get("https://archive.org/never"),
      "an unknown key is a miss, which the client tells apart from a stored value",
    ).toBeUndefined();
  });

  it("replaces a value rather than keeping two under one address", () => {
    const cache = new Cache<string>(1000, 10);
    cache.set("k", "old");
    cache.set("k", "new");
    expect(cache.get("k")).toBe("new");
    expect(cache.size).toBe(1);
  });
});

describe("Cache, expiry", () => {
  it("forgets an entry once its time is up", async () => {
    const cache = new Cache<string>(30, 10);
    cache.set("k", "value");
    expect(cache.get("k"), "the entry is fresh to begin with").toBe("value");
    await wait(60);
    expect(
      cache.get("k"),
      "a stale entry must not be served, or the Archive's answer freezes in time",
    ).toBeUndefined();
  });

  it("keeps an entry that is still within its time", async () => {
    const cache = new Cache<string>(500, 10);
    cache.set("k", "value");
    await wait(30);
    expect(cache.get("k"), "an entry well inside its life is still good").toBe("value");
  });

  it("holds nothing at all when it was given no lifetime", () => {
    const cache = new Cache<string>(0, 10);
    cache.set("k", "value");
    expect(
      cache.get("k"),
      "a lifetime of zero is how caching is switched off, and an entry that is instantly stale must not be served",
    ).toBeUndefined();
  });
});

describe("Cache, bounds", () => {
  it("never grows past the number of entries it was given", () => {
    const cache = new Cache<number>(10_000, 3);
    for (let i = 0; i < 20; i += 1) cache.set(`k${i}`, i);
    expect(
      cache.size,
      "an unbounded cache in a long-running server is a leak, not a cache",
    ).toBeLessThanOrEqual(3);
  });

  it("drops the entry that was read least recently", () => {
    const cache = new Cache<string>(10_000, 2);
    cache.set("a", "A");
    cache.set("b", "B");
    // Reading 'a' makes 'b' the one that has gone longest without being wanted.
    expect(cache.get("a")).toBe("A");
    cache.set("c", "C");

    expect(cache.get("a"), "the entry read most recently must survive the eviction").toBe("A");
    expect(cache.get("c"), "the entry just written must survive it too").toBe("C");
    expect(
      cache.get("b"),
      "the entry nobody has asked for is the one to lose when room is needed",
    ).toBeUndefined();
  });

  it("keeps working at a bound of one", () => {
    const cache = new Cache<string>(10_000, 1);
    cache.set("a", "A");
    cache.set("b", "B");
    expect(cache.get("b")).toBe("B");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(1);
  });
});

describe("the client stores only what it could read", () => {
  it("asks the Archive once for a repeated question, and says the answer was cached", async () => {
    const { fetchImpl, calls } = routedFetch([["/metadata/", fixture("item")]]);
    const archive = client(fetchImpl);

    const first = await archive.getItem("the-glass-orchard-1971");
    const second = await archive.getItem("the-glass-orchard-1971");

    expect(calls.length, "the same address must not be fetched twice inside the cache's life").toBe(
      1,
    );
    expect(first.cached, "the first read went out").toBe(false);
    expect(
      second.cached,
      "the second must say it was cached, so a caller can qualify how fresh the answer is",
    ).toBe(true);
    expect(second.data.title).toBe(first.data.title);
  }, 10_000);

  it("does not store an answer it could not parse", async () => {
    const { fetchImpl, calls } = routedFetch([["/services/search/", fixture("search-no-body")]]);
    const archive = client(fetchImpl);

    const first = await captureAsync(() =>
      archive.searchItems({ query: "salt", limit: 10, page: 1 }),
    );
    const second = await captureAsync(() =>
      archive.searchItems({ query: "salt", limit: 10, page: 1 }),
    );

    expect(first.threw, "an unreadable answer is raised").toBe(true);
    expect(
      second.threw,
      "a cached parse failure would be served back for the rest of the cache's life",
    ).toBe(true);
    expect(
      calls.length,
      "the second question must reach the Archive again, because nothing was stored the first time",
    ).toBe(2);
  }, 10_000);

  it("does not store an answer that never arrived", async () => {
    const { fetchImpl, calls } = routedFetch([["/metadata/", fixture("item-missing")]]);
    const archive = client(fetchImpl);

    await captureAsync(() => archive.getItem("no-such-item"));
    await captureAsync(() => archive.getItem("no-such-item"));

    expect(
      calls.length,
      "an absence is not a value, and caching it would keep the answer stale after an upload",
    ).toBe(2);
  }, 10_000);

  it("keys the cache on the address, so a different question is a different entry", async () => {
    const { fetchImpl, calls } = routedFetch([["/metadata/", fixture("item")]]);
    const archive = client(fetchImpl);

    await archive.getItem("the-glass-orchard-1971");
    await archive.getItem("letters-from-the-salt-flats");

    expect(calls.length, "two identifiers are two questions").toBe(2);
  }, 10_000);

  it("goes back to the Archive when caching is switched off", async () => {
    const { fetchImpl, calls } = routedFetch([["/metadata/", fixture("item")]]);
    const archive = client(fetchImpl, { cacheTtlMs: 0 });

    await archive.getItem("the-glass-orchard-1971");
    const second = await archive.getItem("the-glass-orchard-1971");

    expect(calls.length, "a lifetime of zero means every question is asked afresh").toBe(2);
    expect(second.cached, "and no answer may claim to have been cached").toBe(false);
  }, 10_000);
});

describe("the client counts what it had to skip", () => {
  it("reports the rows it could not read alongside the page it did read", async () => {
    const { fetchImpl } = routedFetch([["/services/search/", fixture("search-catalogue")]]);
    const archive = client(fetchImpl);
    const read = await archive.searchItems({ query: "orchard", limit: 10, page: 1 });

    expect(read.skipped, "the caller is told how many rows were left out").toBe(1);
    expect(read.data.items.length).toBe(2);
    expect(
      read.data.total,
      "and the total stays the catalogue's own, so paging is not shortened by what could not be read",
    ).toBe(431);
  }, 10_000);

  it("says nothing about skipping when nothing was skipped", async () => {
    const { fetchImpl } = routedFetch([["openlibrary.org", fixture("books-empty")]]);
    const archive = client(fetchImpl);
    const read = await archive.searchBooks({ query: "nothing at all" }, 10, 1);
    expect(read.skipped, "a clean read carries no skip count to explain").toBeUndefined();
  }, 10_000);
});
