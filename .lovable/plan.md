

## Plan: Brutally Honest Scoring Engine with Role-Specific Benchmarks & References

### The Problem

The current system has three fundamental flaws:

1. **Generic scoring** — The report evaluator doesn't have real job requirements to score against. A candidate who talks about "teamwork" gets strength points even if the role needs deep system design skills.
2. **Inflated scores** — There's no instruction to give 0s or low scores when deserved. The AI defaults to "nice feedback" mode.
3. **No references** — Market insights, salary data, skills lists, and feedback have no citations. The user has no way to verify anything.

### Architecture: 3-Step Pipeline

The current `generate-report` function runs 2 AI calls. We'll restructure to 3 calls with strict grading rubrics:

```text
Step 1: Role Research Agent (NEW — deep job requirements)
   ↓
Step 2: Market Insights Agent (EXISTS — enhanced with sources)
   ↓
Step 3: Strict Evaluator Agent (EXISTS — completely rewritten)
```

### Changes

#### 1. `supabase/functions/generate-report/index.ts` — Major Rewrite

**Step 1 — Role Research Agent (new)**

A dedicated AI call that produces a structured "job requirements profile" for the exact role+level. This becomes the scoring rubric:

- **Must-have skills**: 6-8 non-negotiable skills for this specific role (e.g., "System Design" for Senior Backend Engineer, NOT "Communication")
- **Nice-to-have skills**: 4-5 bonus skills
- **Expected competencies by level**: What a Junior vs Senior vs Lead should demonstrate
- **Industry benchmarks**: What top performers in this role actually do
- **Sources/references**: For each skill and benchmark, cite where this comes from (e.g., "Based on Google/Meta/Amazon job postings", "Per LinkedIn 2025 Skills Report", "Industry standard per IEEE/PMI/SHRM")

This output is saved alongside the report so the user can see WHY each skill matters.

**Step 2 — Market Insights (enhanced)**

Add a `sources` array to every data point:
- Salary ranges → cite source (e.g., "Glassdoor 2025 data", "Levels.fyi")
- Top skills → cite where they're in demand
- Hiring trends → cite industry reports
- Companies → cite job board data

**Step 3 — Strict Evaluator (complete rewrite)**

The evaluator receives:
- The role requirements profile from Step 1
- The interview transcript
- The candidate's CV context

New scoring instructions:
- **Only count strengths that directly map to must-have or nice-to-have skills for this role**. If the candidate mentioned "great teamwork" but the role needs "distributed systems design", that is NOT a strength.
- **Score 0 when deserved.** If the candidate showed zero evidence of a required competency, the score for that area is 0. Not 20, not 10. Zero.
- **Every strength must include**: what the candidate said (quote), which job requirement it maps to, and why it matters for this role
- **Every weakness must include**: what was expected, what the candidate actually said (or failed to say), and a specific reference to the role requirement
- **Overall score formula**: weighted average where must-have skills count 3x and nice-to-have count 1x
- **Feedback must be brutally honest**: "You scored 12% on technical depth. For a Senior Engineer role, this is significantly below the expected bar. You could not explain [X] which is a fundamental requirement per industry standards."

#### 2. Database Migration — Add references columns

Add to `reports` table:
- `role_requirements` (jsonb) — The role research output with sources
- `scoring_rubric` (jsonb) — The exact criteria used to score, so the user sees transparency

#### 3. `src/pages/Report.tsx` — Display References

New sections in the report UI:
- **"How We Scored You"** section showing the role requirements profile and why each competency was evaluated
- **References panel** on market insights showing source citations
- **Strength/weakness cards** enhanced to show which job requirement each maps to
- Score colors extended: scores below 20 get a "critical" red treatment

### Scoring Rubric Example

For a "Senior Software Engineer" role:

```text
Must-have (3x weight):
- System Design [Source: FAANG job postings 2025]
- Data Structures & Algorithms [Source: Industry standard]
- Code Quality & Testing [Source: Google Engineering Practices]
- Problem Decomposition [Source: Staff+ Engineering expectations]

Nice-to-have (1x weight):
- Leadership & Mentoring
- Cross-team Communication
- Domain Expertise

If candidate shows 0 evidence of System Design → tech_score component = 0
If candidate talks about "teamwork" but can't explain a technical trade-off → that's NOT a strength
```

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/generate-report/index.ts` | Add Role Research Agent (Step 1), enhance Market Insights with sources, rewrite Evaluator with strict rubric |
| DB Migration | Add `role_requirements` and `scoring_rubric` jsonb columns to `reports` |
| `src/pages/Report.tsx` | Add "How We Scored You" section, reference citations on insights, enhanced strength/weakness cards with requirement mapping |
| `src/integrations/supabase/types.ts` | Auto-updated after migration |

### What This Achieves

| Before | After |
|--------|-------|
| Generic strengths ("good communicator") | Role-specific strengths ("demonstrated system design thinking per Senior Engineer requirements") |
| Inflated scores (nobody gets below 40) | Honest scores (0 if no evidence shown) |
| No references | Every claim cited with source |
| Same rubric for all roles | Custom rubric per role+level |
| "You did great!" feedback | "You scored 12% on technical depth. Here's exactly why." |

