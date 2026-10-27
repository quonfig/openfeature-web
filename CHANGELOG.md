# Changelog

## 2.0.0 - unreleased

Requires `@quonfig/javascript` 2.0.0: the cross-SDK typed-getter contract (qfg-zvyy) and a context
switch that never serves the previous user's values (qfg-xiub). Raise the peer floor from `>=1.8.0`
to `>=2.0.0` (dev pin `^2.0.0`).

### UPGRADE to 2.0

1. **`OpenFeature.setContext()` now reaches the client.** The provider implemented the context hook
   as `onContextChanged`, but OpenFeature calls `onContextChange`, so in 1.x a context change after
   `setProviderAndWait()` was ignored: the client kept evaluating for the first context until the
   page reloaded. The provider now implements `onContextChange`. If you worked around this by
   calling `provider.getClient().updateContext()` yourself, remove that call. `onContextChanged`
   stays as a deprecated alias for direct callers.
2. **A context switch stops serving the previous user's values at once.** Until the new context's
   fetch lands, reads return the cached copy for that context (reason `STALE`) if this browser has
   one, and your default otherwise (reason `ERROR`, error code `FLAG_NOT_FOUND`). When the fetch
   fails, they keep returning the default rather than the previous user's values.
3. **A stored value that does not match its declared type returns your default.** An `int` holding
   `"twelve"` or `3.5`, a `double` holding `"abc"`, a `bool` holding `"true"`, or a `string_list`
   holding a non-array used to resolve through the getter that matched its JSON shape (for example
   `getStringValue` returned `"twelve"`, `getNumberValue` returned `3.5`). Every getter now returns
   your default with reason `ERROR` and error code `TYPE_MISMATCH`. api-delivery does not send such
   values today; this is a guard, not an expected path.

Reads with the getter for another type (a stored string `"true"` read as a boolean, an int read as a
string, a duration read as a number) already returned your default with `TYPE_MISMATCH`, and still
do. Durations still resolve through `getStringValue` as an ISO 8601 string.

### Changed

- New `test/unit/typed-getter-contract.test.ts` drives the real provider and the real
  `@quonfig/javascript` client through the OpenFeature web client (only `fetch` is stubbed) against
  the `getter.contract.*` fixtures from sdk-javascript's contract matrix, plus the context-switch
  cases.

## 1.1.0 - 2026-10-23

- **Init-failure status mapping (qfg-9p4i.12).** Requires `@quonfig/javascript` 1.6.0 or later,
  which adds `onInitFailure` and `initTimeout`. The provider takes both options and passes them to
  `init()`, and maps the outcome onto OpenFeature status: `"fail"` (default) rejects `initialize()`
  so the status is ERROR, while the client keeps retrying; `"wait"` keeps the provider NOT_READY
  until config arrives; `"continue"` reports STALE when serving a cached copy and ERROR (non-fatal)
  on code defaults. In every mode the provider emits `PROVIDER_READY` when the client heals.
  Evaluations served from the cached copy now report reason `STALE` (they fell through to `ERROR`
  before), and evaluations with no config return the default with error code `PROVIDER_NOT_READY`
  (was `GENERAL`). With live config nothing changes.
- Raise the `@quonfig/javascript` peer floor from `>=1.4.0` to `>=1.8.0` (dev pin `^1.8.0`). Besides
  the 1.6.0 init options above, provider users inherit sdk-javascript 1.7.0 and 1.8.0: reads of
  values seeded with `hydrate()` and reads made before `init()` are now counted in evaluation
  telemetry (qfg-27wr), and the client gains `peek()` (qfg-6vno.10). The provider does not call
  `peek()`, so its evaluations are still recorded as before.

## 1.0.3 - 2026-10-16

- Bump the `@quonfig/javascript` dev dependency to `^1.5.0` so the provider is built and tested
  against sdk-javascript 1.5.0. The peer floor stays at `>=1.4.0`: the provider uses no API added in
  1.5.0, and `>=1.4.0` already lets installs resolve 1.5.0. With 1.5.0, provider users get slower
  polling plus one ERROR log for an invalid or revoked SDK key (401/403/404/410, qfg-goi1.10.29),
  overlapping `init()` calls installing only the newer context (qfg-goi1.10.12), `stale` clearing on
  same-generation recovery, and eval-summary counters per evaluated value. No change to this
  provider's behavior.

## 1.0.2 - 2026-10-09

- Raise the `@quonfig/javascript` peer floor from `>=1.0.0` to `>=1.4.0` (dev pin `^1.4.0`) so
  provider users inherit sdk-javascript 1.4.0: superseded loads become inert and `skipLoad` + poll
  fetches the new context (context-switch races, qfg-goi1.2.7, qfg-goi1.2.48), poll/init hardening
  and a bounded last-known-good cache (qfg-goi1.2.6). No change to this provider's behavior.

## 1.0.1 - 2026-10-05

- **Fix: a Duration resolved as a string is serialized in the canonical Quonfig grammar
  (qfg-2agi.14).** `_durationToISO` folded days into hours (`P1D` -> `PT24H`) and carried float
  residue into seconds (`PT0.30000000000000004S`). It now works from the integer ms count and emits
  days as `D`, omits zero components and writes at most millisecond fractions on seconds (e.g.
  `P1DT6H2M1.5S`, `PT1M30S`, `PT0S`), matching `integration-test-data/tests/duration/grammar.yaml`.

## 1.0.0 - 2026-06-06

- **Stable 1.0.0 release.** The Quonfig OpenFeature provider for the browser is now declared stable
  and tracks `@quonfig/javascript` >= 1.0.0. No API or behavior changes from 0.0.9 — this is a
  coordinated 1.0.0 version stamp across the entire Quonfig SDK family.

## 0.0.9 - 2026-06-05

- Bump `@quonfig/javascript` peer + dev dependency to `0.0.18` (`^0.0.18` dev, `>=0.0.18` peer
  floor). The prior `^0.0.17` dev pin excluded `0.0.18` on the `0.0.x` range, so the provider could
  not pick up the underlying SDK's ETag/304 conditional polling (qfg-iikt) or the `poll()` bootstrap
  self-heal (qfg-8uw5). No provider code changes — both are transparent behavioral improvements in
  the wrapped SDK.

## 0.0.8 - 2026-05-21

- Bump `@quonfig/javascript` peer + dev dependency to `0.0.17` (`^0.0.17` dev, `>=0.0.17` peer
  floor). No provider code changes — the `0.0.17` removal of `collectLoggerNames` /
  `LoggerAggregator` (qfg-o2fk) does not affect this package.

## 0.0.7 - 2026-05-14

- Resolve flag evaluations via the parent SDK's `getDetails()` so OpenFeature `ResolutionDetails`
  now carries `variant` and `flagMetadata` (configId, configType, ruleIndex, weightedValueIndex)
  (qfg-ez8e).
- Add a Prettier formatter check to CI.
- Bump `@quonfig/javascript` peer + dev dependency to `^0.0.16` (`>=0.0.16` peer floor) — the
  `getDetails()` / `EvaluationDetails` API requires it.
- Update conformance tests to mock `getDetails()` instead of the removed `get()` path; a missing
  flag now resolves with `reason: ERROR` + `errorCode: FLAG_NOT_FOUND` per the OpenFeature spec.
