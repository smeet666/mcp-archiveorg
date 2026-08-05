/**
 * Settings, read from the environment.
 *
 * A value that cannot be read warns and falls back rather than stopping the
 * server: a typo in one variable should not take away every tool. Warnings go
 * to stderr, because stdout carries the protocol and anything written there
 * corrupts the session.
 */

import { PKG_VERSION, REPO_URL } from "./version.js";

export const LOG_LEVELS = ["silent", "error", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * The Archive serves everyone for free and asks nothing in return, so this
 * floor is not negotiable from the outside: configuration can slow the server
 * down, never speed it past a request per half second.
 */
export const MIN_ALLOWED_INTERVAL_MS = 500;
/** Beyond this a request would look hung rather than paced. */
export const MAX_ALLOWED_INTERVAL_MS = 60_000;

export interface Config {
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  /**
   * The Wayback index answers in tens of seconds on a busy URL, so it gets a
   * budget of its own rather than dragging the global one up with it.
   */
  historyTimeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

export const DEFAULT_USER_AGENT = `mcp-internetarchive/${PKG_VERSION} (+${REPO_URL})`;

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(level: LogLevel): Logger {
  const rank = LOG_LEVELS.indexOf(level);
  const write = (at: LogLevel, message: string) => {
    if (rank === 0 || LOG_LEVELS.indexOf(at) > rank) return;
    process.stderr.write(`[mcp-internetarchive] ${at}: ${message}\n`);
  };
  return {
    debug: (m) => write("debug", m),
    info: (m) => write("info", m),
    // A warning goes out at the error level so it survives the default
    // setting: a caller has to know that rows were dropped.
    warn: (m) => write("error", m),
    error: (m) => write("error", m),
  };
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    process.stderr.write(
      `[mcp-internetarchive] error: ${name}="${raw}" is not a whole number; using ${fallback}.\n`,
    );
    return fallback;
  }
  if (value < min || value > max) {
    // Clamping silently would let a caller believe a setting took effect when
    // the opposite is true, so the refusal is stated and the default stands.
    process.stderr.write(
      `[mcp-internetarchive] error: ${name}=${value} is outside ${min}..${max}; using ${fallback}.\n`,
    );
    return fallback;
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const level = env.IA_LOG_LEVEL as LogLevel | undefined;
  const logLevel = level && LOG_LEVELS.includes(level) ? level : "error";
  if (level && !LOG_LEVELS.includes(level)) {
    process.stderr.write(
      `[mcp-internetarchive] error: IA_LOG_LEVEL="${level}" is not one of ${LOG_LEVELS.join(", ")}; using error.\n`,
    );
  }

  const custom = env.IA_USER_AGENT?.trim();

  return {
    // A caller who wants to be recognised may say who they are, but the
    // contact address stays attached: the Archive has to be able to reach a
    // human about traffic it did not expect.
    userAgent: custom ? `${custom} ${DEFAULT_USER_AGENT}` : DEFAULT_USER_AGENT,
    minIntervalMs: readInteger(
      env,
      "IA_MIN_INTERVAL_MS",
      1000,
      MIN_ALLOWED_INTERVAL_MS,
      MAX_ALLOWED_INTERVAL_MS,
    ),
    timeoutMs: readInteger(env, "IA_TIMEOUT_MS", 20_000, 1000, 120_000),
    historyTimeoutMs: readInteger(env, "IA_HISTORY_TIMEOUT_MS", 60_000, 5000, 180_000),
    maxRetries: readInteger(env, "IA_MAX_RETRIES", 3, 0, 8),
    cacheTtlMs: readInteger(env, "IA_CACHE_TTL_MS", 900_000, 0, 86_400_000),
    cacheMaxEntries: readInteger(env, "IA_CACHE_MAX_ENTRIES", 200, 1, 5000),
    logLevel,
  };
}
