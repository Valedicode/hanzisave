// What we ask a vision model to do with a photo of text. Kept separate so the
// comparison script and the app use the exact same instruction.
export const OCR_PROMPT = [
  "Transcribe all the Chinese text in this image exactly as written.",
  "Keep the original line breaks and punctuation.",
  "Do not translate, explain, add pinyin, or correct the text.",
  "If part of the image has no Chinese text, ignore it.",
  "Output only the transcribed text. If there is no Chinese text, output nothing.",
].join(" ");
