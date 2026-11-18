import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { analysisKey, bidSchema, compareBids, storedAnalysis } from "../lib/bids.js";

export default defineTool({
  description:
    "Rank every evaluated bid in one call and store that recommendation. Call this after evaluators have scored the bids. Pass the full set together. Recommend only the bidder this tool returns.",
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    bids: z.array(bidSchema).min(1).max(50),
  }),
  async execute({ bids }, ctx) {
    const result = compareBids(bids);
    if (!result.ok) {
      return result;
    }

    const key = analysisKey(ctx.session.id, result.analysisRef);
    const existing = await ctx.host.kv.get(key);
    if (existing === undefined) {
      await ctx.host.kv.put(key, storedAnalysis(result));
    }

    return result;
  },
});
