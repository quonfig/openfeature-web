// qfg-wg1n: an upcoming @quonfig/javascript reports a value that cannot be
// parsed as its declared type (a malformed stored int, double or duration) as
// errorCode PARSE_ERROR. Released versions (2.0.x) never do: they report
// TYPE_MISMATCH, and the provider turns that into PARSE_ERROR when the getter
// matches the config's declared type (qfg-9xsl). The provider must handle both.
//
// The SDK details result is stubbed here, because no released SDK emits
// PARSE_ERROR yet.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode, StandardResolutionReasons } from "@openfeature/web-sdk";
import { QuonfigWebProvider } from "../../src/provider";

const mockGetDetails = vi.fn();
let mockConfigs: Record<string, { type: string }> | undefined;

vi.mock("@quonfig/javascript", () => {
  return {
    Quonfig: vi.fn().mockImplementation(function () {
      return {
        init: vi.fn().mockResolvedValue(undefined),
        updateContext: vi.fn().mockResolvedValue(undefined),
        getDetails: mockGetDetails,
        close: vi.fn(),
        isReady: () => true,
        loaded: true,
        stale: false,
        subscribe: () => () => {},
        get configs() {
          return mockConfigs;
        },
      };
    }),
  };
});

function errorDetails(errorCode: string) {
  return {
    value: undefined,
    reason: "ERROR",
    errorCode,
    errorMessage: 'Config "cfg.key" could not be parsed',
    variant: "default",
    flagMetadata: { configId: "cfg-1", configType: "CONFIG" },
  };
}

describe("SDK PARSE_ERROR passthrough (qfg-wg1n)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigs = {};
  });

  it("passes PARSE_ERROR through when the SDK does not expose the declared type", () => {
    mockConfigs = undefined;
    mockGetDetails.mockReturnValue(errorDetails("PARSE_ERROR"));
    const result = new QuonfigWebProvider({ sdkKey: "k" }).resolveNumberEvaluation("cfg.key", 7);
    expect(result.value).toBe(7);
    expect(result.reason).toBe(StandardResolutionReasons.ERROR);
    expect(result.errorCode).toBe(ErrorCode.PARSE_ERROR);
    expect(result.errorMessage).toBe('Config "cfg.key" could not be parsed');
  });

  it("passes PARSE_ERROR through when the getter matches the declared type", () => {
    mockConfigs = { "cfg.key": { type: "int" } };
    mockGetDetails.mockReturnValue(errorDetails("PARSE_ERROR"));
    const result = new QuonfigWebProvider({ sdkKey: "k" }).resolveNumberEvaluation("cfg.key", 7);
    expect(result.value).toBe(7);
    expect(result.errorCode).toBe(ErrorCode.PARSE_ERROR);
  });

  it("passes PARSE_ERROR through for a malformed duration read as a string", () => {
    mockConfigs = { "cfg.key": { type: "duration" } };
    mockGetDetails.mockReturnValue(errorDetails("PARSE_ERROR"));
    const result = new QuonfigWebProvider({ sdkKey: "k" }).resolveStringEvaluation(
      "cfg.key",
      "PT0S"
    );
    expect(result.value).toBe("PT0S");
    expect(result.errorCode).toBe(ErrorCode.PARSE_ERROR);
  });

  it("reports TYPE_MISMATCH when a malformed config is read with the getter for another type", () => {
    // ITD tests/openfeature Case 6: a wrong-type read is a caller problem.
    mockConfigs = { "cfg.key": { type: "int" } };
    mockGetDetails.mockReturnValue(errorDetails("PARSE_ERROR"));
    const result = new QuonfigWebProvider({ sdkKey: "k" }).resolveBooleanEvaluation(
      "cfg.key",
      true
    );
    expect(result.value).toBe(true);
    expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
  });

  it("keeps the released-SDK workaround: TYPE_MISMATCH on the declared type's getter is PARSE_ERROR", () => {
    mockConfigs = { "cfg.key": { type: "double" } };
    mockGetDetails.mockReturnValue(errorDetails("TYPE_MISMATCH"));
    const result = new QuonfigWebProvider({ sdkKey: "k" }).resolveNumberEvaluation("cfg.key", 1.5);
    expect(result.errorCode).toBe(ErrorCode.PARSE_ERROR);
  });

  it("an unknown SDK error code still maps to GENERAL", () => {
    mockGetDetails.mockReturnValue(errorDetails("SOMETHING_NEW"));
    const result = new QuonfigWebProvider({ sdkKey: "k" }).resolveNumberEvaluation("cfg.key", 7);
    expect(result.errorCode).toBe(ErrorCode.GENERAL);
  });
});
