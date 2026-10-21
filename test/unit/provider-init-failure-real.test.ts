// The B.5 mapping against the REAL @quonfig/javascript client: delivery is a
// refused local port, so init fails fast and nothing is cached (no
// localStorage under node).
import { describe, it, expect, afterEach } from "vitest";
import { ErrorCode, OpenFeature, ProviderStatus } from "@openfeature/web-sdk";
import { QuonfigInitError } from "@quonfig/javascript";
import { QuonfigWebProvider } from "../../src/provider";

const REFUSED = "http://127.0.0.1:1";
// Keep any telemetry flush off the real delivery hosts.
process.env.QUONFIG_DOMAIN = "quonfig.invalid";
let provider: QuonfigWebProvider | undefined;

afterEach(async () => {
  await provider?.shutdown();
  provider = undefined;
  await OpenFeature.clearProviders();
});

describe("init failure with the real SDK", () => {
  it('"fail": initialize rejects with QuonfigInitError and the status is ERROR', async () => {
    provider = new QuonfigWebProvider({ sdkKey: "qf_sk_test", apiUrl: REFUSED, initTimeout: 0 });
    const err = await OpenFeature.setProviderAndWait(provider).catch((e) => e);
    expect(err).toBeInstanceOf(QuonfigInitError);
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.ERROR);

    const details = OpenFeature.getClient().getBooleanDetails("some.flag", true);
    expect(details.value).toBe(true);
    expect(details.errorCode).toBe(ErrorCode.PROVIDER_NOT_READY);
  });

  it('"continue" with no cache: initialize resolves, then the status is ERROR', async () => {
    provider = new QuonfigWebProvider({
      sdkKey: "qf_sk_test",
      apiUrl: REFUSED,
      initTimeout: 0,
      onInitFailure: "continue",
    });
    await OpenFeature.setProviderAndWait(provider);
    await new Promise((r) => setTimeout(r, 5));
    expect(OpenFeature.getClient().providerStatus).toBe(ProviderStatus.ERROR);
    expect(OpenFeature.getClient().getStringDetails("some.flag", "dflt")).toMatchObject({
      value: "dflt",
      errorCode: ErrorCode.PROVIDER_NOT_READY,
    });
  });
});
