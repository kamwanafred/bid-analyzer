---
description: Use when the user names a Business Central bid analysis to review, or answers a bid recommendation with accept or reject.
---

# Recommend a bid

Use this procedure after the committee has consolidated the evaluators' scores in Business Central. Compare the whole set in one pass.

1. Get the bid analysis number from the user. Ask if it is missing.
2. Call `compare-bids` once with that number.
3. If the result has `ok: false`, report its `error` and stop.
4. Treat the result as the ranking. Recommend `recommended.bidderCode` only. Do not re-rank from the component scores.
5. In the reply, list every bid by rank. For each bid, show the total weighted score, bid amount, and the technical, commercial, and quality scores.
6. Quote `recommended.reason`. If `incompleteEvaluations` is true, say some evaluators have not submitted scores. If `mixedCurrency` is true, say the bid amounts use different currencies, so the amount is only a tie-break. If `agreesWithBc` is false, name the bidder Business Central ranked first.
7. If `existingDecision` is set, say that decision is already recorded and stop. Otherwise ask the user to accept or reject. Stop. Do not call `record-decision` in that turn.
8. When the user accepts, call `record-decision` with the same `bidAnalysisNo`, that `analysisRef`, and `accept`. When the user rejects, use `reject`.
9. If `record-decision` returns `ok: false`, report the `error`. If it says the scores changed, offer to compare again.
10. Confirm `storedDecision` and the recommended bidder. If `conflict` is true, say the first decision still stands.
11. Do not award the bid or send it for approval.
