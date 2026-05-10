import { describe, it, expect } from "vitest";
import { ErrorCode, StandardResolutionReasons } from "@openfeature/web-sdk";
import { Quonfig } from "@quonfig/javascript";

import { QuonfigWebProvider } from "../../src/provider";

// Round-trip tests for the OpenFeature ResolutionDetails shape per
// project/plans/openfeature-resolution-details.md (qfg-ez8e).
//
// Unlike provider.test.ts, these tests use the REAL @quonfig/javascript
// Quonfig class — they hydrate it via setConfig() (no network) and then
// resolve through the provider. This catches drift between the SDK's
// getDetails() output and the provider's translation to ResolutionDetails.
//
// Three round trips, one per reason class:
//   1. STATIC          variant=`static`,         flagMetadata = configId+configType
//   2. TARGETING_MATCH variant=`targeting:<r>`,  flagMetadata adds ruleIndex
//   3. SPLIT           variant=`split:<n>`,      flagMetadata adds ruleIndex+weightedValueIndex

function providerWithHydratedClient(evaluations: Record<string, unknown>): QuonfigWebProvider {
  const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test" });
  // Drive setConfig directly on the underlying client — bypasses init/network.
  const client = provider.getClient() as Quonfig;
  (client as unknown as { setConfig: (p: unknown) => void }).setConfig({ evaluations });
  return provider;
}

describe("openfeature-web round-trip ResolutionDetails (qfg-ez8e)", () => {
  it("STATIC: variant='static', flagMetadata has configId+configType, no ruleIndex/weightedValueIndex", () => {
    const provider = providerWithHydratedClient({
      "feature.enabled": {
        value: { type: "bool", value: true },
        configId: "cfg-static",
        configType: "feature_flag",
        valueType: "bool",
        reason: "STATIC",
      },
    });

    const result = provider.resolveBooleanEvaluation("feature.enabled", false);

    expect(result.value).toBe(true);
    expect(result.reason).toBe(StandardResolutionReasons.STATIC);
    expect(result.variant).toBe("static");
    expect(result.flagMetadata).toEqual({
      configId: "cfg-static",
      configType: "FEATURE_FLAG",
    });
  });

  it("TARGETING_MATCH: variant='targeting:<r>', flagMetadata.ruleIndex set, no weightedValueIndex", () => {
    const provider = providerWithHydratedClient({
      "rules.color": {
        value: { type: "string", value: "red" },
        configId: "cfg-rules",
        configType: "config",
        valueType: "string",
        reason: "TARGETING_MATCH",
        ruleIndex: 2,
      },
    });

    const result = provider.resolveStringEvaluation("rules.color", "default");

    expect(result.value).toBe("red");
    expect(result.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    expect(result.variant).toBe("targeting:2");
    expect(result.flagMetadata).toEqual({
      configId: "cfg-rules",
      configType: "CONFIG",
      ruleIndex: 2,
    });
    expect(result.flagMetadata).not.toHaveProperty("weightedValueIndex");
  });

  it("SPLIT: variant='split:<n>', flagMetadata has both ruleIndex and weightedValueIndex", () => {
    const provider = providerWithHydratedClient({
      "ab.test": {
        value: { type: "bool", value: false },
        configId: "cfg-ab",
        configType: "feature_flag",
        valueType: "bool",
        reason: "SPLIT",
        ruleIndex: 0,
        weightedValueIndex: 1,
      },
    });

    const result = provider.resolveBooleanEvaluation("ab.test", true);

    expect(result.value).toBe(false);
    expect(result.reason).toBe(StandardResolutionReasons.SPLIT);
    expect(result.variant).toBe("split:1");
    expect(result.flagMetadata).toEqual({
      configId: "cfg-ab",
      configType: "FEATURE_FLAG",
      ruleIndex: 0,
      weightedValueIndex: 1,
    });
  });

  it("FLAG_NOT_FOUND: variant='default', empty flagMetadata, ERROR reason", () => {
    const provider = providerWithHydratedClient({});
    const result = provider.resolveBooleanEvaluation("missing.flag", false);

    expect(result.value).toBe(false);
    expect(result.reason).toBe(StandardResolutionReasons.ERROR);
    expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
    expect(result.variant).toBe("default");
    expect(result.flagMetadata).toEqual({});
  });

  it("TYPE_MISMATCH: variant='default' (provider can't coerce, returns ERROR)", () => {
    const provider = providerWithHydratedClient({
      "wrong.type": {
        value: { type: "string", value: "not-a-bool" },
        configId: "cfg-wrong",
        configType: "config",
        valueType: "string",
        reason: "STATIC",
      },
    });

    const result = provider.resolveBooleanEvaluation("wrong.type", false);

    expect(result.value).toBe(false);
    expect(result.reason).toBe(StandardResolutionReasons.ERROR);
    expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
    expect(result.variant).toBe("default");
  });
});
