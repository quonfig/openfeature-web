import {
  ErrorCode,
  OpenFeatureEventEmitter,
  Provider,
  ResolutionDetails,
  StandardResolutionReasons,
} from "@openfeature/web-sdk";
import type { EvaluationContext, JsonValue, ResolutionReason } from "@openfeature/web-sdk";
import { Quonfig } from "@quonfig/javascript";
import type { EvaluationDetails } from "@quonfig/javascript";

import { mapContext } from "./context";
import { toErrorCode } from "./errors";

export interface QuonfigWebProviderOptions {
  sdkKey: string;
  /** Which Quonfig context property the OpenFeature targetingKey maps to. Default: "user.id" */
  targetingKeyMapping?: string;
  /** Override the Quonfig API base URL. */
  apiUrl?: string;
  /** Request timeout in ms. */
  timeout?: number;
}

export class QuonfigWebProvider implements Provider {
  readonly metadata = { name: "quonfig-web" } as const;
  readonly runsOn = "client" as const;
  hooks = [];
  readonly events = new OpenFeatureEventEmitter();

  private client: Quonfig;
  private readonly targetingKeyMapping: string;
  private readonly sdkKey: string;
  private readonly apiUrl: string | undefined;
  private readonly timeout: number | undefined;

  constructor(options: QuonfigWebProviderOptions) {
    this.sdkKey = options.sdkKey;
    this.targetingKeyMapping = options.targetingKeyMapping ?? "user.id";
    this.apiUrl = options.apiUrl;
    this.timeout = options.timeout;
    this.client = new Quonfig();
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    const nativeCtx = context ? mapContext(context, this.targetingKeyMapping) : { "": {} };

    await this.client.init({
      sdkKey: this.sdkKey,
      context: nativeCtx,
      ...(this.apiUrl !== undefined && { apiUrl: this.apiUrl }),
      ...(this.timeout !== undefined && { timeout: this.timeout }),
    });
  }

  async onContextChanged(_oldCtx: EvaluationContext, newCtx: EvaluationContext): Promise<void> {
    const nativeCtx = mapContext(newCtx, this.targetingKeyMapping);
    await this.client.updateContext(nativeCtx);
  }

  async shutdown(): Promise<void> {
    await this.client.close();
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    _context?: EvaluationContext
  ): ResolutionDetails<boolean> {
    return this._resolve(flagKey, defaultValue, "boolean");
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    _context?: EvaluationContext
  ): ResolutionDetails<string> {
    return this._resolve(flagKey, defaultValue, "string");
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    _context?: EvaluationContext
  ): ResolutionDetails<number> {
    return this._resolve(flagKey, defaultValue, "number");
  }

  resolveObjectEvaluation<T extends JsonValue = JsonValue>(
    flagKey: string,
    defaultValue: T,
    _context?: EvaluationContext
  ): ResolutionDetails<T> {
    return this._resolve(flagKey, defaultValue, "object");
  }

  /** Escape hatch: access the underlying Quonfig client directly. */
  getClient(): Quonfig {
    return this.client;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _resolve<T>(
    flagKey: string,
    defaultValue: T,
    expectedType: "boolean" | "string" | "number" | "object"
  ): ResolutionDetails<T> {
    let details: EvaluationDetails;
    try {
      details = this.client.getDetails(flagKey);
    } catch (err) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: toErrorCode(err),
        variant: "default",
        flagMetadata: {},
      };
    }

    // Errors from the SDK side (FLAG_NOT_FOUND, GENERAL) — pass through.
    if (details.reason === "ERROR") {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: toOFErrorCode(details.errorCode),
        ...(details.errorMessage ? { errorMessage: details.errorMessage } : {}),
        variant: details.variant,
        flagMetadata: details.flagMetadata as ResolutionDetails<T>["flagMetadata"],
      };
    }

    // Coerce the resolved value to the expected OF shape. A null result
    // signals provider-level TYPE_MISMATCH (the SDK has no requested-type
    // hint, so this happens here, not inside getDetails).
    const coerced = this._coerce<T>(details.value, expectedType, defaultValue);
    if (coerced === null) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        // OF spec convention: variant='default' on the error path; preserve
        // flagMetadata so consumers still see configId/configType.
        variant: "default",
        flagMetadata: details.flagMetadata as ResolutionDetails<T>["flagMetadata"],
      };
    }

    return {
      value: coerced,
      reason: toOFReason(details.reason),
      variant: details.variant,
      flagMetadata: details.flagMetadata as ResolutionDetails<T>["flagMetadata"],
    };
  }

  /**
   * Coerce a raw ConfigValue to the expected OF type.
   * Returns null if the type does not match (signals TYPE_MISMATCH).
   */
  private _coerce<T>(
    raw: unknown,
    expectedType: "boolean" | "string" | "number" | "object",
    defaultValue: T
  ): T | null {
    switch (expectedType) {
      case "boolean":
        if (typeof raw === "boolean") return raw as unknown as T;
        return null;

      case "string":
        if (typeof raw === "string") return raw as unknown as T;
        // Duration objects: return ISO 8601 string representation
        if (raw !== null && typeof raw === "object" && "seconds" in raw && "ms" in raw) {
          return this._durationToISO(raw as { seconds: number; ms: number }) as unknown as T;
        }
        return null;

      case "number":
        if (typeof raw === "number") return raw as unknown as T;
        return null;

      case "object":
        // Arrays (string_list) and plain objects both satisfy "object"
        if (Array.isArray(raw)) return raw as unknown as T;
        if (raw !== null && typeof raw === "object") return raw as unknown as T;
        return null;

      default:
        return null;
    }
  }

  /** Convert a Quonfig Duration to an ISO 8601 duration string (e.g. "PT1H30M"). */
  private _durationToISO(duration: { seconds: number; ms: number }): string {
    const totalSeconds = duration.seconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    let iso = "PT";
    if (hours > 0) iso += `${hours}H`;
    if (minutes > 0) iso += `${minutes}M`;
    if (secs > 0 || iso === "PT") iso += `${secs}S`;
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map sdk-javascript's EvaluationReason onto OpenFeature's StandardResolutionReasons.
 * SPLIT is provider-defined; OF allows arbitrary strings, so the literal value works.
 */
function toOFReason(reason: EvaluationDetails["reason"]): ResolutionReason {
  switch (reason) {
    case "STATIC":
      return StandardResolutionReasons.STATIC;
    case "TARGETING_MATCH":
      return StandardResolutionReasons.TARGETING_MATCH;
    case "SPLIT":
      return StandardResolutionReasons.SPLIT;
    case "DEFAULT":
      return StandardResolutionReasons.DEFAULT;
    case "ERROR":
    default:
      return StandardResolutionReasons.ERROR;
  }
}

/** Translate sdk-javascript's EvaluationErrorCode onto the OF ErrorCode enum. */
function toOFErrorCode(code: EvaluationDetails["errorCode"]): ErrorCode {
  switch (code) {
    case "FLAG_NOT_FOUND":
      return ErrorCode.FLAG_NOT_FOUND;
    case "TYPE_MISMATCH":
      return ErrorCode.TYPE_MISMATCH;
    case "GENERAL":
    default:
      return ErrorCode.GENERAL;
  }
}
