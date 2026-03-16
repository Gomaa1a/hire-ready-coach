

## Plan: Option A -- Custom AI Interview Engine

### Summary

Replace the current ElevenLabs Conversational AI agent (which bundles STT+LLM+TTS into one black box) with a custom orchestrator where:
- **ElevenLabs STT** (realtime `useScribe`) handles speech-to-text
- **Lovable AI** (Gemini 3 Flash) is the interview "brain" via a new edge function
- **ElevenLabs TTS** (streaming) handles text-to-speech
- **Database state tracking** enables adaptive, phase-based interviews

### Architecture

```text
User speaks
    │
    ▼
ElevenLabs Realtime STT (useScribe hook)
    │ committed transcript
    ▼
Edge Function: interview-orchestrator
    ├── Loads: interview config, CV text, conversation history, current phase/scores
    ├── Calls: Lovable AI (Gemini 3 Flash) with structured interview methodology
    └── Returns: { next_question, phase, scores, follow_up_needed }
    │
    ▼
Edge Function: elevenlabs-tts-stream
    │ streams audio back
    ▼
Browser plays audio via <Audio> / AudioContext
```

### Changes Required

#### 1. New database table: `interview_state`
Tracks live interview progression per session.

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid PK | |
| interview_id | uuid (FK interviews) | |
| current_phase | text | opening / technical / behavioral / situational / closing |
| question_count | int | Questions asked so far |
| running_scores | jsonb | Per-category scores updated each turn |
| topics_covered | jsonb | Array of topics already explored |
| cv_summary | text | Parsed CV cached here on first turn |
| updated_at | timestamptz | |

RLS: Users can select/update own (via `owns_interview`).

#### 2. New edge function: `interview-orchestrator`
- Receives: `{ interviewId, userMessage }` 
- Loads interview config (role, level), CV text (from storage on first call, cached in `interview_state.cv_summary` after), full conversation history from `messages` table, and current state from `interview_state`
- Builds a rich system prompt encoding:
  - Interview methodology (STAR for behavioral, system design rubric for technical)
  - Current phase and transition rules
  - Running scores and topics covered
  - CV-specific question suggestions
- Calls Lovable AI with tool-calling to return structured output:
  ```json
  {
    "next_question": "string",
    "phase": "technical",
    "scores": { "comm": 72, "tech": 65, ... },
    "follow_up": true,
    "topic": "distributed systems"
  }
  ```
- Saves the AI's question to `messages` table, updates `interview_state`
- Returns the `next_question` text to the client

#### 3. New edge function: `elevenlabs-tts-stream`
- Receives: `{ text, voiceId? }`
- Calls ElevenLabs TTS streaming API (`eleven_turbo_v2_5` for low latency)
- Returns audio stream directly to client
- Uses a professional interviewer voice (e.g., "George" - `JBFqnCBsd6RMkjVDRZzb`)

#### 4. Rewrite `LiveInterview.tsx`
Replace the `useConversation` hook entirely. New flow:
- Use `useScribe` hook from `@elevenlabs/react` for realtime STT
- On each committed transcript from user:
  1. Save user message to `messages` table
  2. Call `interview-orchestrator` edge function
  3. Receive next question text
  4. Call `elevenlabs-tts-stream` and play audio
- Show phase indicator in UI (e.g., "Technical Deep-dive 2/4")
- Keep existing visual design (participant cards, voice visualizer, timer, controls)
- Generate a first question on session start by calling orchestrator with empty user message

#### 5. Update `elevenlabs-token` edge function
- Rename/repurpose to `elevenlabs-scribe-token` -- only generates a realtime STT token (no more agent token)
- Remove the hardcoded `agentId`

#### 6. Update `supabase/config.toml`
- Add entries for new edge functions: `interview-orchestrator`, `elevenlabs-tts-stream`, `elevenlabs-scribe-token`
- Remove or keep `elevenlabs-token` (deprecated)

#### 7. Keep `generate-report` as-is
The report generation function already uses Lovable AI and reads from the `messages` table -- no changes needed.

### Interview Methodology (encoded in orchestrator prompt)

**Phases:**
1. **Opening** (1-2 questions): Warm-up, "tell me about yourself", motivation
2. **Technical Deep-dive** (4-6 questions): Role-specific technical questions, follow-ups on weak answers, CV-referenced project deep-dives
3. **Behavioral** (2-3 questions): STAR-method prompts, leadership, conflict resolution
4. **Situational** (1-2 questions): Hypothetical scenarios relevant to role/level
5. **Closing** (1 question): Candidate questions, wrap-up

**Adaptive Logic:**
- If answer scores < 50 on a topic: ask a simpler follow-up
- If answer scores > 80: escalate difficulty
- Track topics to avoid repetition
- Total ~12-15 questions in a 15-minute session

### What Gets Removed
- `@elevenlabs/react` `useConversation` hook usage (replaced by `useScribe`)
- ElevenLabs agent ID (`agent_9501kk894erbfhqsp9erm8qkpzxw`) -- no longer needed
- `sendContextualUpdate` approach for CV context

