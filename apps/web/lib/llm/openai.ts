import OpenAI from "openai";
import { buildCardPrompt, cleanCardOutput } from "../card-prompt";
import { LlmError, type CardRequest, type LlmProvider } from "./types";

const DEFAULT_MODEL = "gpt-5.4-mini";

function toLlmError(error: unknown): LlmError {
  if (error instanceof OpenAI.AuthenticationError) {
    return new LlmError("OPENAI_API_KEY is missing or invalid", 401);
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new LlmError("rate limited, try again shortly", 429);
  }
  if (error instanceof OpenAI.APIError) {
    return new LlmError(error.message, error.status ?? 502);
  }
  return new LlmError("card request failed", 500);
}

export function createOpenAiProvider(
  client: OpenAI = new OpenAI(),
  model: string = process.env.CARD_MODEL ?? DEFAULT_MODEL,
): LlmProvider {
  return {
    async generateCard(req: CardRequest, spec: string) {
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: spec },
            { role: "user", content: buildCardPrompt(req) },
          ],
        });
        const text = completion.choices[0]?.message.content;
        if (!text) throw new LlmError("model returned no content", 502);
        return cleanCardOutput(text);
      } catch (error) {
        throw error instanceof LlmError ? error : toLlmError(error);
      }
    },
  };
}
