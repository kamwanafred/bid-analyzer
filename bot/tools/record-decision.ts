import type { JsonValue } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { analysisKey, decisionKey, type StoredAnalysis } from "../lib/bids.js";

const decisionSchema = z.enum(["accept", "reject"]);

type StoredDecision = {
  analysisRef: string;
  decision: "accept" | "reject";
  recommendedBidderCode: string;
  recommendedBidderName: string;
  recordedAt: string;
};

export default defineTool({
  description:
    "Record the user's accept or reject of the recommended bid. Call this only after the user clearly accepts or rejects the latest compare-bids recommendation. Pass that analysisRef. The same decision has no extra effect. A later different decision does not replace the first one.",
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    analysisRef: z.string().trim().min(8).max(64),
    decision: decisionSchema,
  }),
  async execute({ analysisRef, decision }, ctx) {
    const analysis = await ctx.host.kv.get(analysisKey(ctx.session.id, analysisRef));
    const stored = readAnalysis(analysis);
    if (stored === undefined || stored.analysisRef !== analysisRef) {
      return {
        ok: false as const,
        error: "No comparison is stored for this session. Compare the bids before recording a decision.",
      };
    }

    const key = decisionKey(ctx.session.id, analysisRef);
    const existing = readDecision(await ctx.host.kv.get(key));
    if (existing !== undefined) {
      return {
        ok: true as const,
        analysisRef,
        decision,
        recommendedBidderCode: stored.recommendedBidderCode,
        recommendedBidderName: stored.recommendedBidderName,
        alreadyRecorded: true,
        conflict: existing.decision !== decision,
        storedDecision: existing.decision,
      };
    }

    const record: StoredDecision = {
      analysisRef,
      decision,
      recommendedBidderCode: stored.recommendedBidderCode,
      recommendedBidderName: stored.recommendedBidderName,
      recordedAt: ctx.now().toISOString(),
    };
    await ctx.host.kv.put(key, record);

    return {
      ok: true as const,
      analysisRef,
      decision,
      recommendedBidderCode: stored.recommendedBidderCode,
      recommendedBidderName: stored.recommendedBidderName,
      alreadyRecorded: false,
      conflict: false,
      storedDecision: decision,
    };
  },
});

function readAnalysis(value: JsonValue | undefined): StoredAnalysis | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const reasonCode = value.reasonCode;
  if (
    typeof value.analysisRef !== "string" ||
    typeof value.recommendedBidderCode !== "string" ||
    typeof value.recommendedBidderName !== "string" ||
    typeof value.totalWeightedScore !== "number" ||
    typeof value.bidAmount !== "number" ||
    typeof value.currencyCode !== "string" ||
    typeof value.reason !== "string" ||
    (reasonCode !== "only-bid" &&
      reasonCode !== "highest-score" &&
      reasonCode !== "lowest-amount" &&
      reasonCode !== "bidder-code")
  ) {
    return undefined;
  }
  return {
    analysisRef: value.analysisRef,
    recommendedBidderCode: value.recommendedBidderCode,
    recommendedBidderName: value.recommendedBidderName,
    totalWeightedScore: value.totalWeightedScore,
    bidAmount: value.bidAmount,
    currencyCode: value.currencyCode,
    reasonCode,
    reason: value.reason,
  };
}

function readDecision(value: JsonValue | undefined): StoredDecision | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (
    typeof value.analysisRef !== "string" ||
    (value.decision !== "accept" && value.decision !== "reject") ||
    typeof value.recommendedBidderCode !== "string" ||
    typeof value.recommendedBidderName !== "string" ||
    typeof value.recordedAt !== "string"
  ) {
    return undefined;
  }
  return {
    analysisRef: value.analysisRef,
    decision: value.decision,
    recommendedBidderCode: value.recommendedBidderCode,
    recommendedBidderName: value.recommendedBidderName,
    recordedAt: value.recordedAt,
  };
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
