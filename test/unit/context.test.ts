import { describe, it, expect } from "vitest";
import { mapContext } from "../../src/context";

describe("mapContext()", () => {
  it("maps a key with a dot to namespace + property", () => {
    expect(mapContext({ "user.email": "alice@co.com" })).toEqual({
      user: { email: "alice@co.com" },
    });
  });

  it("maps a key without a dot to the empty-string namespace", () => {
    expect(mapContext({ country: "US" })).toEqual({
      "": { country: "US" },
    });
  });

  it("maps targetingKey using the default mapping (user.id)", () => {
    expect(mapContext({ targetingKey: "user-123" })).toEqual({
      user: { id: "user-123" },
    });
  });

  it("maps targetingKey using a custom targetingKeyMapping", () => {
    expect(mapContext({ targetingKey: "org-456" }, "org.id")).toEqual({
      org: { id: "org-456" },
    });
  });

  it("splits only on the FIRST dot — nested key with multiple dots", () => {
    expect(mapContext({ "user.ip.address": "1.2.3.4" })).toEqual({
      user: { "ip.address": "1.2.3.4" },
    });
  });

  it("handles multiple keys across different namespaces", () => {
    expect(
      mapContext({
        targetingKey: "user-123",
        "user.email": "alice@co.com",
        "org.tier": "enterprise",
        country: "US",
      })
    ).toEqual({
      user: { id: "user-123", email: "alice@co.com" },
      org: { tier: "enterprise" },
      "": { country: "US" },
    });
  });

  it("returns empty object for empty context", () => {
    expect(mapContext({})).toEqual({});
  });

  it("skips undefined values", () => {
    const ctx = { "user.id": undefined } as any;
    expect(mapContext(ctx)).toEqual({});
  });

  it("uses targetingKeyMapping without a dot (maps to empty-string namespace)", () => {
    expect(mapContext({ targetingKey: "abc" }, "userId")).toEqual({
      "": { userId: "abc" },
    });
  });

  it("handles boolean and number context values", () => {
    expect(mapContext({ "user.isPro": true, "user.age": 30 })).toEqual({
      user: { isPro: true, age: 30 },
    });
  });
});
