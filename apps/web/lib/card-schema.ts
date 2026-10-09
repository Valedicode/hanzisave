import { z } from "zod";

export const CardRequestSchema = z.object({
  item: z.string().trim().min(1).max(60),
  type: z.enum(["word", "grammar"]),
  context: z.string().max(400).optional(),
  hsk: z.string().max(8).optional(),
  oldBack: z.string().max(4000).optional(),
});
