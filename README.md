# @quonfig/openfeature-web

OpenFeature provider for [Quonfig](https://quonfig.com) — Web/Browser.

Works with both vanilla JS (`@openfeature/web-sdk`) and React (`@openfeature/react-sdk`).
The React SDK re-exports the web SDK and adds hooks (`useFlag`, `useBooleanFlagValue`, etc.) —
any web provider works with React hooks automatically.

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
  sdkKey: "qf_sk_...",               // required
  targetingKeyMapping: "user.id",    // default; maps OpenFeature targetingKey
  apiUrl: "https://custom.api.com",  // optional — override API base URL
  timeout: 5000,                     // optional — request timeout in ms
});
```

## Context mapping

OpenFeature uses a flat context; Quonfig uses a namespace-nested context.
The provider maps between them using dot-notation:

| OpenFeature key         | Quonfig context             |
|-------------------------|-----------------------------|
| `targetingKey: "u-123"` | `{ user: { id: "u-123" } }` |
| `"user.email": "a@b.c"` | `{ user: { email: "a@b.c" } }` |
| `"org.tier": "pro"`     | `{ org: { tier: "pro" } }`  |
| `"country": "US"`       | `{ "": { country: "US" } }` |

Keys without a dot go into the default (empty-string) namespace.

To use a different property for `targetingKey`:

```typescript
new QuonfigWebProvider({ sdkKey: "...", targetingKeyMapping: "account.id" });
```

## What you lose vs. the native SDK

The OpenFeature interface covers boolean, string, number, and object types.
Some Quonfig-native features require `provider.getClient()` (the escape hatch):

1. **Log levels** (`shouldLog`, `logger`) — native SDK only
2. **`string_list` configs** — access via `getObjectValue` and cast to `string[]`
3. **`duration` configs** — `getStringValue` returns an ISO 8601 string; parse client-side
4. **`bytes` configs** — not accessible via OpenFeature
5. **`keys()` and `raw()`** — native SDK only
6. **Context keys** must use dot-notation (`"user.email"`), not nested objects
7. **`targetingKey`** maps to `user.id` by default — configure `targetingKeyMapping` if different

```typescript
// Escape hatch for Quonfig-native features
const native = provider.getClient();
native.shouldLog({ loggerName: "auth", desiredLevel: "DEBUG", defaultLevel: "WARN" });
```

## License

MIT
