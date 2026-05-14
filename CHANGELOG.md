# Changelog

## 0.0.7 - 2026-05-14

- Resolve flag evaluations via the parent SDK's `getDetails()` so OpenFeature `ResolutionDetails`
  now carries `variant` and `flagMetadata` (configId, configType, ruleIndex, weightedValueIndex)
  (qfg-ez8e).
- Add a Prettier formatter check to CI.
- Bump `@quonfig/javascript` peer + dev dependency to `^0.0.16` (`>=0.0.16` peer floor) — the
  `getDetails()` / `EvaluationDetails` API requires it.
- Update conformance tests to mock `getDetails()` instead of the removed `get()` path; a missing
  flag now resolves with `reason: ERROR` + `errorCode: FLAG_NOT_FOUND` per the OpenFeature spec.
