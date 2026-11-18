import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "Bid analyzer",
  description:
    "Compares evaluated bids, recommends one, and records the user's accept or reject.",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
});
