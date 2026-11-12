# Test results (2026-11-09T14:05:57.416Z, strategy=semantic)

## TC1 — paraphrased question
Q: "How many days a week am I allowed to work from home?" (document wording: "remote work")

- status: `answered`
- answer: You are allowed to work from home for up to 3 days per week [1].
- citations: [1]→chunk 5

| # | doc | v | chunk | score | content |
|---|---|---|---|---|---|
| 1 | remote-work | 2 | 1 | 0.6881 | Employees may perform remote work for up to 3 days per week. Tuesday is a mandatory in-office day for all teams.… |
| 2 | remote-work | 2 | 2 | 0.5127 | Remote work requests are submitted in the HR portal at least 1 working day in advance and are approved by the direct manager. 3. Core hours … |
| 3 | remote-work | 2 | 0 | 0.5068 | ACME Corp - Remote Work Policy (Version 2) 1. Scope This policy applies to all full-time employees of ACME Corp and replaces Version 1. It i… |
| 4 | annual-leave | 1 | 2 | 0.4560 | 4. Public holidays Public holidays are not counted as annual leave. If a public holiday falls on a weekend, the next working day is a day of… |
| 5 | annual-leave | 1 | 1 | 0.4493 | 3. Sick leave Employees are entitled to 10 days of paid sick leave per year, separate from annual leave. A medical certificate is required f… |

**PASS** — answered and cites remote-work v2 (check the answer says 3 days)

## TC2 — /api/search top 3 for the TC1 question

| # | doc | v | chunk | score | content |
|---|---|---|---|---|---|
| 1 | remote-work | 2 | 1 | 0.6881 | Employees may perform remote work for up to 3 days per week. Tuesday is a mandatory in-office day for all teams.… |
| 2 | remote-work | 2 | 2 | 0.5127 | Remote work requests are submitted in the HR portal at least 1 working day in advance and are approved by the direct manager. 3. Core hours … |
| 3 | remote-work | 2 | 0 | 0.5068 | ACME Corp - Remote Work Policy (Version 2) 1. Scope This policy applies to all full-time employees of ACME Corp and replaces Version 1. It i… |

**PASS** — top-1 chunk is from remote-work → explain why (embeddings encode meaning, WFH ≈ remote work)

## TC3 — question not covered
Q: "What is the company policy on bringing pets to the office?"

- status: `insufficient` (LLM found no answer in the context.)
- answer: Not enough information: the selected documents do not contain an answer to this question.
- citations: —

| # | doc | v | chunk | score | content |
|---|---|---|---|---|---|
| 1 | remote-work | 2 | 1 | 0.5233 | Employees may perform remote work for up to 3 days per week. Tuesday is a mandatory in-office day for all teams.… |
| 2 | remote-work | 2 | 0 | 0.4617 | ACME Corp - Remote Work Policy (Version 2) 1. Scope This policy applies to all full-time employees of ACME Corp and replaces Version 1. It i… |
| 3 | remote-work | 2 | 3 | 0.4464 | 5. Security Company data may only be accessed through the corporate VPN. Public Wi-Fi networks must not be used without the VPN.… |
| 4 | remote-work | 2 | 2 | 0.3992 | Remote work requests are submitted in the HR portal at least 1 working day in advance and are approved by the direct manager. 3. Core hours … |
| 5 | annual-leave | 1 | 1 | 0.3578 | 3. Sick leave Employees are entitled to 10 days of paid sick leave per year, separate from annual leave. A medical certificate is required f… |

**PASS** — returns insufficient / "not enough information"

## TC4 — expired v1 and current v2 both selected

- status: `answered`
- answer: You are allowed to work from home for up to 3 days per week [1].
- citations: [1]→chunk 5

| # | doc | v | chunk | score | content |
|---|---|---|---|---|---|
| 1 | remote-work | 2 | 1 | 0.6881 | Employees may perform remote work for up to 3 days per week. Tuesday is a mandatory in-office day for all teams.… |
| 2 | remote-work | 2 | 2 | 0.5127 | Remote work requests are submitted in the HR portal at least 1 working day in advance and are approved by the direct manager. 3. Core hours … |
| 3 | remote-work | 2 | 0 | 0.5068 | ACME Corp - Remote Work Policy (Version 2) 1. Scope This policy applies to all full-time employees of ACME Corp and replaces Version 1. It i… |
| 4 | remote-work | 2 | 3 | 0.2997 | 5. Security Company data may only be accessed through the corporate VPN. Public Wi-Fi networks must not be used without the VPN.… |

**PASS** — no chunk from expired v1 even though it was selected

## TC5 — switch tenant to globex

### 5a. Same question as globex (all its docs)

- status: `answered`
- answer: 5 days a week [1].
- citations: [1]→chunk 21

| # | doc | v | chunk | score | content |
|---|---|---|---|---|---|
| 1 | remote-work | 1 | 0 | 0.5557 | Globex Inc - Remote Work Policy 1. Scope This policy applies to all employees of Globex Inc. It is valid from 1 January 2026. 2. Remote work… |
| 2 | travel-expense | 1 | 0 | 0.2636 | Globex Inc - Travel Expense Policy 1. Per diem Globex pays a flat per diem of USD 70 for every travel day, domestic or international. 2. Acc… |

### 5b. globex sends ACME document ids (tenant spoofing attempt)

| # | doc | v | chunk | score | content |
|---|---|---|---|---|---|


**PASS** — globex answers from globex chunks only (5 days/week); ACME ids return 0 chunks

## TC6 — only annual-leave selected, question about travel
Q: "What is the maximum hotel cost per night on a business trip?"

- status: `insufficient` (Best similarity 0.227 < MIN_SCORE 0.47.)
- answer: Not enough information: the selected documents do not contain an answer to this question.
- citations: —

| # | doc | v | chunk | score | content |
|---|---|---|---|---|---|
| 1 | annual-leave | 1 | 2 | 0.2270 | 4. Public holidays Public holidays are not counted as annual leave. If a public holiday falls on a weekend, the next working day is a day of… |
| 2 | annual-leave | 1 | 1 | 0.2013 | 3. Sick leave Employees are entitled to 10 days of paid sick leave per year, separate from annual leave. A medical certificate is required f… |
| 3 | annual-leave | 1 | 0 | 0.1815 | ACME Corp - Annual Leave Policy 1. Paid annual leave Full-time employees are entitled to 15 days of paid annual leave per year. Employees re… |

**PASS** — no chunk from travel-expense (status should be insufficient)

## TC7 — citations point to retrieved chunks

- TC1 [1] → chunk 5 (remote-work v2): "Employees may perform remote work for up to 3 days per week. Tuesday is a mandatory in-office day for all teams.…"
- TC4 [1] → chunk 5 (remote-work v2): "Employees may perform remote work for up to 3 days per week. Tuesday is a mandatory in-office day for all teams.…"
- TC5a [1] → chunk 21 (remote-work v1): "Globex Inc - Remote Work Policy 1. Scope This policy applies to all employees of Globex Inc. It is valid from 1 January 2026. 2. Remote work allowance Globex is a remote-first company. Employees may p…"

> Manually confirm each quoted chunk actually supports the sentence it is attached to.

**PASS** — every citation id ∈ retrieved chunks (support must be checked by reading)

## TC8 — similarity failure mode
Q: "How many days of unpaid leave can I take per year?" (doc has paid leave AND unpaid leave in similar wording)

| # | doc | v | chunk | score | content |
|---|---|---|---|---|---|
| 1 | annual-leave | 1 | 1 | 0.6243 | 3. Sick leave Employees are entitled to 10 days of paid sick leave per year, separate from annual leave. A medical certificate is required f… |
| 2 | annual-leave | 1 | 0 | 0.6080 | ACME Corp - Annual Leave Policy 1. Paid annual leave Full-time employees are entitled to 15 days of paid annual leave per year. Employees re… |
| 3 | annual-leave | 1 | 2 | 0.4886 | 4. Public holidays Public holidays are not counted as annual leave. If a public holiday falls on a weekend, the next working day is a day of… |

### /api/ask with the same question

- status: `answered`
- answer: 30 days of unpaid leave per year [2].
- citations: [2]→chunk 11

| # | doc | v | chunk | score | content |
|---|---|---|---|---|---|
| 1 | annual-leave | 1 | 1 | 0.6243 | 3. Sick leave Employees are entitled to 10 days of paid sick leave per year, separate from annual leave. A medical certificate is required f… |
| 2 | annual-leave | 1 | 0 | 0.6080 | ACME Corp - Annual Leave Policy 1. Paid annual leave Full-time employees are entitled to 15 days of paid annual leave per year. Employees re… |
| 3 | annual-leave | 1 | 2 | 0.4886 | 4. Public holidays Public holidays are not counted as annual leave. If a public holiday falls on a weekend, the next working day is a day of… |

> Reproduced: the most similar chunk does not contain "unpaid". Explain why (shared vocabulary "days … leave … per year" dominates the vector; negation/modifiers like "un-" barely move it).


## Summary

| TC | Result | Check |
|---|---|---|
| TC1 | ✅ PASS | answered and cites remote-work v2 (check the answer says 3 days) |
| TC2 | ✅ PASS | top-1 chunk is from remote-work → explain why (embeddings encode meaning, WFH ≈ remote work) |
| TC3 | ✅ PASS | returns insufficient / "not enough information" |
| TC4 | ✅ PASS | no chunk from expired v1 even though it was selected |
| TC5 | ✅ PASS | globex answers from globex chunks only (5 days/week); ACME ids return 0 chunks |
| TC6 | ✅ PASS | no chunk from travel-expense (status should be insufficient) |
| TC7 | ✅ PASS | every citation id ∈ retrieved chunks (support must be checked by reading) |
| TC8 | 🔎 reproduced | most similar chunk is NOT the unpaid-leave rule — analyse |
