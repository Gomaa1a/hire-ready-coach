

## Plan: Make the Interview Genuinely Conversational

### The Problem

Right now the flow is:
1. Pre-generate 6-8 questions → store in `interviews.question_bank`
2. Feed those exact questions as a numbered list into the Realtime agent's system prompt: *"ask these questions one by one"*
3. Agent reads the script

This is a **teleprompter, not an interviewer**. A real interviewer adapts — they dig deeper when an answer is interesting, skip questions when the candidate already covered them, and the conversation flows naturally.

### The Fix

**Stop feeding a script. Give the agent context and let it think.**

Instead of a numbered question list, the system prompt should describe:
- The role, level, and what skills/competencies matter
- The candidate's CV summary (already parsed)
- Interview guidelines (how many topics to cover, time budget, depth expectations)
- Evaluation criteria (what to probe for)

The agent then **generates its own questions in real-time** based on what the candidate actually says. This is what OpenAI Realtime is designed for — it's a reasoning model, not a text-to-speech reader.

### Technical Changes

**File: `supabase/functions/realtime-session-token/index.ts`**

Replace the current instructions that list questions with a **role briefing** prompt:

```
You are [Persona Name], [Title] at [Company], conducting a live interview 
for a [Level] [Role] position.

CANDIDATE CONTEXT:
- Name: [name]
- CV highlights: [parsed CV summary — key skills, experience, notable projects]

YOUR INTERVIEW APPROACH:
- Start with a warm intro and an easy icebreaker about their background
- Cover 5-6 topics across: technical depth, problem-solving, collaboration, 
  leadership (if senior+), and motivation
- Listen actively — when something interesting comes up, dig deeper with 
  follow-ups. Don't just move to the next topic mechanically
- If the candidate mentions a project or challenge, ask specifics: 
  "What was your role?", "What would you do differently?"
- Adapt difficulty based on their responses — if they handle something 
  easily, push harder. If they struggle, pivot gracefully
- Keep the conversation natural. Use transitions like "That reminds me..." 
  or "Building on that..."
- You have about 15 minutes. Manage time naturally — don't rush, 
  but don't let one topic consume the whole session
- End by asking if they have questions, then close warmly

RULES:
- Never list multiple questions at once
- Never say "next question" or "moving on to question 3"
- React genuinely to answers before asking the next thing
- If an answer is vague, probe: "Can you give me a specific example?"
- Never evaluate or score answers during the conversation
```

**File: `supabase/functions/generate-question-bank/index.ts`**

Repurpose this function. Instead of generating exact questions, generate a **topic guide** — a set of competency areas and evaluation signals the agent should explore. This still gets stored in `interviews.question_bank` but serves as a reference for the system prompt, not a script.

The output structure changes from:
```json
{ "opening": "...", "questions": [...], "closing": "..." }
```
to:
```json
{
  "competencies": [
    {
      "area": "System Design",
      "why": "Critical for senior backend roles",
      "signals_to_look_for": ["trade-off reasoning", "scalability awareness"],
      "red_flags": ["no mention of constraints", "textbook answers only"]
    }
  ],
  "candidate_highlights": ["Led migration at X Corp", "Open source contributor to Y"],
  "suggested_icebreaker": "I saw you worked on the migration at X Corp — tell me about that"
}
```

**File: `src/pages/interview/LiveInterview.tsx`**

- Remove any logic that depends on `question_bank.questions.length` for progress tracking
- The lobby phase still calls `generate-question-bank` (now generates topic guide) and `pre-interview-coach`
- Everything else stays the same — the Realtime connection, barge-in, captions, persona display

### What This Changes for the Candidate

| Before | After |
|--------|-------|
| AI asks Q1, waits, asks Q2, waits... | AI responds to what you say and explores organically |
| Same 6 questions every time for same role | Different conversation every time based on your answers |
| "Moving on to the next question" | "That's interesting — tell me more about the scaling challenge" |
| Feels like a quiz | Feels like talking to a senior hiring manager |

### Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/realtime-session-token/index.ts` | Replace scripted question list with conversational role briefing + CV context + competency areas |
| `supabase/functions/generate-question-bank/index.ts` | Generate competency topic guide instead of literal questions |
| `src/pages/interview/LiveInterview.tsx` | Minor — remove any question-count-based progress logic |

No database schema changes needed. The `question_bank` column (jsonb) stores the new format without migration.

