import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { buildComparison, loadData } from "../lib/analysis.js";
import { BcError } from "../lib/bc.js";

export default defineTool({
  description:
    "Load every bidder's consolidated scores for one bid analysis from Business Central and rank them together. Call this once the evaluators have scored and the committee has consolidated. Pass the bid analysis number. Recommend only the bidder this tool returns. It changes nothing.",
  execution: "server",
  effect: "read",
  inputSchema: z.object({
    bidAnalysisNo: z.string().trim().min(1).max(20),
  }),
  async execute({ bidAnalysisNo }, ctx) {
    try {
      const data = await loadData(bidAnalysisNo, ctx.session.purpose === "eval");
      return buildComparison(data);
    } catch (error) {
      if (error instanceof BcError) {
        return { ok: false as const, error: error.message };
      }
      throw error;
    }
  },
});
