

## Plan: Real-Feel Voice Agent + Enhanced Report

### Problems Identified

1. **Startup lag**: First question requires sequential orchestrator call (AI thinking ~2-3s) + TTS generation (~1-2s) = ~4-5s of silence after joining
2. **No barge-in**: When user starts speaking, the AI keeps playing audio — no mechanism to stop TTS mid-playback
3. **Report is generic**: No market context, no job-specific insights from real hiring data
4. **Candidate journey feels templated**: Same flow for everyone regardless of CV content

---

### Changes

#### 1. Barge-in: Stop AI when user speaks (LiveInterview.tsx)

- When `onCommittedTranscript` or `onPartialTranscript` fires while `aiSpeaking` is true, immediately:
  - Stop the `AudioBufferSourceNode` (call `.stop()`)
  - Stop the HTML5 `Audio` element (call `.pause()`)
  - Set `aiSpeaking = false`
  - Send the user's speech to the orchestrator normally
- This makes the conversation feel natural — user can interrupt just like a real interview

#### 2. Reduce startup lag (LiveInterview.tsx)

- Fire the orchestrator call immediately when `startConversation` begins (don't wait for scribe connection)
- Run scribe token fetch + mic permission + orchestrator first question **in parallel** using `Promise.all`
- Pre-create the `AudioContext` on page load (not on join click)

#### 3. Enhanced Report with Job Market Research (generate-report edge function)

- Before generating the report, call Lovable AI with a separate prompt to research/generate market context for the role:
  - What companies are hiring for this role right now
  - Key skills employers are looking for
  - Salary range expectations for the level
  - Common interview topics at top companies
- Add new fields to the report tool schema:
  - `market_insights`: Object with `top_skills`, `salary_range`, `hiring_trends`, `company_tips`
  - `personalized_tips`: Array of tips specific to the candidate's CV gaps vs market demands
- Add a new `market_insights` JSONB column to the `reports` table

#### 4. Personalized Candidate Journey (interview-orchestrator)

- Enhance the system prompt to:
  - Reference the candidate's name (from profiles table)
  - Use specific CV details in transitions (e.g., "I noticed you worked at X, let's talk about that")
  - Vary opening style based on role type (casual for startups, formal for finance)
  - Add personality to the interviewer (brief acknowledgments like "That's a great point" or "Interesting approach")
- Load the candidate's name from profiles table in the orchestrator

#### 5. Report UI Enhancement (Report.tsx)

- Add a new "Market Insights" section showing:
  - Top skills card grid
  - Salary benchmark indicator
  - "How you compare" section matching candidate scores to market expectations
  - Personalized action items based on CV gaps

---

### Database Migration

```sql
ALTER TABLE public.reports ADD COLUMN market_insights jsonb DEFAULT NULL;
```

### Files to Edit

| File | Changes |
|------|---------|
| `src/pages/interview/LiveInterview.tsx` | Barge-in logic, parallel startup, reduced lag |
| `supabase/functions/interview-orchestrator/index.ts` | Load candidate name, enhanced personalization in prompt |
| `supabase/functions/generate-report/index.ts` | Two-step: market research call + enhanced report generation |
| `src/pages/Report.tsx` | New Market Insights section, personalized tips display |
| Database migration | Add `market_insights` column to reports |

