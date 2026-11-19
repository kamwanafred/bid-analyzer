import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { buildComparison, loadData } from "../lib/analysis.js";
import { BcError, type BcDecision, postDecision, requireConfig } from "../lib/bc.js";

export default defineTool({
  description:
    "Write the user's accept or reject of the recommended bid to the bid analysis record in Business Central. Call this only after the user clearly accepts or rejects the latest compare-bids recommendation. Pass the same bidAnalysisNo and analysisRef. The same decision again has no extra effect. A different later decision is refused, and the first one stands.",
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    bidAnalysisNo: z.string().trim().min(1).max(20),
    analysisRef: z.string().trim().min(8).max(64),
    decision: z.enum(["accept", "reject"]),
  }),
  async execute({ bidAnalysisNo, analysisRef, decision }, ctx) {
    const isEval = ctx.session.purpose === "eval";
    const wanted: BcDecision = decision === "accept" ? "Accepted" : "Rejected";
    try {
      const data = await loadData(bidAnalysisNo, isEval);
      const comparison = buildComparison(data);
      if (!comparison.ok) {
        return comparison;
      }
      if (comparison.analysisRef !== analysisRef) {
        return {
          ok: false as const,
          error: "The scores in Business Central changed since the recommendation. Compare the bids again.",
        };
      }

      const recommended = comparison.recommended;
      if (comparison.existingDecision !== null) {
        return {
          ok: true as const,
          bidAnalysisNo: comparison.bidAnalysisNo,
          recommendedBidderCode: recommended.bidderCode,
          recommendedBidderName: recommended.bidderName,
          storedDecision: comparison.existingDecision,
          alreadyRecorded: true,
          conflict: comparison.existingDecision !== wanted,
          writtenToBusinessCentral: false,
        };
      }

      if (!isEval) {
        await postDecision(requireConfig(), data.analysis.id, recommended.bidderCode, wanted);
      }
      return {
        ok: true as const,
        bidAnalysisNo: comparison.bidAnalysisNo,
        recommendedBidderCode: recommended.bidderCode,
        recommendedBidderName: recommended.bidderName,
        storedDecision: wanted,
        alreadyRecorded: false,
        conflict: false,
        writtenToBusinessCentral: !isEval,
      };
    } catch (error) {
      if (error instanceof BcError) {
        return { ok: false as const, error: error.message };
      }
      throw error;
    }
  },
});
