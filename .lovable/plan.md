

## Plan: Make the Interview Truly Real — Gap Analysis & Enhancements

### Honest Assessment: Where It Stands Now

The foundation is solid — conversational prompting, adaptive difficulty, persona, lobby, debrief. But here's what still makes it feel "AI tool" vs "real interview":

**Current Reality Score: 6/10**

What's missing is not more prompting — it's **sensory and behavioral realism**. A real interview has texture: you see yourself on camera, you hear typing, the interviewer pauses to think, they push back, and you get real-time awareness of your own performance.

### The 5 Enhancements That Close the Gap

---

### 1. Webcam Self-View (Like Zoom)

Show the candidate their own camera feed in a small circle (bottom-right), exactly like a video call. The interviewer stays avatar-only (no deepfake needed), but seeing yourself creates interview psychology — you sit up straighter, you're more aware of your presentation.

**File:** `src/pages/interview/LiveInterview.tsx`
- Add a `<video>` element using the existing microphone `MediaStream` (request video too)
- Small 120x120 circle, bottom-right, with border glow
- Toggle to hide/show

---

### 2. Real-Time Speech Analytics (Filler Word Counter + Pace Tracker)

Parse the user's transcript entries in real-time to count filler words ("um", "uh", "like", "you know", "basically", "actually") and measure words-per-minute. Show a subtle, non-distracting indicator on screen — a small bar that turns amber if pace is too fast or filler count is climbing.

This is the feature that actually **improves skills**. Candidates become self-aware of their speech habits.

**Files:**
- `src/hooks/useSpeechAnalytics.ts` — New hook that processes `conversationLog` entries in real-time
- `src/pages/interview/LiveInterview.tsx` — Add a minimal analytics bar (filler count + pace indicator)
- `supabase/functions/generate-report/index.ts` — Include speech analytics data in the report

---

### 3. Interviewer "Thinking" Pauses + Note-Taking Sounds

Real interviewers don't respond instantly. They pause, say "hmm", type notes. Right now the AI responds the millisecond the candidate stops speaking.

**File:** `src/hooks/useRealtimeInterview.ts`
- After user finishes speaking (`conversation.item.input_audio_transcription.completed`), show a "Taking notes..." state for 1-2 seconds before the AI response plays
- Play subtle keyboard typing sounds during this pause (small audio file)

**File:** `src/pages/interview/LiveInterview.tsx`
- Add a "Taking notes..." status below the avatar (between "Listening" and "Speaking")

---

### 4. Pushback & Challenge Behavior in the Agent

Real interviewers don't just accept answers — they challenge. "I'm not sure I agree with that approach", "What if the client pushed back?", "Play devil's advocate for me." This is missing from the system prompt.

**File:** `supabase/functions/realtime-session-token/index.ts`
- Add to the system prompt:
```
CHALLENGE BEHAVIOR:
- After every 2-3 answers, gently push back on one point: 
  "Interesting, but what if [alternative]?", "I'd challenge that — 
  what about [edge case]?"
- If the candidate gives a textbook answer, say: "That's the standard 
  approach. What would YOU do differently?"
- Occasionally play devil's advocate: "Let me push back on that..."
- Use strategic silence — after an answer, wait 2-3 seconds before 
  responding. The candidate will often add more depth unprompted.
- Never be hostile. Be professionally skeptical, like a senior 
  colleague stress-testing an idea.
```

---

### 5. Interview Type Selection (Behavioral / Technical / Case Study / Stress)

Currently all interviews are the same format. Real companies use different styles. Let the candidate choose:

- **Behavioral**: STAR method, past experiences, leadership stories
- **Technical**: Deep domain knowledge, problem-solving, system design
- **Case Study**: Given a scenario, walk through analysis and recommendation
- **Stress**: Rapid-fire questions, time pressure, curveball questions, interruptions

Each type changes the system prompt personality and approach.

**Files:**
- `src/pages/interview/NewInterview.tsx` — Add step 3: interview type selection
- `interviews` table — Add `interview_type` column via migration
- `supabase/functions/realtime-session-token/index.ts` — Switch prompt personality based on type
- `supabase/functions/generate-question-bank/index.ts` — Adjust topic guide structure per type

---

### Changes Summary

| File | Change |
|------|--------|
| `src/pages/interview/LiveInterview.tsx` | Add webcam self-view, speech analytics bar, "taking notes" state |
| `src/hooks/useSpeechAnalytics.ts` | New — real-time filler word + pace tracking hook |
| `src/hooks/useRealtimeInterview.ts` | Add thinking pause delay + note-taking sound |
| `supabase/functions/realtime-session-token/index.ts` | Add pushback/challenge behavior + interview type prompt variants |
| `supabase/functions/generate-question-bank/index.ts` | Adjust topic guide per interview type |
| `src/pages/interview/NewInterview.tsx` | Add interview type selection step |
| DB migration | Add `interview_type` column to `interviews` table |

### Priority Order

1. **Pushback behavior** (prompt change only, highest impact)
2. **Speech analytics** (the skill-building differentiator)
3. **Webcam self-view** (instant realism boost)
4. **Thinking pauses** (subtle but powerful)
5. **Interview types** (variety and replay value)

### What This Gets You

**Reality Score: 6/10 → 9/10**

The combination of seeing yourself, hearing "note-taking", getting challenged, tracking your own filler words, and choosing interview styles makes this feel like a real prep session with a demanding hiring manager — not a chatbot reading questions.

