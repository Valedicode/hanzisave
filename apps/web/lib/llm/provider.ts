import { createOpenAiProvider } from "./openai";

// The one provider instance the route handlers share. Switching vendor means
// changing this line (and adding the implementation next to openai.ts).
export const provider = createOpenAiProvider();
