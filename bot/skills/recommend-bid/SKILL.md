---
description: Use when the user supplies evaluated bids and wants one recommendation they can accept or reject.
---

# Recommend a bid

Use this procedure after evaluators have scored the bids. Compare the whole set in one pass.

1. Collect every bid before you compare. Each bid needs bidder code, bidder name, bid amount, technical score, commercial score, quality score, total weighted score, evaluators count, and evaluators submitted. Currency code is optional.
2. Call `compare-bids` once with the full set.
3. Treat the tool result as the ranking. Recommend `recommended.bidderCode` only. Do not re-rank from the component scores.
4. In the reply, list every bid by rank. For each bid, show the total weighted score, bid amount, and the technical, commercial, and quality scores.
5. Quote `recommended.reason`. If `incompleteEvaluations` is true, say that some evaluators have not submitted scores. If `mixedCurrency` is true, say that the bid amounts use different currencies, so the amount is only a tie-break.
6. Ask the user to accept or reject the recommendation. Stop. Do not call `record-decision` in that turn.
7. When the user accepts, call `record-decision` with that `analysisRef` and `accept`. When the user rejects, call it with `reject`.
8. Confirm `storedDecision` and the recommended bidder. If `conflict` is true, say the first decision still stands.
9. Do not award the bid or send it for approval.
