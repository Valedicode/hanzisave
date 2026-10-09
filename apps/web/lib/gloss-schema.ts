import { z } from "zod";

export const GlossSchema = z.object({
  pinyin: z.string().describe("Pinyin for the word, with tone marks, e.g. 'diàn nǎo'"),
  gloss: z.string().describe("A short (<=6 word) English gloss for the word as used in this sentence"),
  example: z.string().describe("A short new example sentence in Chinese using the word, different from the input sentence"),
});

export type Gloss = z.infer<typeof GlossSchema>;

export interface GlossRequest {
  word: string;
  sentence: string;
}
