import OpenAI from "openai";
import { buildCardPrompt, cleanCardOutput } from "../card-prompt";
import { GLOSS_SYSTEM, buildGlossPrompt, parseGloss } from "../gloss-prompt";
import { WORD_CHECK_SYSTEM, buildWordCheckPrompt, parseWordCheck } from "../word-check-prompt";
import { OCR_PROMPT } from "../ocr-prompt";
import { parseReasoning } from "./reasoning";
import type { GlossRequest } from "../gloss-schema";
import { LlmError, type CardRequest, type ImageInput, type LlmProvider } from "./types";

const DEFAULT_MODEL = "gpt-5.4-mini";

function toLlmError(error: unknown): LlmError {
  if (error instanceof OpenAI.AuthenticationError) {
    return new LlmError("OPENAI_API_KEY is missing or invalid", 401);
  }
  if (error instanceof OpenAI.RateLimitError) {
    if (error.code === "insufficient_quota" || error.code === "credit_balance_exhausted") {
      return new LlmError("OpenAI credits exhausted; add credits or switch provider", 402);
    }
    return new LlmError("rate limited, try again shortly", 429);
  }
  if (error instanceof OpenAI.APIError) {
    return new LlmError(error.message, error.status ?? 502);
  }
  return new LlmError("card request failed", 500);
}

export function createOpenAiProvider(
  client: OpenAI = new OpenAI(),
  model: string = process.env.CARD_MODEL || DEFAULT_MODEL,
  reasoning = parseReasoning(process.env.CARD_REASONING),
  ocrModel: string = process.env.OCR_MODEL || model,
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
          // OpenRouter extension, not in the OpenAI SDK types; ignored by endpoints without it.
          ...(reasoning && { reasoning }),
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
        const text = completion.choices[0]?.message.content;
        if (!text) throw new LlmError("model returned no content", 502);
        return cleanCardOutput(text);
      } catch (error) {
        throw error instanceof LlmError ? error : toLlmError(error);
      }
    },
    async generateGloss(req: GlossRequest) {
      // One retry: an open-weight model now and then wraps the JSON in prose or breaks it.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const completion = await client.chat.completions.create({
            model,
            max_tokens: 600,
            messages: [
              { role: "system", content: GLOSS_SYSTEM },
              { role: "user", content: buildGlossPrompt(req) },
            ],
            ...(reasoning && { reasoning }),
          } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
          const gloss = parseGloss(completion.choices[0]?.message.content ?? "");
          if (gloss) return gloss;
        } catch (error) {
          throw error instanceof LlmError ? error : toLlmError(error);
        }
      }
      throw new LlmError("model returned an unusable gloss", 502);
    },
    async checkWords(candidates: string[]) {
      if (candidates.length === 0) return [];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const completion = await client.chat.completions.create({
            model,
            max_tokens: 800,
            messages: [
              { role: "system", content: WORD_CHECK_SYSTEM },
              { role: "user", content: buildWordCheckPrompt(candidates) },
            ],
            ...(reasoning && { reasoning }),
          } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
          const words = parseWordCheck(completion.choices[0]?.message.content ?? "", candidates);
          if (words) return words;
        } catch (error) {
          throw error instanceof LlmError ? error : toLlmError(error);
        }
      }
      throw new LlmError("model returned an unusable word check", 502);
    },
    async extractText(image: ImageInput) {
      try {
        const completion = await client.chat.completions.create({
          model: ocrModel,
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: OCR_PROMPT },
                { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data}` } },
              ],
            },
          ],
          ...(reasoning && { reasoning }),
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
        return (completion.choices[0]?.message.content ?? "").trim();
      } catch (error) {
        throw error instanceof LlmError ? error : toLlmError(error);
      }
    },
  };
}
