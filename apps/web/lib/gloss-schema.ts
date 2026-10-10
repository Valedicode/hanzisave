import { z } from "zod";

export const GlossSchema = z.object({
  pinyin: z.string().min(1).describe("Pinyin for the word, with tone marks, e.g. 'diànnǎo'"),
  gloss: z.string().min(1).describe("A short (<=6 word) English gloss for the word as used in this sentence"),
  example: z.string().min(1).describe("A short new example sentence in Chinese using the word, different from the input sentence"),
  // Absent on glosses cached before the preview showed them.
  examplePinyin: z.string().optional(),
  exampleTranslation: z.string().optional(),
});

export type Gloss = z.infer<typeof GlossSchema>;

export interface GlossRequest {
  word: string;
  sentence: string;
}
