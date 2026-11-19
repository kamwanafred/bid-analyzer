import type { BcBidData } from "./bc.js";

/** Used only in eval sessions, so evals need no Business Central tenant. */
export const EVAL_ANALYSIS_NO = "BA-EVAL-001";

export function evalBidData(): BcBidData {
  return {
    analysis: {
      id: "11111111-1111-1111-1111-111111111111",
      no: EVAL_ANALYSIS_NO,
      status: "In_x0020_Progress",
      approvalStatus: "Open",
      consolidatedScoringDone: true,
      analyzerDecision: "",
      analyzerBidderCode: "",
    },
    scores: [
      score("FAB", "Fabrikam", 110000, 85, 65, 80, 82, 1, true),
      score("NORTH", "Northwind", 100000, 80, 70, 75, 78, 2, false),
      score("CONT", "Contoso", 90000, 70, 90, 60, 74, 3, false),
    ],
  };
}

function score(
  bidderCode: string,
  bidderName: string,
  bidAmount: number,
  technicalScore: number,
  commercialScore: number,
  qualityScore: number,
  totalWeightedScore: number,
  rank: number,
  recommended: boolean,
): BcBidData["scores"][number] {
  return {
    bidderCode,
    bidderName,
    bidAmount,
    currencyCode: "USD",
    technicalScore,
    commercialScore,
    qualityScore,
    totalWeightedScore,
    evaluatorsCount: 3,
    evaluatorsSubmitted: 3,
    rank,
    recommended,
  };
}
