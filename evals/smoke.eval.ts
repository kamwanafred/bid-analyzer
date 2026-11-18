import { defineEval } from "@grok/agent-sdk/evals";

const bids = `Compare these evaluated bids and recommend one.

- Bidder FAB, Fabrikam. Bid amount 110000 USD. Technical 85, commercial 65, quality 80, total weighted score 82. Evaluators 3 of 3 submitted.
- Bidder CONT, Contoso. Bid amount 90000 USD. Technical 70, commercial 90, quality 60, total weighted score 74. Evaluators 3 of 3 submitted.
- Bidder NORTH, Northwind. Bid amount 100000 USD. Technical 80, commercial 70, quality 75, total weighted score 78. Evaluators 3 of 3 submitted.`;

export default defineEval({
  tags: ["smoke"],
  description: "Recommend the highest weighted score, then record an accept.",
  async test(t) {
    const recommendation = await t.send(bids);
    recommendation.succeeded();
    recommendation.calledTool("compare-bids", {
      output: (value) => {
        if (typeof value !== "object" || value === null) {
          return false;
        }
        const recommended = Reflect.get(value, "recommended");
        if (typeof recommended !== "object" || recommended === null) {
          return false;
        }
        return Reflect.get(recommended, "bidderCode") === "FAB";
      },
    });
    recommendation.notCalledTool("record-decision");

    const decision = await t.send("Accept the recommendation.");
    decision.succeeded();
    decision.calledTool("record-decision", {
      output: (value) => {
        if (typeof value !== "object" || value === null) {
          return false;
        }
        return (
          Reflect.get(value, "ok") === true &&
          Reflect.get(value, "storedDecision") === "accept" &&
          Reflect.get(value, "recommendedBidderCode") === "FAB" &&
          Reflect.get(value, "conflict") === false
        );
      },
    });
  },
});
