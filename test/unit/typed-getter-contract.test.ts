// Typed-getter contract (qfg-zvyy) and context switch (qfg-xiub), driven
// through the real provider, the real @quonfig/javascript client and the
// OpenFeature web client. Only `fetch` is stubbed: delivery answers with the
// getter.contract fixtures (sdk-javascript test/helpers/getterContractMatrix.js,
// in the form api-delivery's eval-with-context sends them to a frontend key)
// plus a few values whose JSON shape does not match their declared type.
//
// The rule: a flag read with the method for another type returns the caller's
// default with reason ERROR and errorCode TYPE_MISMATCH. One read with the
// method for its own type whose stored value is malformed returns the default
// with errorCode PARSE_ERROR (qfg-9xsl). Strings are never coerced. OpenFeature has a single
// number getter, which reads int and double configs.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { ErrorCode, OpenFeature, StandardResolutionReasons } from "@openfeature/web-sdk";
import type { Client, EvaluationDetails, FlagValue } from "@openfeature/web-sdk";

import { QuonfigWebProvider } from "../../src/provider";

// Keep any telemetry flush off the real delivery hosts.
process.env.QUONFIG_DOMAIN = "quonfig.invalid";
const API_URL = "https://primary.quonfig.invalid";

type Stored = { type: string; value: unknown };

const STORED: Record<string, Stored> = {
  bool: { type: "bool", value: true },
  string: { type: "string", value: "fast" },
  int: { type: "int", value: 30 },
  double: { type: "double", value: 3.9 },
  "double.whole": { type: "double", value: 3 },
  "double.huge": { type: "double", value: 1e300 },
  "double.unsafe": { type: "double", value: 9007199254740992 },
  string_list: { type: "string_list", value: ["a", "b"] },
  json: { type: "json", value: { a: 1 } },
  duration: { type: "duration", value: "PT30S" },
  // qfg-dcrr: a duration whose canonical form differs from the stored text.
  "duration.seconds": { type: "duration", value: "PT90S" },
  // qfg-dcrr: a json config whose value is a JSON scalar.
  "json.true": { type: "json", value: true },
  "json.string": { type: "json", value: "fast" },
  "json.number": { type: "json", value: 3 },
  "string.false": { type: "string", value: "false" },
  "string.true": { type: "string", value: "true" },
  "string.number": { type: "string", value: "3" },
  "string.duration": { type: "string", value: "PT1S" },
  "int.malformed": { type: "int", value: "twelve" },
  "double.malformed": { type: "double", value: "abc" },
  // Values whose JSON shape does not match their declared type (sdk-javascript
  // 2.0 UPGRADE item 3). api-delivery does not send these today.
  "int.fractional": { type: "int", value: 3.5 },
  "bool.string": { type: "bool", value: "true" },
  "string_list.not_array": { type: "string_list", value: "a,b" },
  "duration.malformed": { type: "duration", value: "30s" },
};

const KEY = (name: string) => `getter.contract.${name}`;

const payload = () => ({
  evaluations: Object.fromEntries(
    Object.entries(STORED).map(([name, value]) => [
      KEY(name),
      {
        value,
        configId: `cfg-${name}`,
        configType: "config",
        valueType: value.type,
        reason: "STATIC",
      },
    ])
  ),
  meta: { version: "gen-1", environment: "Production", generation: 1 },
});

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function expectError(
  details: EvaluationDetails<FlagValue>,
  defaultValue: FlagValue,
  errorCode: ErrorCode
) {
  expect(details.value).toEqual(defaultValue);
  expect(details.reason).toBe(StandardResolutionReasons.ERROR);
  expect(details.errorCode).toBe(errorCode);
}

const expectTypeMismatch = (details: EvaluationDetails<FlagValue>, defaultValue: FlagValue) =>
  expectError(details, defaultValue, ErrorCode.TYPE_MISMATCH);

const expectParseError = (details: EvaluationDetails<FlagValue>, defaultValue: FlagValue) =>
  expectError(details, defaultValue, ErrorCode.PARSE_ERROR);

describe("typed-getter contract through the OpenFeature web client", () => {
  const DOMAIN = "typed-getter-contract";
  let provider: QuonfigWebProvider;
  let client: Client;

  beforeAll(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok(payload()))
    );
    provider = new QuonfigWebProvider({ sdkKey: "qf_pk_test", apiUrl: API_URL });
    await OpenFeature.setProviderAndWait(DOMAIN, provider, { targetingKey: "alice" });
    client = OpenFeature.getClient(DOMAIN);
  });

  afterAll(async () => {
    await OpenFeature.clearProviders();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // qfg-9xsl: a malformed value read with the method for its own type is a
  // data problem (PARSE_ERROR); read with the method for another type it is a
  // caller problem (TYPE_MISMATCH), whether or not the value parses.
  describe("malformed stored values read with their own type return the default with PARSE_ERROR", () => {
    it('number on an int config holding "twelve" returns the default', () => {
      expectParseError(client.getNumberDetails(KEY("int.malformed"), 7), 7);
    });

    it('number on a double config holding "abc" returns the default', () => {
      expectParseError(client.getNumberDetails(KEY("double.malformed"), 1.5), 1.5);
    });

    it("number on an int config holding 3.5 returns the default, not 3.5", () => {
      expectParseError(client.getNumberDetails(KEY("int.fractional"), 7), 7);
    });

    it('string on a malformed duration ("30s") returns the default', () => {
      expectParseError(client.getStringDetails(KEY("duration.malformed"), "PT0S"), "PT0S");
    });

    it('boolean on a bool config holding "true" returns the default, not true', () => {
      expectParseError(client.getBooleanDetails(KEY("bool.string"), false), false);
    });

    it("object on a string_list config holding a non-array returns the default", () => {
      expectParseError(client.getObjectDetails(KEY("string_list.not_array"), []), []);
    });
  });

  describe("malformed stored values read with another type return the default with TYPE_MISMATCH", () => {
    // @quonfig/javascript 1.x passed these through get()/getDetails() as-is.
    it('string on an int config holding "twelve" returns the default, not "twelve"', () => {
      expectTypeMismatch(client.getStringDetails(KEY("int.malformed"), "fallback"), "fallback");
    });

    it('string on a double config holding "abc" returns the default, not "abc"', () => {
      expectTypeMismatch(client.getStringDetails(KEY("double.malformed"), "fallback"), "fallback");
    });

    it('string on a bool config holding "true" returns the default, not "true"', () => {
      expectTypeMismatch(client.getStringDetails(KEY("bool.string"), "fallback"), "fallback");
    });

    it("string on a string_list config holding a non-array returns the default", () => {
      expectTypeMismatch(
        client.getStringDetails(KEY("string_list.not_array"), "fallback"),
        "fallback"
      );
    });

    it("number on a malformed duration returns the default", () => {
      expectTypeMismatch(client.getNumberDetails(KEY("duration.malformed"), 5), 5);
    });

    it("boolean on a malformed int returns the default", () => {
      expectTypeMismatch(client.getBooleanDetails(KEY("int.malformed"), true), true);
    });
  });

  describe("wrong type returns the default with TYPE_MISMATCH", () => {
    it('boolean on a stored string "false" returns the default', () => {
      expectTypeMismatch(client.getBooleanDetails(KEY("string.false"), true), true);
    });

    it('boolean on a stored string "true" returns the default, not true', () => {
      expectTypeMismatch(client.getBooleanDetails(KEY("string.true"), false), false);
    });

    it('number on a stored string "3" returns the default', () => {
      expectTypeMismatch(client.getNumberDetails(KEY("string.number"), 7), 7);
    });

    it("string on a stored int returns the default, not its text", () => {
      expectTypeMismatch(client.getStringDetails(KEY("int"), "fallback"), "fallback");
    });

    it("string on a stored bool returns the default", () => {
      expectTypeMismatch(client.getStringDetails(KEY("bool"), "fallback"), "fallback");
    });

    it("boolean on a stored int returns the default", () => {
      expectTypeMismatch(client.getBooleanDetails(KEY("int"), true), true);
    });

    it("object on a stored string returns the default", () => {
      expectTypeMismatch(client.getObjectDetails(KEY("string"), { d: true }), { d: true });
    });

    it("object on a stored bool returns the default", () => {
      expectTypeMismatch(client.getObjectDetails(KEY("bool"), { d: true }), { d: true });
    });

    it("number on a duration config returns the default", () => {
      expectTypeMismatch(client.getNumberDetails(KEY("duration"), 5), 5);
    });

    // qfg-dcrr: a json config is read with the object method, whatever JSON
    // value it holds.
    it("boolean on a json config holding true returns the default, not true", () => {
      expectTypeMismatch(client.getBooleanDetails(KEY("json.true"), false), false);
    });

    it('string on a json config holding "fast" returns the default', () => {
      expectTypeMismatch(client.getStringDetails(KEY("json.string"), "fallback"), "fallback");
    });

    it("number on a json config holding 3 returns the default", () => {
      expectTypeMismatch(client.getNumberDetails(KEY("json.number"), 7), 7);
    });
  });

  describe("matching and convertible types resolve", () => {
    it("boolean on a bool config", () => {
      const details = client.getBooleanDetails(KEY("bool"), false);
      expect(details.value).toBe(true);
      expect(details.reason).toBe(StandardResolutionReasons.STATIC);
      expect(details.errorCode).toBeUndefined();
    });

    it("string on a string config", () => {
      expect(client.getStringValue(KEY("string"), "")).toBe("fast");
    });

    it('string on a stored string "PT1S" is the string, not a duration', () => {
      expect(client.getStringValue(KEY("string.duration"), "")).toBe("PT1S");
    });

    it("number on an int config", () => {
      expect(client.getNumberValue(KEY("int"), 0)).toBe(30);
    });

    it("number on double configs (no truncation)", () => {
      expect(client.getNumberValue(KEY("double"), 0)).toBe(3.9);
      expect(client.getNumberValue(KEY("double.whole"), 0)).toBe(3);
      expect(client.getNumberValue(KEY("double.huge"), 0)).toBe(1e300);
      expect(client.getNumberValue(KEY("double.unsafe"), 0)).toBe(9007199254740992);
    });

    it("object on a json config returns the decoded value", () => {
      expect(client.getObjectValue(KEY("json"), {})).toEqual({ a: 1 });
    });

    it("object on a string_list config returns the list", () => {
      expect(client.getObjectValue(KEY("string_list"), [])).toEqual(["a", "b"]);
    });

    it("string on a duration config returns its ISO 8601 form", () => {
      const details = client.getStringDetails(KEY("duration"), "PT0S");
      expect(details.value).toBe("PT30S");
      expect(details.reason).toBe(StandardResolutionReasons.STATIC);
    });

    it('string on a duration config stored as "PT90S" returns "PT90S", not "PT1M30S" (qfg-dcrr)', () => {
      expect(client.getStringValue(KEY("duration.seconds"), "PT0S")).toBe("PT90S");
    });
  });
});

// qfg-xiub: OpenFeature.setContext() calls the provider's onContextChange,
// which calls updateContext(). With @quonfig/javascript 1.x the previous
// user's values stayed in place until the new context's fetch landed, and for
// good when it failed. (Provider 1.x named the hook onContextChanged, which
// OpenFeature never calls, so setContext() did not reach the SDK at all.)
describe("context switch never serves the previous user's values (qfg-xiub)", () => {
  const DOMAIN = "context-switch";
  let provider: QuonfigWebProvider | undefined;
  // "up": answer with alice's values; "bob": answer with bob's; "down": every
  // leg fails; "hang": requests stay pending until aborted.
  let network: "up" | "bob" | "down" | "hang";

  const adminPanelFor = (user: string) => ({
    evaluations: {
      "admin-panel": {
        value: { type: "bool", value: user === "alice" },
        configId: "cfg-admin",
        configType: "feature_flag",
        valueType: "bool",
        reason: "TARGETING_MATCH",
        ruleIndex: 0,
      },
    },
    meta: { version: "gen-7", environment: "Production", generation: 7 },
  });

  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    network = "up";
    await OpenFeature.clearProviders();
    provider = undefined;
    vi.unstubAllGlobals();
  });

  async function initAsAlice() {
    network = "up";
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
        if (network === "down") return Promise.reject(new TypeError("Failed to fetch"));
        if (network === "hang") {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          });
        }
        return Promise.resolve(ok(adminPanelFor(network === "bob" ? "bob" : "alice")));
      })
    );
    provider = new QuonfigWebProvider({
      sdkKey: "qf_pk_test",
      apiUrl: API_URL,
      timeout: 50,
      initTimeout: 0,
    });
    await OpenFeature.setProviderAndWait(DOMAIN, provider, { targetingKey: "alice" });
    const client = OpenFeature.getClient(DOMAIN);
    expect(client.getBooleanValue("admin-panel", false)).toBe(true);
    return client;
  }

  it("a failed switch to another user serves the default, not the previous user's value", async () => {
    const client = await initAsAlice();

    network = "down";
    await OpenFeature.setContext(DOMAIN, { targetingKey: "bob" }).catch(() => {});

    const details = client.getBooleanDetails("admin-panel", false);
    expect(details.value).toBe(false);
    expect(details.reason).toBe(StandardResolutionReasons.ERROR);
    // The switch cleared alice's config; bob has none yet.
    expect(details.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
  });

  it("a successful switch serves the new user's values", async () => {
    const client = await initAsAlice();

    network = "bob";
    await OpenFeature.setContext(DOMAIN, { targetingKey: "bob" });

    const details = client.getBooleanDetails("admin-panel", true);
    expect(details.value).toBe(false);
    expect(details.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    expect(provider!.getClient().contexts).toEqual({ user: { id: "bob" } });
  });

  it("while the new user's fetch is pending, reads return the default", async () => {
    const client = await initAsAlice();

    network = "hang";
    const switching = OpenFeature.setContext(DOMAIN, { targetingKey: "bob" }).catch(() => {});
    await new Promise((r) => setTimeout(r, 0));

    expect(client.getBooleanValue("admin-panel", false)).toBe(false);
    network = "down";
    await switching;
  });
});
