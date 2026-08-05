/**
 * One error type, carrying a code the caller can branch on.
 *
 * The distinction that matters most is between "the Archive holds nothing for
 * this" and "the question could not be asked". Collapsing the two lets a model
 * report an absence it never established, which is a false statement about the
 * world rather than a missing feature.
 */

export type ErrorCode =
  /** The Archive answered, and holds no such item, URL or snapshot. */
  | "not_found"
  /** The arguments cannot produce a request. */
  | "invalid_input"
  /** The Archive asked this client to slow down or refused it for now. */
  | "rate_limited"
  /** A response arrived in a shape this server cannot read. */
  | "parse_failure"
  /** The request could not be completed. */
  | "network_error"
  /** The request was abandoned before an answer arrived. */
  | "timeout";

export interface ErrorDetails {
  /** What the caller can do about it, when there is something. */
  hint?: string;
  /** The address that produced the failure, for a bug report. */
  url?: string;
  status?: number;
}

export class ArchiveError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;

  constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = "ArchiveError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message: string, details?: ErrorDetails) =>
  new ArchiveError("not_found", message, details);

export const invalidInput = (message: string, hint?: string) =>
  new ArchiveError("invalid_input", message, hint ? { hint } : {});

export const rateLimited = (message: string, details?: ErrorDetails) =>
  new ArchiveError("rate_limited", message, {
    hint: "Wait a moment and ask again. This says nothing about whether the Archive holds what you asked for.",
    ...details,
  });

export const parseFailure = (message: string, details?: ErrorDetails) =>
  new ArchiveError("parse_failure", message, {
    hint: `The Archive may have changed how it answers. Please report this at ${"https://github.com/smeet666/mcp-internetarchive/issues"} with the arguments you used.`,
    ...details,
  });

export const networkError = (message: string, details?: ErrorDetails) =>
  new ArchiveError("network_error", message, details);

export const timeout = (message: string, details?: ErrorDetails) =>
  new ArchiveError("timeout", message, details);
