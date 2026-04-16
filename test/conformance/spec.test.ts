// OpenFeature spec conformance tests for @quonfig/openfeature-web.
// Web provider uses static-context (client-side) paradigm with synchronous evaluation.
// References: https://openfeature.dev/specification/sections/providers
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode, StandardResolutionReasons } from "@openfeature/web-sdk";
import { QuonfigWebProvider } from "../../src/provider";

const mockGet = vi.fn();
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockUpdateContext = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();

vi.mock("@quonfig/javascript", () => ({
  Quonfig: vi.fn().mockImplementation(() => ({
    init: mockInit,
    updateContext: mockUpdateContext,
    get: mockGet,
    close: mockClose,
  })),
}));

function makeProvider() {
  return new QuonfigWebProvider({ sdkKey: "qf_sk_test" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInit.mockResolvedValue(undefined);
  mockGet.mockReturnValue(undefined); // default: flag not found
});

// ---------------------------------------------------------------------------
// 2.2 — Error codes
// ---------------------------------------------------------------------------
describe("2.2 — Error codes", () => {
  it("2.2.2: FLAG_NOT_FOUND when get() returns undefined", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(undefined);

    expect(provider.resolveBooleanEvaluation("missing", false).errorCode).toBe(
      ErrorCode.FLAG_NOT_FOUND,
    );
    expect(provider.resolveStringEvaluation("missing", "x").errorCode).toBe(
      ErrorCode.FLAG_NOT_FOUND,
    );
    expect(provider.resolveNumberEvaluation("missing", 0).errorCode).toBe(
      ErrorCode.FLAG_NOT_FOUND,
    );
    expect(provider.resolveObjectEvaluation("missing", {}).errorCode).toBe(
      ErrorCode.FLAG_NOT_FOUND,
    );
  });

  it("2.2.3: TYPE_MISMATCH when flag value does not match requested type", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue("a string");

    // Requesting boolean from a string flag -> TYPE_MISMATCH
    expect(provider.resolveBooleanEvaluation("my-flag", false).errorCode).toBe(
      ErrorCode.TYPE_MISMATCH,
    );
  });

  it("2.2.3: TYPE_MISMATCH when requesting string from a boolean flag", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(true);

    expect(provider.resolveStringEvaluation("my-flag", "x").errorCode).toBe(
      ErrorCode.TYPE_MISMATCH,
    );
  });
});

// ---------------------------------------------------------------------------
// 2.1 — Default value returned on error
// ---------------------------------------------------------------------------
describe("2.1 — Default value returned on error", () => {
  it("returns boolean default when flag missing", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(undefined);

    expect(provider.resolveBooleanEvaluation("missing", true).value).toBe(true);
    expect(provider.resolveBooleanEvaluation("missing", false).value).toBe(false);
  });

  it("returns string default when flag missing", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(undefined);

    expect(provider.resolveStringEvaluation("missing", "sentinel").value).toBe("sentinel");
  });

  it("returns number default when flag missing", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(undefined);

    expect(provider.resolveNumberEvaluation("missing", 42).value).toBe(42);
  });

  it("returns object default when flag missing", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(undefined);

    const def = { x: 1 };
    expect(provider.resolveObjectEvaluation("missing", def).value).toEqual(def);
  });

  it("returns default when type mismatch occurs", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue("not-a-bool");

    expect(provider.resolveBooleanEvaluation("my-flag", true).value).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2.7 — Resolution reasons
// ---------------------------------------------------------------------------
describe("2.7 — Resolution reasons", () => {
  it("returns STATIC reason for found boolean flag", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(true);

    expect(provider.resolveBooleanEvaluation("my-flag", false).reason).toBe(
      StandardResolutionReasons.STATIC,
    );
  });

  it("returns STATIC reason for found string flag", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue("hello");

    expect(provider.resolveStringEvaluation("my-flag", "").reason).toBe(
      StandardResolutionReasons.STATIC,
    );
  });

  it("returns DEFAULT reason for missing flag", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(undefined);

    expect(provider.resolveBooleanEvaluation("missing", false).reason).toBe(
      StandardResolutionReasons.DEFAULT,
    );
  });

  it("returns ERROR reason for type mismatch", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue("a-string");

    expect(provider.resolveBooleanEvaluation("my-flag", false).reason).toBe(
      StandardResolutionReasons.ERROR,
    );
  });
});

// ---------------------------------------------------------------------------
// 2.4 — All four evaluation types return correct values
// ---------------------------------------------------------------------------
describe("2.4 — All evaluation types", () => {
  it("resolves boolean correctly", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(true);

    expect(provider.resolveBooleanEvaluation("flag", false).value).toBe(true);
  });

  it("resolves string correctly", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue("world");

    expect(provider.resolveStringEvaluation("flag", "").value).toBe("world");
  });

  it("resolves number correctly", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(99);

    expect(provider.resolveNumberEvaluation("flag", 0).value).toBe(99);
  });

  it("resolves array (string_list) as object correctly", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue(["a", "b"]);

    expect(provider.resolveObjectEvaluation("flag", []).value).toEqual(["a", "b"]);
  });

  it("resolves JSON object correctly", async () => {
    const provider = makeProvider();
    await provider.initialize();
    mockGet.mockReturnValue({ tier: "pro" });

    expect(provider.resolveObjectEvaluation("flag", {}).value).toEqual({ tier: "pro" });
  });
});

// ---------------------------------------------------------------------------
// 2.8 — Provider metadata
// ---------------------------------------------------------------------------
describe("2.8 — Provider metadata", () => {
  it("has a non-empty name in metadata", () => {
    const provider = makeProvider();
    expect(provider.metadata.name).toBeTruthy();
    expect(typeof provider.metadata.name).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// onContextChanged (client-side paradigm)
// ---------------------------------------------------------------------------
describe("onContextChanged — static-context update", () => {
  it("calls updateContext on the native client when context changes", async () => {
    const provider = makeProvider();
    await provider.initialize({ targetingKey: "user-1", "org.tier": "pro" });

    await provider.onContextChanged(
      { targetingKey: "user-1" },
      { targetingKey: "user-2", "org.tier": "enterprise" },
    );

    expect(mockUpdateContext).toHaveBeenCalledOnce();
    const ctx = mockUpdateContext.mock.calls[0][0];
    expect(ctx).toMatchObject({ user: { id: "user-2" }, org: { tier: "enterprise" } });
  });
});
