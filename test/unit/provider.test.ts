import { describe, it, expect, vi, beforeEach } from "vitest";
import { ErrorCode, StandardResolutionReasons } from "@openfeature/web-sdk";
import { QuonfigWebProvider } from "../../src/provider";

// ---------------------------------------------------------------------------
// Mock the Quonfig class from @quonfig/javascript
// ---------------------------------------------------------------------------
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockUpdateContext = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockClose = vi.fn();

vi.mock("@quonfig/javascript", () => {
  return {
    Quonfig: vi.fn().mockImplementation(() => ({
      init: mockInit,
      updateContext: mockUpdateContext,
      get: mockGet,
      close: mockClose,
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(opts?: Partial<ConstructorParameters<typeof QuonfigWebProvider>[0]>) {
  return new QuonfigWebProvider({
    sdkKey: "qf_sk_test",
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QuonfigWebProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // initialize()
  // -------------------------------------------------------------------------
  describe("initialize()", () => {
    it("calls client.init() with sdkKey and mapped context", async () => {
      const provider = makeProvider();
      await provider.initialize({ targetingKey: "user-1", "org.tier": "pro" });

      expect(mockInit).toHaveBeenCalledOnce();
      const args = mockInit.mock.calls[0][0];
      expect(args.sdkKey).toBe("qf_sk_test");
      expect(args.context).toEqual({
        user: { id: "user-1" },
        org: { tier: "pro" },
      });
    });

    it("passes apiUrl and timeout when provided", async () => {
      const provider = makeProvider({ apiUrl: "https://custom.quonfig.com", timeout: 5000 });
      await provider.initialize({});

      const args = mockInit.mock.calls[0][0];
      expect(args.apiUrl).toBe("https://custom.quonfig.com");
      expect(args.timeout).toBe(5000);
    });

    it("uses default empty context when no context provided", async () => {
      const provider = makeProvider();
      await provider.initialize(undefined);

      const args = mockInit.mock.calls[0][0];
      expect(args.context).toEqual({ "": {} });
    });
  });

  // -------------------------------------------------------------------------
  // onContextChanged()
  // -------------------------------------------------------------------------
  describe("onContextChanged()", () => {
    it("calls client.updateContext() with mapped new context", async () => {
      const provider = makeProvider();
      await provider.onContextChanged(
        { targetingKey: "old-user" },
        { targetingKey: "new-user", "org.plan": "enterprise" }
      );

      expect(mockUpdateContext).toHaveBeenCalledOnce();
      expect(mockUpdateContext).toHaveBeenCalledWith({
        user: { id: "new-user" },
        org: { plan: "enterprise" },
      });
    });

    it("respects custom targetingKeyMapping", async () => {
      const provider = makeProvider({ targetingKeyMapping: "account.uid" });
      await provider.onContextChanged({}, { targetingKey: "acc-999" });

      expect(mockUpdateContext).toHaveBeenCalledWith({
        account: { uid: "acc-999" },
      });
    });
  });

  // -------------------------------------------------------------------------
  // shutdown()
  // -------------------------------------------------------------------------
  describe("shutdown()", () => {
    it("calls client.close()", async () => {
      const provider = makeProvider();
      await provider.shutdown();
      expect(mockClose).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // resolveBooleanEvaluation()
  // -------------------------------------------------------------------------
  describe("resolveBooleanEvaluation()", () => {
    it("returns the boolean value from the client", () => {
      mockGet.mockReturnValue(true);
      const provider = makeProvider();
      const result = provider.resolveBooleanEvaluation("my-flag", false);
      expect(result.value).toBe(true);
      expect(result.reason).toBe(StandardResolutionReasons.STATIC);
    });

    it("returns default + FLAG_NOT_FOUND when key is missing", () => {
      mockGet.mockReturnValue(undefined);
      const provider = makeProvider();
      const result = provider.resolveBooleanEvaluation("missing-flag", false);
      expect(result.value).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
    });

    it("returns default + TYPE_MISMATCH when value is wrong type", () => {
      mockGet.mockReturnValue("not-a-bool");
      const provider = makeProvider();
      const result = provider.resolveBooleanEvaluation("str-flag", false);
      expect(result.value).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
    });

    it("returns default + error code when client.get() throws", () => {
      mockGet.mockImplementation(() => {
        throw new Error("not initialized");
      });
      const provider = makeProvider();
      const result = provider.resolveBooleanEvaluation("any-flag", false);
      expect(result.value).toBe(false);
      expect(result.errorCode).toBe(ErrorCode.PROVIDER_NOT_READY);
    });
  });

  // -------------------------------------------------------------------------
  // resolveStringEvaluation()
  // -------------------------------------------------------------------------
  describe("resolveStringEvaluation()", () => {
    it("returns the string value from the client", () => {
      mockGet.mockReturnValue("hello");
      const provider = makeProvider();
      const result = provider.resolveStringEvaluation("str-flag", "default");
      expect(result.value).toBe("hello");
      expect(result.reason).toBe(StandardResolutionReasons.STATIC);
    });

    it("returns ISO 8601 for a Duration value", () => {
      mockGet.mockReturnValue({ seconds: 5400, ms: 5400000 }); // 1h30m
      const provider = makeProvider();
      const result = provider.resolveStringEvaluation("duration-flag", "PT0S");
      expect(result.value).toBe("PT1H30M");
    });

    it("returns TYPE_MISMATCH for a boolean value", () => {
      mockGet.mockReturnValue(true);
      const provider = makeProvider();
      const result = provider.resolveStringEvaluation("bool-flag", "default");
      expect(result.value).toBe("default");
      expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
    });
  });

  // -------------------------------------------------------------------------
  // resolveNumberEvaluation()
  // -------------------------------------------------------------------------
  describe("resolveNumberEvaluation()", () => {
    it("returns a number value", () => {
      mockGet.mockReturnValue(42);
      const provider = makeProvider();
      const result = provider.resolveNumberEvaluation("num-flag", 0);
      expect(result.value).toBe(42);
    });

    it("returns TYPE_MISMATCH for a string value", () => {
      mockGet.mockReturnValue("forty-two");
      const provider = makeProvider();
      const result = provider.resolveNumberEvaluation("str-flag", 0);
      expect(result.value).toBe(0);
      expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
    });
  });

  // -------------------------------------------------------------------------
  // resolveObjectEvaluation()
  // -------------------------------------------------------------------------
  describe("resolveObjectEvaluation()", () => {
    it("returns a plain object value", () => {
      const obj = { foo: "bar" };
      mockGet.mockReturnValue(obj);
      const provider = makeProvider();
      const result = provider.resolveObjectEvaluation("obj-flag", {});
      expect(result.value).toEqual({ foo: "bar" });
    });

    it("returns a string_list (array) value", () => {
      mockGet.mockReturnValue(["a", "b", "c"]);
      const provider = makeProvider();
      const result = provider.resolveObjectEvaluation<string[]>("list-flag", []);
      expect(result.value).toEqual(["a", "b", "c"]);
    });

    it("returns TYPE_MISMATCH for a string scalar", () => {
      mockGet.mockReturnValue("just-a-string");
      const provider = makeProvider();
      const result = provider.resolveObjectEvaluation("str-flag", {});
      expect(result.value).toEqual({});
      expect(result.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
    });
  });

  // -------------------------------------------------------------------------
  // getClient()
  // -------------------------------------------------------------------------
  describe("getClient()", () => {
    it("returns the underlying Quonfig instance", () => {
      const provider = makeProvider();
      const client = provider.getClient();
      expect(client).toBeDefined();
      expect(typeof client.get).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // metadata
  // -------------------------------------------------------------------------
  describe("metadata", () => {
    it("has the correct provider name", () => {
      const provider = makeProvider();
      expect(provider.metadata.name).toBe("quonfig-web");
    });
  });
});
