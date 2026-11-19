import {
  type BcBidData,
  BcError,
  checkAnalysisNo,
  enumText,
  loadBidData,
  requireConfig,
} from "./bc.js";
import { evalBidData, EVAL_ANALYSIS_NO } from "./bc-fixture.js";
import { bidSchema, type BidInput, compareBids, type CompareOk } from "./bids.js";

/** Eval sessions read a fixed fixture. Every other session reads Business Central. */
export async function loadData(bidAnalysisNo: string, isEval: boolean): Promise<BcBidData> {
  const no = checkAnalysisNo(bidAnalysisNo);
  if (isEval) {
    if (no !== EVAL_ANALYSIS_NO) {
      throw new BcError(`Bid analysis ${no} was not found in the eval fixture.`);
    }
    return evalBidData();
  }
  return loadBidData(requireConfig(), no);
}

export type AnalysisComparison = Omit<CompareOk, "ok"> & {
  ok: true;
  bidAnalysisNo: string;
  bcRecommendedBidderCode: string;
  agreesWithBc: boolean;
  existingDecision: "Accepted" | "Rejected" | null;
};

export type AnalysisFailure = { ok: false; error: string };

export function buildComparison(data: BcBidData): AnalysisComparison | AnalysisFailure {
  const { analysis, scores } = data;
  const status = enumText(analysis.status);

  if (status === "Awarded" || status === "Cancelled") {
    return { ok: false, error: `Bid analysis ${analysis.no} is ${status}. It can no longer be compared.` };
  }
  if (!analysis.consolidatedScoringDone) {
    return {
      ok: false,
      error: `Bid analysis ${analysis.no} has not been consolidated in Business Central. The committee must consolidate the scores first.`,
    };
  }
  if (scores.length === 0) {
    return { ok: false, error: `Bid analysis ${analysis.no} has no consolidated bid scores.` };
  }

  const bids: BidInput[] = [];
  for (const row of scores) {
    const parsed = bidSchema.safeParse({
      bidderCode: row.bidderCode,
      bidderName: row.bidderName,
      bidAmount: row.bidAmount,
      currencyCode: row.currencyCode,
      technicalScore: row.technicalScore,
      commercialScore: row.commercialScore,
      qualityScore: row.qualityScore,
      totalWeightedScore: row.totalWeightedScore,
      evaluatorsCount: row.evaluatorsCount,
      evaluatorsSubmitted: row.evaluatorsSubmitted,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: `Bidder ${row.bidderCode} has scores in Business Central that cannot be compared. Check its evaluators and scores.`,
      };
    }
    bids.push(parsed.data);
  }

  const result = compareBids(bids);
  if (!result.ok) {
    return result;
  }

  const bcRecommended = scores.find((row) => row.recommended)?.bidderCode ?? "";
  const decision = enumText(analysis.analyzerDecision);

  return {
    ...result,
    bidAnalysisNo: analysis.no,
    bcRecommendedBidderCode: bcRecommended,
    agreesWithBc: bcRecommended === result.recommended.bidderCode,
    existingDecision: decision === "Accepted" || decision === "Rejected" ? decision : null,
  };
}
