import { defineEval } from "@grok/agent-sdk/evals";

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

export default defineEval({
  tags: ["smoke"],
  description: "Load bid analysis BA-EVAL-001, recommend the top bid, then record an accept.",
  async test(t) {
    const recommendation = await t.send("Review bid analysis BA-EVAL-001 and recommend a bid.");
    recommendation.succeeded();
    recommendation.calledTool("compare-bids", {
      output: (value) => field(field(value, "recommended"), "bidderCode") === "FAB" && field(value, "agreesWithBc") === true,
    });
    recommendation.notCalledTool("record-decision");

    const decision = await t.send("Accept the recommendation.");
    decision.succeeded();
    decision.calledTool("record-decision", {
      output: (value) =>
        field(value, "ok") === true &&
        field(value, "storedDecision") === "Accepted" &&
        field(value, "recommendedBidderCode") === "FAB" &&
        field(value, "conflict") === false,
    });
  },
});
