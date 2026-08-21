/**
 * loadConfig, createLogger and the pacing floor.
 *
 * The rule that shapes this file: a setting that cannot be read warns and falls
 * back, because a typo in one variable must not take away every tool, and the
 * warning goes to stderr because stdout carries the protocol.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_USER_AGENT,
  LOG_LEVELS,
  MAX_ALLOWED_INTERVAL_MS,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../../src/config.js";
import { ArchiveClient } from "../../src/ia/client.js";
import { PKG_VERSION, REPO_URL } from "../../src/version.js";

const IA_KEYS = [
  "IA_USER_AGENT",
  "IA_MIN_INTERVAL_MS",
  "IA_TIMEOUT_MS",
  "IA_HISTORY_TIMEOUT_MS",
  "IA_MAX_RETRIES",
  "IA_CACHE_TTL_MS",
  "IA_CACHE_MAX_ENTRIES",
  "IA_LOG_LEVEL",
];

let saved: Record<string, string | undefined> = {};
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  saved = Object.fromEntries(IA_KEYS.map((key) => [key, process.env[key]]));
  for (const key of IA_KEYS) {
    delete process.env[key];
  }
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  stderr.mockRestore();
});

/** What went to stderr while a config was read. */
const warnings = () =>
  (stderr.mock.calls as unknown as unknown[][]).map((call) => String(call[0])).join("");

describe("loadConfig, defaults", () => {
  it("gives every setting a value when the environment says nothing", () => {
    const config = loadConfig(process.env);
    expect(config.minIntervalMs, "a second between requests by default").toBe(1000);
    expect(config.timeoutMs).toBe(20_000);
    expect(
      config.historyTimeoutMs,
      "the capture index answers in tens of seconds and gets a budget of its own",
    ).toBe(60_000);
    expect(config.historyTimeoutMs).toBeGreaterThan(config.timeoutMs);
    expect(config.maxRetries).toBe(3);
    expect(config.cacheTtlMs).toBe(900_000);
    expect(config.cacheMaxEntries).toBe(200);
    expect(config.logLevel, "silence by default, except for errors").toBe("error");
  });

  it("names the version and a contact address in the User-Agent", () => {
    const config = loadConfig(process.env);
    expect(config.userAgent).toBe(DEFAULT_USER_AGENT);
    expect(config.userAgent, "the Archive has to be able to tell which build is calling").toContain(
      PKG_VERSION,
    );
    expect(config.userAgent, "and to be able to reach a human about it").toContain(REPO_URL);
  });

  it("says nothing on stderr when nothing is wrong", () => {
    loadConfig(process.env);
    expect(warnings(), "a clean environment produces no diagnostics").toBe("");
  });
});

describe("loadConfig, a caller who says who they are", () => {
  it("keeps the contact address alongside the caller's own name", () => {
    process.env.IA_USER_AGENT = "my-research-bot/2.0";
    const config = loadConfig(process.env);
    expect(config.userAgent, "the caller's name is honoured").toContain("my-research-bot/2.0");
    expect(
      config.userAgent,
      "and the contact address stays attached, so unexpected traffic can be traced to a human",
    ).toContain(REPO_URL);
  });

  it("ignores a User-Agent that is only whitespace", () => {
    process.env.IA_USER_AGENT = "   ";
    expect(loadConfig(process.env).userAgent, "blank is not a name").toBe(DEFAULT_USER_AGENT);
  });
});

describe("loadConfig, a value that cannot be read", () => {
  const badValues: [string, string, keyof ReturnType<typeof loadConfig>, unknown][] = [
    ["IA_MIN_INTERVAL_MS", "soon", "minIntervalMs", 1000],
    ["IA_MIN_INTERVAL_MS", "1.5", "minIntervalMs", 1000],
    ["IA_TIMEOUT_MS", "", "timeoutMs", 20_000],
    ["IA_MAX_RETRIES", "lots", "maxRetries", 3],
    ["IA_CACHE_MAX_ENTRIES", "NaN", "cacheMaxEntries", 200],
  ];

  for (const [key, raw, field, fallback] of badValues) {
    it(`falls back when ${key}="${raw}", rather than crashing the server`, () => {
      process.env[key] = raw;
      const config = loadConfig(process.env);
      expect(
        config[field],
        "one unreadable setting must not take away every tool, so the default stands",
      ).toBe(fallback);
    });
  }

  it("says on stderr which setting it refused and what it used instead", () => {
    process.env.IA_MAX_RETRIES = "lots";
    loadConfig(process.env);
    const said = warnings();
    expect(said, "the refusal names the setting").toContain("IA_MAX_RETRIES");
    expect(said, "and the value it fell back to, so the caller is not misled").toContain("3");
  });

  it("writes its diagnostics to stderr alone, because stdout carries the protocol", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.env.IA_LOG_LEVEL = "chatty";
    loadConfig(process.env);
    expect(
      stdout.mock.calls.length,
      "a stray line on stdout corrupts the session for the client",
    ).toBe(0);
    expect(warnings()).toContain("IA_LOG_LEVEL");
    stdout.mockRestore();
  });

  it("refuses a value out of range rather than clamping it silently", () => {
    process.env.IA_TIMEOUT_MS = "500";
    const config = loadConfig(process.env);
    expect(
      config.timeoutMs,
      "clamping would let a caller believe a setting took effect when the opposite is true",
    ).toBe(20_000);
    expect(warnings()).toContain("IA_TIMEOUT_MS");
  });

  it("falls back to the error level when the log level is not one it knows", () => {
    process.env.IA_LOG_LEVEL = "chatty";
    expect(loadConfig(process.env).logLevel).toBe("error");
  });

  it("accepts every level it publishes", () => {
    for (const level of LOG_LEVELS) {
      process.env.IA_LOG_LEVEL = level;
      expect(loadConfig(process.env).logLevel, `${level} is a level this server names`).toBe(level);
    }
  });
});

describe("loadConfig, the environment it was handed", () => {
  it("reads the environment passed to it and not the process's own", () => {
    process.env.IA_MIN_INTERVAL_MS = "5000";
    const config = loadConfig({});
    expect(
      config.minIntervalMs,
      "loadConfig takes an environment as an argument, and a caller who passes an empty one asks for the defaults; reading process.env behind its back makes the parameter a lie and lets ambient settings leak into a caller's own configuration",
    ).toBe(1000);
  });
});

describe("the pacing floor", () => {
  it("states a floor of half a second between requests", () => {
    expect(
      MIN_ALLOWED_INTERVAL_MS,
      "the Archive serves everyone for free, so this is the fastest this server may go",
    ).toBe(500);
    expect(MAX_ALLOWED_INTERVAL_MS).toBe(60_000);
  });

  it("refuses an interval below the floor from the environment", () => {
    process.env.IA_MIN_INTERVAL_MS = "50";
    expect(
      loadConfig(process.env).minIntervalMs,
      "a value under the floor is refused, and the default stands",
    ).toBe(1000);
  });

  it("holds the floor against a configuration object built by hand", () => {
    const client = new ArchiveClient({ config: { minIntervalMs: 1 } });
    expect(
      client.intervalMs,
      "a caller of the published client has not been through loadConfig, so the floor is enforced rather than assumed",
    ).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });

  it("lets a caller go slower than the default, which is always allowed", () => {
    const client = new ArchiveClient({ config: { minIntervalMs: 4000 } });
    expect(client.intervalMs, "configuration may slow this server down, never speed it up").toBe(
      4000,
    );
  });
});

describe("createLogger", () => {
  it("writes nothing at all when silenced", () => {
    const logger = createLogger("silent");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(warnings(), "silent means silent, including for errors").toBe("");
  });

  it("writes an error at the error level and keeps quiet about the rest", () => {
    const logger = createLogger("error");
    logger.debug("a debug line");
    logger.info("an info line");
    logger.error("an error line");
    const said = warnings();
    expect(said).toContain("an error line");
    expect(said, "debug output at the error level is noise").not.toContain("a debug line");
    expect(said).not.toContain("an info line");
  });

  it("keeps a warning visible at the error level, because a skipped row must be seen", () => {
    const logger = createLogger("error");
    logger.warn("skipped 2 unreadable rows");
    expect(
      warnings(),
      "a warning tells the operator the Archive's shape may have changed, which is worth an error line",
    ).toContain("skipped 2 unreadable rows");
  });

  it("writes debug output only when asked for it", () => {
    const logger = createLogger("debug");
    logger.debug("cache hit");
    expect(warnings()).toContain("cache hit");
  });

  it("prefixes every line with the server's name, so it can be told apart in a shared log", () => {
    createLogger("info").info("ready");
    expect(warnings()).toContain("[mcp-archiveorg]");
  });
});
