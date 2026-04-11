import { ErrorCode } from "@openfeature/web-sdk";

/**
 * Map a native SDK error (or unknown throw) to an OpenFeature ErrorCode.
 */
export function toErrorCode(err: unknown): ErrorCode {
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (msg.includes("flag not found") || msg.includes("not found")) {
    return ErrorCode.FLAG_NOT_FOUND;
  }
  if (msg.includes("type mismatch") || msg.includes("type_mismatch")) {
    return ErrorCode.TYPE_MISMATCH;
  }
  if (
    msg.includes("not initialized") ||
    msg.includes("provider_not_ready") ||
    msg.includes("call init()") ||
    msg.includes("not ready")
  ) {
    return ErrorCode.PROVIDER_NOT_READY;
  }
  return ErrorCode.GENERAL;
}
