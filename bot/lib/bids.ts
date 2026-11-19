import { createHash } from "node:crypto";
import * as z from "zod/v4";

export const bidSchema = z.object({
  bidderCode: z.string().trim().min(1).max(20),
  bidderName: z.string().trim().min(1).max(100),
  bidAmount: z.number().nonnegative(),
  currencyCode: z.string().trim().max(10).optional(),
  technicalScore: z.number().nonnegative(),
  commercialScore: z.number().nonnegative(),
  qualityScore: z.number().nonnegative(),
  totalWeightedScore: z.number().nonnegative(),
  evaluatorsCount: z.number().int().positive(),
  evaluatorsSubmitted: z.number().int().nonnegative(),
});

export type BidInput = z.output<typeof bidSchema>;

export type RankedBid = {
  rank: number;
  bidderCode: string;
  bidderName: string;
  bidAmount: number;
  currencyCode: string;
  technicalScore: number;
  commercialScore: number;
  qualityScore: number;
  totalWeightedScore: number;
  evaluatorsCount: number;
  evaluatorsSubmitted: number;
  recommended: boolean;
};

export type CompareOk = {
  ok: true;
  analysisRef: string;
  bidCount: number;
  incompleteEvaluations: boolean;
  mixedCurrency: boolean;
  recommended: {
    bidderCode: string;
    bidderName: string;
    totalWeightedScore: number;
    bidAmount: number;
    currencyCode: string;
    reasonCode: "only-bid" | "highest-score" | "lowest-amount" | "bidder-code";
    reason: string;
  };
  ranked: RankedBid[];
};

export type BidError = {
  ok: false;
  error: string;
};

export type CompareResult = CompareOk | BidError;

export function compareBids(bids: BidInput[]): CompareResult {
  const normalized = bids.map(normalizeBid);
  const duplicate = findDuplicate(normalized);
  if (duplicate !== undefined) {
    return { ok: false, error: `Bidder code ${duplicate} is repeated. Each bidder must appear once.` };
  }

  const overSubmitted = normalized.find((bid) => bid.evaluatorsSubmitted > bid.evaluatorsCount);
  if (overSubmitted !== undefined) {
    return {
      ok: false,
      error: `Bidder ${overSubmitted.bidderCode} has more submitted evaluators than evaluators on the committee.`,
    };
  }

  const rankedSource = [...normalized].sort(compareRank);
  const winner = rankedSource[0];
  if (winner === undefined) {
    return { ok: false, error: "Provide at least one evaluated bid." };
  }

  const recommendation = recommendationFor(winner, rankedSource);
  const ranked: RankedBid[] = rankedSource.map((bid, index) => ({
    rank: index + 1,
    bidderCode: bid.bidderCode,
    bidderName: bid.bidderName,
    bidAmount: bid.bidAmount,
    currencyCode: bid.currencyCode,
    technicalScore: bid.technicalScore,
    commercialScore: bid.commercialScore,
    qualityScore: bid.qualityScore,
    totalWeightedScore: bid.totalWeightedScore,
    evaluatorsCount: bid.evaluatorsCount,
    evaluatorsSubmitted: bid.evaluatorsSubmitted,
    recommended: bid.bidderCode === winner.bidderCode,
  }));

  const currencies = new Set(normalized.map((bid) => bid.currencyCode));
  const analysisRef = createHash("sha256").update(canonical(normalized)).digest("hex").slice(0, 16);

  return {
    ok: true,
    analysisRef,
    bidCount: ranked.length,
    incompleteEvaluations: normalized.some((bid) => bid.evaluatorsSubmitted < bid.evaluatorsCount),
    mixedCurrency: currencies.size > 1,
    recommended: {
      bidderCode: winner.bidderCode,
      bidderName: winner.bidderName,
      totalWeightedScore: winner.totalWeightedScore,
      bidAmount: winner.bidAmount,
      currencyCode: winner.currencyCode,
      reasonCode: recommendation.reasonCode,
      reason: recommendation.reason,
    },
    ranked,
  };
}

type NormalizedBid = {
  bidderCode: string;
  bidderName: string;
  bidAmount: number;
  currencyCode: string;
  technicalScore: number;
  commercialScore: number;
  qualityScore: number;
  totalWeightedScore: number;
  evaluatorsCount: number;
  evaluatorsSubmitted: number;
};

function normalizeBid(bid: BidInput): NormalizedBid {
  return {
    bidderCode: bid.bidderCode.trim(),
    bidderName: bid.bidderName.trim(),
    bidAmount: bid.bidAmount,
    currencyCode: (bid.currencyCode ?? "").trim().toUpperCase(),
    technicalScore: bid.technicalScore,
    commercialScore: bid.commercialScore,
    qualityScore: bid.qualityScore,
    totalWeightedScore: bid.totalWeightedScore,
    evaluatorsCount: bid.evaluatorsCount,
    evaluatorsSubmitted: bid.evaluatorsSubmitted,
  };
}

function findDuplicate(bids: NormalizedBid[]): string | undefined {
  const seen = new Set<string>();
  for (const bid of bids) {
    const key = bid.bidderCode.toUpperCase();
    if (seen.has(key)) {
      return bid.bidderCode;
    }
    seen.add(key);
  }
  return undefined;
}

function compareRank(left: NormalizedBid, right: NormalizedBid): number {
  if (left.totalWeightedScore !== right.totalWeightedScore) {
    return right.totalWeightedScore - left.totalWeightedScore;
  }
  if (left.bidAmount !== right.bidAmount) {
    return left.bidAmount - right.bidAmount;
  }
  return left.bidderCode.localeCompare(right.bidderCode);
}

function recommendationFor(
  winner: NormalizedBid,
  bids: NormalizedBid[],
): { reasonCode: CompareOk["recommended"]["reasonCode"]; reason: string } {
  if (bids.length === 1) {
    return { reasonCode: "only-bid", reason: "Only bid in the set." };
  }
  const sameScore = bids.filter((bid) => bid.totalWeightedScore === winner.totalWeightedScore);
  if (sameScore.length === 1) {
    return { reasonCode: "highest-score", reason: "Highest total weighted score." };
  }
  const sameAmount = sameScore.filter((bid) => bid.bidAmount === winner.bidAmount);
  if (sameAmount.length === 1) {
    return { reasonCode: "lowest-amount", reason: "Equal top score. Lowest bid amount." };
  }
  return { reasonCode: "bidder-code", reason: "Equal top score and bid amount. Bidder code order." };
}

function canonical(bids: NormalizedBid[]): string {
  const rows = [...bids].sort((left, right) => left.bidderCode.toUpperCase().localeCompare(right.bidderCode.toUpperCase()));
  return JSON.stringify(rows);
}
