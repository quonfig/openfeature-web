# Changelog

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
