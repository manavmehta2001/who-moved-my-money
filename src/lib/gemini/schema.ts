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

/** The same shape as JSON Schema, sent as OpenRouter's `response_format` (strict). */
export const reportJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "funds", "verdict", "verdictReason", "jargonUsed"],
  properties: {
    headline: { type: "string", description: "One line: the week in the style of a research-note title." },
    funds: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["schemeCode", "summary", "citedHeadlineIds"],
        properties: {
          schemeCode: { type: "string" },
          summary: {
            type: "string",
            description: "Exactly 3 sentences: (1) the return, (2) vs benchmark and category average, (3) the provided headlines that explain it, or that none do.",
          },
          citedHeadlineIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    verdict: { type: "string", enum: [...VERDICTS] },
    verdictReason: { type: "string", description: "Specific: names the fund(s) and the reason." },
    jargonUsed: { type: "array", items: { type: "string" }, description: "Finance terms used anywhere above." },
  },
};
