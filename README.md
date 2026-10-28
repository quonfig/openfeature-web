# @quonfig/openfeature-web

OpenFeature provider for [Quonfig](https://quonfig.com) — Web/Browser.

Works with both vanilla JS (`@openfeature/web-sdk`) and React (`@openfeature/react-sdk`). The React
SDK re-exports the web SDK and adds hooks (`useFlag`, `useBooleanFlagValue`, etc.) — any web
provider works with React hooks automatically.

## Installation

```bash
# Vanilla web
npm install @quonfig/openfeature-web @quonfig/javascript @openfeature/web-sdk

# React
npm install @quonfig/openfeature-web @quonfig/javascript @openfeature/react-sdk
```

## Quick start

### Vanilla JS

```typescript
import { OpenFeature } from "@openfeature/web-sdk";
import { QuonfigWebProvider } from "@quonfig/openfeature-web";

const provider = new QuonfigWebProvider({
  sdkKey: "qf_sk_...",
});

await OpenFeature.setContext({
  targetingKey: "user-123",
  "user.email": "alice@example.com",
  "org.tier": "enterprise",
});

await OpenFeature.setProviderAndWait(provider);

const client = OpenFeature.getClient();
const isEnabled = client.getBooleanValue("my-flag", false);
```

### React

```typescript
import { OpenFeatureProvider, useBooleanFlagValue } from "@openfeature/react-sdk";
import { OpenFeature } from "@openfeature/web-sdk";
import { QuonfigWebProvider } from "@quonfig/openfeature-web";

const provider = new QuonfigWebProvider({ sdkKey: "qf_sk_..." });
await OpenFeature.setProviderAndWait(provider);

function MyComponent() {
  const enabled = useBooleanFlagValue("my-flag", false);
  return <div>{enabled ? "Feature on" : "Feature off"}</div>;
}

function App() {
  return (
    <OpenFeatureProvider>
      <MyComponent />
    </OpenFeatureProvider>
  );
}
```

## Configuration

```typescript
const provider = new QuonfigWebProvider({
  sdkKey: "qf_sk_...", // required
  targetingKeyMapping: "user.id", // default; maps OpenFeature targetingKey
  apiUrl: "https://custom.api.com", // optional — override API base URL
  timeout: 5000, // optional — request timeout in ms
  onInitFailure: "fail", // optional — "fail" (default) | "wait" | "continue"
  initTimeout: 5000, // optional — ms to keep retrying before onInitFailure applies
});
```

### Init failure and provider status

When no config can be loaded by `initTimeout`, `onInitFailure` decides what `initialize()` does. A
cached last-known-good copy in localStorage counts as config in every mode.

| `onInitFailure`        | `initialize()`                  | Provider status   | When delivery comes back |
| ---------------------- | ------------------------------- | ----------------- | ------------------------ |
| `"fail"` (default)     | Rejects (`QuonfigInitError`)    | ERROR             | `PROVIDER_READY`         |
| `"wait"`               | Stays pending until config      | NOT_READY         | `initialize()` resolves  |
| `"continue"` + cache   | Resolves                        | STALE             | `PROVIDER_READY`         |
| `"continue"`, no cache | Resolves, then `PROVIDER_ERROR` | ERROR (non-fatal) | `PROVIDER_READY`         |

The client keeps retrying in the background in every mode. Evaluations served from the cached copy
report reason `STALE`; with no config at all they return your default with error code
`PROVIDER_NOT_READY`.

## Context mapping

OpenFeature uses a flat context; Quonfig uses a namespace-nested context. The provider maps between
them using dot-notation:

| OpenFeature key         | Quonfig context                |
| ----------------------- | ------------------------------ |
| `targetingKey: "u-123"` | `{ user: { id: "u-123" } }`    |
| `"user.email": "a@b.c"` | `{ user: { email: "a@b.c" } }` |
| `"org.tier": "pro"`     | `{ org: { tier: "pro" } }`     |
| `"country": "US"`       | `{ "": { country: "US" } }`    |

Keys without a dot go into the default (empty-string) namespace.

To use a different property for `targetingKey`:

```typescript
new QuonfigWebProvider({ sdkKey: "...", targetingKeyMapping: "account.id" });
```

### Changing the context

Call `OpenFeature.setContext()` when the user changes (sign-in, sign-out, switching accounts). The
provider passes the new context to the client at once and fetches its values. Until that fetch
lands, reads return the cached copy for the new context (reason `STALE`) if this browser has one,
and your defaults otherwise. They never return the previous user's values, even when the fetch
fails.

## Typed reads

Each OpenFeature getter reads only the config types that match it. Any other read returns your
default with reason `ERROR` and error code `TYPE_MISMATCH`:

| Getter            | Reads                                      |
| ----------------- | ------------------------------------------ |
| `getBooleanValue` | `bool`                                     |
| `getStringValue`  | `string`; `duration` as an ISO 8601 string |
| `getNumberValue`  | `int` and `double`                         |
| `getObjectValue`  | `json`; `string_list` as an array          |

Strings are never coerced: a stored `"true"` is not a boolean and a stored `"3"` is not a number.

A stored value that cannot be parsed as its declared type (an `int` holding `"twelve"` or `3.5`, a
`duration` holding `"30s"`) returns your default with reason `ERROR` and error code `PARSE_ERROR`
when you read it with the getter for that type (`getNumberValue` on the `int`, `getStringValue` on
the `duration`). Read with the getter for another type, it is `TYPE_MISMATCH` as above.

## What you lose vs. the native SDK

The OpenFeature interface covers boolean, string, number, and object types. Some Quonfig-native
features require `provider.getClient()` (the escape hatch):

1. **Log levels** (`shouldLog`, `logger`) — native SDK only
2. **`string_list` configs** — access via `getObjectValue` and cast to `string[]`
3. **`duration` configs** — `getStringValue` returns an ISO 8601 string; parse client-side, or read
   it natively with `provider.getClient().getDuration(key, defaultValue)` (`{ seconds, ms }`).
   `getNumberValue` on a duration returns your default with `TYPE_MISMATCH`.
4. **`bytes` configs** — not accessible via OpenFeature
5. **Bulk config access** (`extract()`, the `configs` getter, `get()`) — native SDK only
6. **Context keys** must use dot-notation (`"user.email"`), not nested objects
7. **`targetingKey`** maps to `user.id` by default — configure `targetingKeyMapping` if different

```typescript
// Escape hatch for Quonfig-native features
const native = provider.getClient();
native.shouldLog({ configKey: "log-level.auth", desiredLevel: "DEBUG", defaultLevel: "WARN" });
```

## License

MIT
