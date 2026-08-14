/**
 * One GET, with a deadline and bounded retries.
 *
 * Two things separate a retry worth making from one that only adds load. A
 * refusal that carries a time to come back is obeyed rather than guessed at,
 * and an answer the site meant is never retried: asking again for something
 * that is not there wastes a request and delays the honest answer.
 */

import {
  invalidInput,
  networkError,
  notFound,
  parseFailure,
  rateLimited,
  timeout as timeoutError,
} from "../errors.js";
import type { Logger } from "../config.js";
import type { RateLimiter } from "./rateLimiter.js";

export interface FetchOptions {
  url: string;
  userAgent: string;
  timeoutMs: number;
  maxRetries: number;
  limiter: RateLimiter;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

/** Statuses worth another attempt: the site is busy, not answering "no". */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
/** Statuses that mean the site is asking for room. */
const PUSH_BACK = new Set([429, 503]);

/**
 * The longest wait worth taking rather than reporting.
 *
 * A refusal may name any delay, and an hour is a legal answer. Sleeping through
 * it holds the one request slot this server has, so every other tool waits
 * behind a call whose caller has long since given up. Past this point the wait
 * is the answer, and the caller decides what to do with it.
 */
const LONGEST_WAIT_MS = 30_000;

/**
 * How many times a request that never answered is worth repeating.
 *
 * A route that did not respond within its budget is busy. Repeating the same
 * query adds load to what is already struggling, and each attempt holds the
 * slot for the full deadline again.
 */
const RETRIES_AFTER_SILENCE = 1;

/**
 * Read a Retry-After header, which is either a number of seconds or a date.
 * Returns null when it says neither, so the caller falls back to its own wait.
 */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now);
}

/**
 * What a request the site read and refused was refused about.
 *
 * The part of a request a caller can change differs by route: a search carries
 * an expression the site parses, a capture lookup carries a web address, an
 * item read carries an identifier. One wording for all three sends most callers
 * to check syntax in a request that holds no syntax, so each route says what it
 * actually sent.
 */
export function describeRefusal(url: string): { message: string; hint?: string } {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  if (parsed?.searchParams.has("user_query") || parsed?.searchParams.has("q")) {
    return {
      message: "The Internet Archive would not accept this search.",
      hint: "The words are read as a query expression, so a quotation mark, bracket or colon left unbalanced in them is read as an operator.",
    };
  }
  if (parsed?.pathname.startsWith("/metadata/")) {
    return {
      message: "The Internet Archive would not accept the identifier this request names.",
      hint: "Pass the identifier on its own, which is the last part of an item's address: 'nasa' rather than 'https://archive.org/details/nasa'.",
    };
  }
  if (parsed?.searchParams.has("url")) {
    return {
      message: "The Internet Archive would not accept the web address this request names.",
      hint: "Pass one address, such as 'lemonde.fr' or 'https://lemonde.fr/'.",
    };
  }
  return { message: "The Internet Archive would not accept this request." };
}

/**
 * What the Archive said it objected to, when it said anything.
 *
 * A refusal aimed at the request carries a sentence naming what was wrong with
 * it, under `response.error` or in the `response.errors` list. Returning null
 * means the body held no such sentence, which is the case that must not be
 * reported as the caller's mistake.
 */
export function statedReason(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const response = (parsed as { response?: unknown })?.response as
    { error?: { message?: unknown }; errors?: Array<{ message?: unknown }> } | undefined;
  if (!response) return null;

  const listed = Array.isArray(response.errors)
    ? response.errors
        .map((entry) => entry?.message)
        .filter(
          (message): message is string => typeof message === "string" && message.trim() !== "",
        )
    : [];
  if (listed.length > 0) return listed.join("; ");

  const single = response.error?.message;
  return typeof single === "string" && single.trim() !== "" ? single : null;
}

/** Growing wait with jitter, so several clients do not return in step. */
function backoffMs(attempt: number): number {
  const base = Math.min(8000, 400 * 2 ** attempt);
  return base + Math.floor(Math.random() * 250);
}

export async function fetchText(options: FetchOptions): Promise<string> {
  const { url, userAgent, timeoutMs, maxRetries, limiter, logger } = options;
  const doFetch = options.fetchImpl ?? fetch;

  let lastError: Error | null = null;
  /** Honoured before the next attempt rather than slept after the last one. */
  let askedWaitMs = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (askedWaitMs > 0) {
      logger.debug(`waiting ${askedWaitMs}ms, as asked`);
      await new Promise((resolve) => setTimeout(resolve, askedWaitMs));
      askedWaitMs = 0;
    }
    await limiter.beforeRequest();

    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), timeoutMs);

    try {
      logger.debug(`GET ${url}`);
      const response = await doFetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "user-agent": userAgent, accept: "application/json, text/plain, */*" },
      });

      if (response.ok) {
        limiter.succeeded();
        return await response.text();
      }

      if (PUSH_BACK.has(response.status)) {
        limiter.pushBack();
        await response.body?.cancel().catch(() => undefined);
        const asked = parseRetryAfter(response.headers.get("retry-after"));

        if (asked !== null && asked > LONGEST_WAIT_MS) {
          throw rateLimited(
            `The Internet Archive asked this client to wait ${Math.round(asked / 1000)} seconds (HTTP ${response.status}).`,
            { url, status: response.status },
          );
        }
        if (attempt >= maxRetries) {
          throw rateLimited(
            `The Internet Archive asked this client to slow down (HTTP ${response.status}).`,
            { url, status: response.status },
          );
        }
        askedWaitMs = asked ?? backoffMs(attempt);
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      if (RETRYABLE.has(response.status) && attempt < maxRetries) {
        // An abandoned body keeps its socket out of the pool until it is
        // consumed or cancelled.
        await response.body?.cancel().catch(() => undefined);
        lastError = new Error(`HTTP ${response.status}`);
        askedWaitMs = backoffMs(attempt);
        continue;
      }

      // The site read the request and would not run it. It uses this status
      // both for a request it objects to and for one it declines to serve at
      // that moment, and only the first carries a sentence saying what was
      // wrong. Reading a bare refusal as the caller's mistake sends them to
      // correct a request the site never objected to.
      if (response.status === 400 || response.status === 422) {
        const stated = statedReason(await response.text().catch(() => ""));
        if (stated !== null) {
          const refusal = describeRefusal(url);
          throw invalidInput(`${refusal.message} It said: ${stated}`, refusal.hint);
        }

        if (attempt < maxRetries) {
          lastError = new Error(`HTTP ${response.status}`);
          askedWaitMs = backoffMs(attempt);
          continue;
        }
        throw networkError(
          `The Internet Archive refused this request without stating a reason (HTTP ${response.status}).`,
          { url, status: response.status },
        );
      }

      // The site answered, and answered that it holds nothing at this address.
      // Calling that a network failure invites a retry of a settled question.
      if (response.status === 404 || response.status === 410) {
        throw notFound("The Internet Archive holds nothing at this address.", {
          url,
          status: response.status,
        });
      }

      throw networkError(`The Internet Archive answered HTTP ${response.status}.`, {
        url,
        status: response.status,
      });
    } catch (error) {
      clearTimeout(deadline);

      // An error this module raised on purpose already says what happened.
      if (error instanceof Error && error.name === "ArchiveError") throw error;

      if (error instanceof Error && error.name === "AbortError") {
        lastError = error;
        if (attempt >= Math.min(maxRetries, RETRIES_AFTER_SILENCE)) {
          throw timeoutError(
            `No answer from the Internet Archive within ${timeoutMs}ms. The capture index in particular can take tens of seconds.`,
            { url },
          );
        }
        askedWaitMs = backoffMs(attempt);
        continue;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= maxRetries) {
        throw networkError(`Could not reach the Internet Archive: ${lastError.message}`, { url });
      }
      askedWaitMs = backoffMs(attempt);
      continue;
    } finally {
      clearTimeout(deadline);
    }
  }

  throw networkError(
    `Could not reach the Internet Archive: ${lastError?.message ?? "no attempt was made"}`,
    { url },
  );
}

/** Fetch and parse JSON, keeping the two failures apart. */
export async function fetchJson<T = unknown>(options: FetchOptions): Promise<T> {
  const body = await fetchText(options);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw parseFailure("The Internet Archive answered with something that is not JSON.", {
      url: options.url,
    });
  }
}
