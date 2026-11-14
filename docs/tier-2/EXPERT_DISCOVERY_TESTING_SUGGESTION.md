Yes. The scoring mechanism you have is a good **expertise signal**, but I would not make the rule simply:

> “Highest score = expert.”

That can produce misleading results. A better KMS model is:

> **Score identifies candidates; evidence requirements determine whether someone qualifies as an expert.**

This makes the system much more defensible and easier to test.

# 1. Recommended way to determine an expert

Your current scoring system has a theoretical maximum of **15.5 points** before decay:

| Signal                  | Max points | Strength    |
| ----------------------- | ---------: | ----------- |
| Lesson learned authored |        4.0 | Very strong |
| Focused reading         |        3.0 | Strong      |
| Questions asked         |        3.0 | Strong      |
| Cited in AI answers     |        2.0 | Strong      |
| Viewed/downloaded       |        1.5 | Moderate    |
| Documents uploaded      |        1.5 | Weak        |
| Department overlap      |        0.5 | Very weak   |
| **Total**               |   **15.5** |             |

The important thing is that the **score measures evidence of expertise**, not expertise itself.

## Recommended expert classification

I would use something like this:

|       Score | Classification         | Meaning                              |
| ----------: | ---------------------- | ------------------------------------ |
|  **0–2.99** | No meaningful evidence | Insufficient evidence                |
|  **3–5.99** | Familiar               | Has interacted with the topic        |
|  **6–8.99** | Knowledgeable          | Meaningful evidence of understanding |
| **9–11.99** | Strong candidate       | Strong evidence of expertise         |
|     **12+** | Expert candidate       | Very strong evidence                 |

But I would add **qualification rules** on top of the score.

### Expert = score + evidence

For example:

> A person becomes an **Algorithmic Expert Candidate** when their decayed expertise score is **≥ 9**, AND they have evidence from at least **two meaningful knowledge behaviors**, with at least one being a high-quality signal.

For example, high-quality signals could be:

* Authored a lesson learned
* Asked substantive questions
* Was cited in AI answers
* Demonstrated sustained focused reading

This prevents:

> 30 documents uploaded → “expert”

even though uploading is capped.

---

# 2. I would make the rule slightly more sophisticated

Instead of one absolute threshold, use three components.

### A. Expertise Score

Your existing formula:

**Expertise Score = Raw Score × Recency Decay**

Where:

**Decay = 0.5^(days_since_last_activity / 90)**

So:

* 0 days → 100%
* 90 days → 50%
* 180 days → 25%
* 270 days → 12.5%

---

### B. Evidence Diversity

Count how many **meaningfully different behaviors** contributed to the score.

For example:

**Person A**

* Uploaded 20 documents
* Viewed 2 documents
* Score = 3.0

**Person B**

* Authored lesson learned
* Asked questions
* Read documents
* Was cited by AI
* Score = 7.5

Person B should clearly rank higher as an expert even if Person A has more total activity.

You can therefore calculate:

> **Evidence Diversity = number of distinct meaningful signal categories**

I would exclude department overlap from this count.

---

### C. Evidence Quality

You can classify signals into:

**High-quality**

* Lesson learned
* Questions
* AI citations

**Medium-quality**

* Focused reading
* Document viewed/downloaded

**Low-quality**

* Uploading
* Department overlap

Then establish a minimum requirement.

For example:

> **Expert Candidate requires score ≥ 9 + at least 2 meaningful evidence categories + at least 1 high-quality signal.**

This is considerably harder to game.

---

# 3. Recommended KMS expert determination algorithm

I would define the process like this.

### Step 1 — Identify the topic

For example:

> Topic = “Customer Onboarding”

KMS gathers all relevant activity associated with that topic.

### Step 2 — Calculate each person's raw score

For every person:

```text
Raw Score =
  Lesson Learned Points
+ Focused Reading Points
+ Question Points
+ Citation Points
+ View/Download Points
+ Upload Points
+ Department Overlap Points
```

subject to each signal's cap.

### Step 3 — Apply recency decay

```text
Final Score =
Raw Score × 0.5^(days_since_last_activity / 90)
```

### Step 4 — Determine evidence diversity

For example:

```text
Lesson Learned     ✓
Focused Reading    ✓
Questions          ✓
AI Citations       ✓
Uploads            ✓
```

This person has **5 evidence categories**.

### Step 5 — Apply qualification rules

For example:

```text
IF Final Score >= 9
AND meaningful evidence categories >= 2
AND high-quality evidence >= 1
THEN Expert Candidate
```

### Step 6 — Rank candidates

If multiple people qualify:

> Rank them by Final Score.

So KMS might return:

**Customer Onboarding Experts**

1. **Priya** — 12.4
2. **Rahul** — 10.7
3. **Anita** — 9.3

### Step 7 — Explain why

This is particularly important for KMS.

Don't merely say:

> **Rahul — Expert**

Instead:

> **Rahul — Expert Candidate**
> Expertise score: **10.7**
>
> Based on:
>
> * 2 published lesson learned
> * 18 minutes focused reading
> * 5 questions asked
> * 3 AI citations
> * 4 relevant documents
>
> Last active: 12 days ago.

This makes the expert identification **explainable**.

---

# 4. Very important: distinguish "Expert" from "Expert Candidate"

I strongly recommend having these states:

### Algorithmically identified

> **Expert Candidate**

The system believes this person has strong evidence.

### Self-confirmed

> **Confirmed Expert**

The person agrees that they are an expert.

### Admin-confirmed

> **Department-Verified Expert**

A department administrator confirms the person.

### Dismissed

> **Not an Expert**

The person rejects the classification.

This fits very well with the human override mechanism you already described.

The UI could therefore say:

> **Subject Matter Experts**
>
> **Rahul Sharma — Confirmed Expert**
>
> **Priya Nair — Expert Candidate**
>
> **Anita Rao — Department-Verified Expert**

---

# 5. One issue with the current scoring system

There is one important thing I would test carefully.

Your current system gives:

> **Focused reading = 0.1/minute, maximum 3 points**

and:

> **Lesson learned = 2 points each, maximum 4 points**

Therefore:

**30 minutes of focused reading = 3 points**

while:

**one lesson learned = 2 points.**

That's reasonable if the lesson learned represents meaningful knowledge contribution.

However, **focused reading is still relatively easy to accumulate**.

Someone could potentially read several documents carefully without actually understanding the subject.

So I would treat reading as **evidence of engagement**, not evidence of expertise.

The strongest evidence should remain:

1. Knowledge contribution
2. Demonstrated reasoning/interaction
3. Others benefiting from the person's knowledge
4. Sustained engagement

Your existing signals already approximate this nicely.

---

# 6. Test procedure for verifying that KMS identifies experts correctly

I would create a dedicated **Expertise Verification Test Suite**.

The objective isn't simply:

> “Does the score calculate correctly?”

You need to test two different things:

### A. Algorithm correctness

Does KMS calculate the score correctly?

### B. Expert identification quality

Does KMS actually identify the *right people*?

These should be tested separately.

---

# 7. Test 1 — Individual scoring tests

Create controlled test users.

For example:

| User  | Activity            |
| ----- | ------------------- |
| Alice | 1 lesson learned    |
| Bob   | 10 document uploads |
| Carol | 30 min reading      |
| David | 5 questions         |
| Emma  | 4 AI citations      |

Calculate the expected score manually.

Then compare:

> **Expected score vs KMS score**

Example:

### Alice

1 lesson learned:

```text
2 × 1 = 2
```

Expected:

> **2.00**

KMS should return exactly **2.00**.

Do this for every signal independently.

---

# 8. Test 2 — Verify every cap

This is critical.

For each signal, test:

### Lesson learned

```text
0 → 0
1 → 2
2 → 4
3 → 4
10 → 4
```

The score must never exceed 4.

Do the same for every signal.

For example:

### Uploads

```text
1 upload → 0.5
2 uploads → 1.0
3 uploads → 1.5
4 uploads → 1.5
20 uploads → 1.5
```

This verifies that someone cannot exploit repeated actions to dominate the algorithm.

---

# 9. Test 3 — Verify the anti-gaming behavior

This is probably the **most important functional test**.

Create two users.

### User A — Document hoarder

```text
20 uploads
0 questions
0 lesson learned
0 AI citations
5 minutes reading
```

### User B — Knowledge contributor

```text
1 lesson learned
5 questions
30 minutes reading
3 AI citations
```

Then compare their scores.

The expected result should be:

> **User B > User A**

even though User A uploaded substantially more material.

This directly verifies one of the fundamental design goals of your expertise system.

---

# 10. Test 4 — Test expertise ranking

Create a realistic synthetic organization.

For example:

### Topic: "Customer Onboarding"

Create 10 users:

| Person | Profile                          |
| ------ | -------------------------------- |
| A      | Heavy uploader                   |
| B      | Heavy reader                     |
| C      | Writes lesson learned            |
| D      | Asks many questions              |
| E      | Frequently cited                 |
| F      | Department member                |
| G      | Balanced activity                |
| H      | Recently active                  |
| I      | Historically active but inactive |
| J      | Minimal activity                 |

Give each person controlled activity.

Then ask KMS:

> **Who are the experts in Customer Onboarding?**

Record:

* people returned
* ranking
* score
* evidence
* classification

Then have actual subject-matter experts independently identify who they believe the experts are.

Compare the two lists.

---

# 11. Test 5 — Ground-truth expert test

This is the most valuable test.

Select perhaps **20–50 real topics** from the organization.

For each topic, ask knowledgeable humans:

> “Who are the 3–5 people you consider experts in this area?”

This becomes your **ground truth**.

Then let KMS independently generate its expert list.

For every topic, compare:

```text
Human experts
        vs.
KMS experts
```

You can then calculate:

### Precision

Of the people KMS identified as experts, how many were actually considered experts?

```text
Precision =
Correct KMS experts / All KMS experts
```

### Recall

Of the people humans identified as experts, how many did KMS find?

```text
Recall =
Correct KMS experts / All human experts
```

This gives you an objective way to determine whether the algorithm works.

---

# 12. Test 6 — False-positive testing

You specifically want to discover:

> **Who does KMS incorrectly call an expert?**

Create scenarios such as:

### Scenario A — Upload spam

Someone uploads 50 documents but has virtually no other activity.

Expected:

> **Not expert**

### Scenario B — Department-only

Someone belongs to the relevant department but has no meaningful activity.

Expected:

> **Not expert**

### Scenario C — Reading-only

Someone reads a large number of documents but contributes nothing.

Expected:

> Probably knowledgeable, but **not automatically expert**.

### Scenario D — Old expert

Someone was extremely active 12 months ago but hasn't interacted with the topic recently.

Expected:

> Score substantially reduced.

### Scenario E — One-off expert contribution

Someone writes one excellent lesson learned but otherwise has no activity.

Expected:

> Potential candidate, but probably not enough evidence for the highest confidence classification.

These tests protect against false positives.

---

# 13. Test 7 — False-negative testing

The opposite is equally important.

Give KMS people who are genuinely known experts.

For example:

> Engineering knows that Sarah is the company's expert on payment processing.

But Sarah hasn't uploaded many documents.

She:

* answers questions,
* writes occasional lessons learned,
* gets cited frequently,
* reads important documents.

KMS should still identify Sarah.

This tests whether the system is overly dependent on **document ownership**.

---

# 14. Test 8 — Recency decay

Create a controlled user with a known score.

For example:

> Raw score = 10

Then simulate inactivity.

| Days inactive | Expected score |
| ------------: | -------------: |
|             0 |          10.00 |
|            30 |          ~7.94 |
|            90 |           5.00 |
|           180 |           2.50 |
|           270 |           1.25 |
|           360 |          ~0.63 |

This verifies that the decay implementation is correct.

Also test:

> User performs a new activity.

The decay clock should reset based on the latest topic activity.

---

# 15. Test 9 — Topic isolation

This is **essential for a KMS**.

Suppose:

> Rahul is an expert in **React**.

He performs lots of activity around React.

That activity must **not increase his expertise score for "Financial Planning."**

Test:

```text
React activity → React score increases
React activity → Financial Planning score unchanged
```

This validates that expertise is:

> **Person × Topic**

rather than simply:

> **Person**

---

# 16. Test 10 — Cross-topic contamination

Take someone who is extremely active in one department.

For example:

> Finance employee uploads 100 finance documents.

Then ask:

> Who are the experts in Software Architecture?

The employee's Finance activity should not make them an expert in Software Architecture merely because they are highly active in KMS.

The only possible contribution should be the very small department-overlap signal if the topic mapping actually considers the department relevant.

---

# 17. Test 11 — Human override tests

You also need to test your manual confirmation mechanism.

### Test A — Self-confirm

Algorithm says:

> Rahul — Expert Candidate

Rahul selects:

> **Yes, I'm an expert**

Then future recalculation must **not remove the confirmed status**.

### Test B — Self-dismiss

Rahul selects:

> **No, I'm not an expert**

Future activity should not silently turn the dismissed listing back into an algorithmic expert listing.

### Test C — Admin confirmation

Department admin designates Rahul as expert.

The designation should persist independently of algorithmic recalculation.

### Test D — New activity

After confirmation, Rahul continues contributing.

His score should increase, but the algorithm should not reverse the human decision.

---

# 18. Test 12 — Explainability test

For every person identified as an expert, KMS should be able to answer:

> **"Why does KMS think this person is an expert?"**

For example:

```text
Rahul Sharma
Customer Onboarding

Expertise Score: 10.7

Evidence:
✓ 2 lesson learned authored       +4.0
✓ 5 questions asked               +2.0
✓ 21 min focused reading         +2.1
✓ 4 AI citations                 +1.4
✓ 3 documents viewed             +0.45

Recency adjustment: 0.91

Final score: 9.7
```

This is extremely useful for debugging the algorithm as well as building user trust.

---

# 19. A complete acceptance test

I would ultimately define one major acceptance criterion:

> **Given a set of organizational topics and a human-validated ground-truth list of subject-matter experts, KMS must identify the correct experts with an agreed minimum precision and recall, while preventing low-value behaviors such as bulk document uploads from producing expert status.**

Then define measurable targets.

For example, during Phase 1:

| Metric                          |   Target |
| ------------------------------- | -------: |
| Score calculation accuracy      | **100%** |
| Signal cap enforcement          | **100%** |
| Recency calculation accuracy    | **100%** |
| Topic isolation                 | **100%** |
| Human override persistence      | **100%** |
| Expert precision                | **≥80%** |
| Expert recall                   | **≥70%** |
| Upload-only false-positive rate |  **<5%** |

The exact precision/recall thresholds should ultimately be determined from your pilot data rather than treated as universal numbers.

---

# 20. The key product principle

I would summarize the whole mechanism as:

> **KMS does not determine who is an expert from a single action. It builds a recency-weighted body of evidence about a person's relationship with a topic.**

And operationally:

```text
                   ┌──────────────────┐
                   │   User Activity  │
                   └────────┬─────────┘
                            ↓
                   ┌──────────────────┐
                   │  7 Signals       │
                   └────────┬─────────┘
                            ↓
                   ┌──────────────────┐
                   │   Raw Score      │
                   └────────┬─────────┘
                            ↓
                   ┌──────────────────┐
                   │ Recency Decay    │
                   └────────┬─────────┘
                            ↓
                   ┌──────────────────┐
                   │ Expertise Score  │
                   └────────┬─────────┘
                            ↓
             ┌──────────────┴──────────────┐
             ↓                             ↓
      Evidence Quality              Evidence Diversity
             └──────────────┬──────────────┘
                            ↓
                   ┌──────────────────┐
                   │ Expert Candidate │
                   └────────┬─────────┘
                            ↓
                Human Confirmation Layer
                   ↙        ↓        ↘
             Confirmed   Dismissed   Pending
               Expert                 Review
```

**One change I would strongly recommend:** don't expose the raw numerical score as if it were an objective measure of someone's actual expertise. Call it an **Expertise Evidence Score** internally, and present the resulting status as **Expert Candidate / Confirmed Expert / Department-Verified Expert**. That distinction will make the KMS much more credible.
