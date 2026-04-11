import type { EvaluationContext } from "@openfeature/web-sdk";
import type { Contexts } from "@quonfig/javascript";

/**
 * Map an OpenFeature EvaluationContext to Quonfig's nested Contexts format.
 *
 * Rules:
 * - `targetingKey` maps to the property specified by `targetingKeyMapping` (default: "user.id")
 * - Keys with a dot are split on the FIRST dot: namespace = left side, key = right side
 * - Keys without a dot go into the default ("") namespace
 */
export function mapContext(
  ofContext: EvaluationContext,
  targetingKeyMapping = "user.id"
): Contexts {
  const result: Record<string, Record<string, unknown>> = {};

  for (const [key, value] of Object.entries(ofContext)) {
    if (value === undefined) continue;

    if (key === "targetingKey") {
      const dotIdx = targetingKeyMapping.indexOf(".");
      const ns = dotIdx === -1 ? "" : targetingKeyMapping.slice(0, dotIdx);
      const prop =
        dotIdx === -1 ? targetingKeyMapping : targetingKeyMapping.slice(dotIdx + 1);
      result[ns] ??= {};
      result[ns][prop] = value;
      continue;
    }

    const dotIdx = key.indexOf(".");
    if (dotIdx === -1) {
      result[""] ??= {};
      result[""][key] = value;
    } else {
      const ns = key.slice(0, dotIdx);
      const prop = key.slice(dotIdx + 1);
      result[ns] ??= {};
      result[ns][prop] = value;
    }
  }

  return result as Contexts;
}
