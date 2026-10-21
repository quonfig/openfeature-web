// Init-failure status mapping (project/plans/2026-10-05-init-failure-design.md
// B.5), driven through the real OpenFeature web SDK so the assertions are on the
// status OpenFeature itself reports, not on provider internals.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ErrorCode,
  OpenFeature,
  ProviderEvents,
  ProviderStatus,
  StandardResolutionReasons,
} from "@openfeature/web-sdk";
import { QuonfigWebProvider } from "../../src/provider";

// A fake Quonfig client whose readiness the test drives. `heal()` mimics the
// SDK's background retry installing live config and notifying subscribers.
const state = {
  ready: true,
  stale: false,
  subscribers: new Set<() => void>(),
};
const mockInit = vi.fn();
const mockGetDetails = vi.fn();
const mockClose = vi.fn();

vi.mock("@quonfig/javascript", () => ({
  Quonfig: vi.fn().mockImplementation(function () {
    return {
      init: mockInit,
      updateContext: vi.fn().mockResolvedValue(undefined),
      getDetails: mockGetDetails,
      close: mockClose,
      isReady: () => state.ready,
      get stale() {
        return state.stale;
      },
      get loaded() {
        return state.ready || state.stale;
      },
      subscribe: (listener: () => void) => {
        state.subscribers.add(listener);
        return () => state.subscribers.delete(listener);
      },
    };
  }),
}));

function heal() {
  state.ready = true;
  state.stale = false;
  state.subscribers.forEach((l) => l());
}

class FakeInitError extends Error {
  readonly reason = "unavailable";
  constructor() {
    super("[quonfig] init FAILED: no config after 5.0s.");
    this.name = "QuonfigInitError";
  }
}

/** Let OpenFeature's .then and the provider's deferred status emit run. */
const settle = () => new Promise((r) => setTimeout(r, 5));

function notLoadedDetails() {
  return {
    value: undefined,
    reason: "ERROR",
    errorCode: "GENERAL",
    errorMessage: "Quonfig client has not finished loading",
    variant: "default",
    flagMetadata: {},
  };
}

describe("init failure -> OpenFeature provider status (B.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.ready = true;
    state.stale = false;
    state.subscribers.clear();
    mockInit.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await OpenFeature.clearProviders();
    OpenFeature.clearHandlers();
  });

  it("passes onInitFailure and initTimeout through to client.init()", async () => {
    const provider = new QuonfigWebProvider({
      sdkKey: "qf_sk_test",
      onInitFailure: "continue",
      initTimeout: 2500,
    });
    await provider.initialize();
    const args = mockInit.mock.calls[0][0];
    expect(args.onInitFailure).toBe("continue");
    expect(args.initTimeout).toBe(2500);
  });

  it("omits onInitFailure/initTimeout when not set (the SDK defaults apply)", async () => {
    const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test" });
    await provider.initialize();
    const args = mockInit.mock.calls[0][0];
    expect("onInitFailure" in args).toBe(false);
    expect("initTimeout" in args).toBe(false);
  });

  it("live config: READY", async () => {
    await OpenFeature.setProviderAndWait(new QuonfigWebProvider({ sdkKey: "qf_sk_test" }));
    await settle();
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.READY);
  });

  it("fail: initialize rejects -> ERROR, keeps the client, and emits READY on heal", async () => {
    state.ready = false;
    mockInit.mockRejectedValue(new FakeInitError());
    const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test" });

    await expect(OpenFeature.setProviderAndWait(provider)).rejects.toThrow("init FAILED");
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.ERROR);
    expect(mockClose).not.toHaveBeenCalled();

    const onReady = vi.fn();
    OpenFeature.getClient().addHandler(ProviderEvents.Ready, onReady);
    onReady.mockClear(); // addHandler fires at once only if already READY
    heal();
    await settle();
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.READY);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("continue + cached copy: STALE, then READY on heal", async () => {
    state.ready = false;
    state.stale = true;
    const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test", onInitFailure: "continue" });

    await OpenFeature.setProviderAndWait(provider);
    await settle();
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.STALE);

    heal();
    await settle();
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.READY);
  });

  it("continue without a cache: ERROR (non-fatal), then READY on heal", async () => {
    state.ready = false;
    const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test", onInitFailure: "continue" });

    await OpenFeature.setProviderAndWait(provider);
    await settle();
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.ERROR);

    heal();
    await settle();
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.READY);
  });

  it("wait: NOT_READY while initialize is pending, READY once it resolves", async () => {
    state.ready = false;
    let release!: () => void;
    mockInit.mockReturnValue(new Promise<void>((r) => (release = r)));
    const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test", onInitFailure: "wait" });

    const done = OpenFeature.setProviderAndWait(provider);
    await settle();
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.NOT_READY);

    state.ready = true;
    release();
    await done;
    await settle();
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.READY);
  });

  it("evaluations with no config report PROVIDER_NOT_READY", async () => {
    state.ready = false;
    mockGetDetails.mockReturnValue(notLoadedDetails());
    const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test", onInitFailure: "continue" });
    await provider.initialize();

    const res = provider.resolveBooleanEvaluation("flag", true);
    expect(res.value).toBe(true);
    expect(res.reason).toBe(StandardResolutionReasons.ERROR);
    expect(res.errorCode).toBe(ErrorCode.PROVIDER_NOT_READY);
  });

  it("maps the SDK's STALE reason to OpenFeature STALE", async () => {
    state.ready = false;
    state.stale = true;
    mockGetDetails.mockReturnValue({
      value: true,
      reason: "STALE",
      variant: "static",
      flagMetadata: { configId: "cfg-1", configType: "FEATURE_FLAG" },
    });
    const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test" });
    await provider.initialize();

    const res = provider.resolveBooleanEvaluation("flag", false);
    expect(res.value).toBe(true);
    expect(res.reason).toBe(StandardResolutionReasons.STALE);
    expect(res.errorCode).toBeUndefined();
  });

  it("shutdown unsubscribes from the client", async () => {
    const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test" });
    await provider.initialize();
    expect(state.subscribers.size).toBe(1);
    await provider.shutdown();
    expect(state.subscribers.size).toBe(0);
  });
});
