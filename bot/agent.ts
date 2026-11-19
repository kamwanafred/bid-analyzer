import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "Bid analyzer",
  description:
    "Loads evaluated bids from Business Central, recommends one, and records the user's accept or reject there.",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  hosting: {
    egressDomains: ["login.microsoftonline.com", "api.businesscentral.dynamics.com"],
    secretNames: ["BC_TENANT_ID", "BC_CLIENT_ID", "BC_CLIENT_SECRET", "BC_COMPANY_ID"],
  },
});
