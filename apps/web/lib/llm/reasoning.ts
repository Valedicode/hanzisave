// OpenRouter's `reasoning` request option. Reasoning models spend thousands of
// hidden tokens per card; turning it off cut a card from ~20-40 s to ~5 s in
// testing. Unset leaves the model's default.
export type ReasoningParam = { enabled: false } | { effort: "low" | "medium" | "high" };

export function parseReasoning(setting: string | undefined): ReasoningParam | undefined {
  switch (setting?.trim().toLowerCase()) {
    case "off":
      return { enabled: false };
    case "low":
    case "medium":
    case "high":
      return { effort: setting.trim().toLowerCase() as "low" | "medium" | "high" };
    default:
      return undefined;
  }
}
