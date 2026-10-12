import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import { VERDICTS } from "@/db/types";

export const reportOutputSchema = z.object({
  headline: z.string().min(5).max(200),
  funds: z
    .array(
      z.object({
        schemeCode: z.string(),
        summary: z.string().min(20),
        citedHeadlineIds: z.array(z.string()),
      }),
    )
    .min(1),
  verdict: z.enum(VERDICTS),
  verdictReason: z.string().min(10),
  jargonUsed: z.array(z.string()),
});

export type ReportOutput = z.infer<typeof reportOutputSchema>;

/** The same shape for Gemini's `responseSchema` (OpenAPI subset). */
export const geminiResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: "One line: the week in plain words." },
    funds: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          schemeCode: { type: Type.STRING },
          summary: {
            type: Type.STRING,
            description: "Exactly 3 sentences: (1) how it did, (2) vs the market and similar funds, (3) which provided headlines explain the gap, or that none clearly do.",
          },
          citedHeadlineIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["schemeCode", "summary", "citedHeadlineIds"],
        propertyOrdering: ["schemeCode", "summary", "citedHeadlineIds"],
      },
    },
    verdict: { type: Type.STRING, enum: [...VERDICTS] },
    verdictReason: { type: Type.STRING, description: "Specific: names the fund(s) and the reason." },
    jargonUsed: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Finance terms used anywhere above." },
  },
  required: ["headline", "funds", "verdict", "verdictReason", "jargonUsed"],
  propertyOrdering: ["headline", "funds", "verdict", "verdictReason", "jargonUsed"],
};
