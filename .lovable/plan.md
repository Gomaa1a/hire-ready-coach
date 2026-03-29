

## Plan: Real-Feel Interview Experience Enhancements

### What We're Building

Four enhancements to make the interview feel like a real human conversation instead of an AI tool:

1. **Waiting Room Lobby** — A 5-second countdown screen after clicking "Join" that builds anticipation (like joining a real Zoom interview)
2. **Interviewer Persona** — Generate a random interviewer name, title, and company so the candidate feels they're meeting a real person (e.g., "Sarah Chen, Engineering Manager at TechCorp")
3. **Cinematic Debrief Transition** — After ending the interview, show a 4-second "Interview Complete" screen with stats (duration, questions answered) before navigating to the report
4. **UI Polish** — Show the interviewer persona name/title on the active interview screen, replace generic "AI Interviewer" label

### Technical Details

**File: `src/pages/interview/LiveInterview.tsx`**

Major restructure of the component flow into 4 phases:

```text
Phase 1: PRE-JOIN (current) — "Ready when you are" + Join button
Phase 2: WAITING ROOM (new) — 5s countdown with interviewer persona card
Phase 3: ACTIVE INTERVIEW (current, enhanced) — Show persona name instead of "AI Interviewer"
Phase 4: DEBRIEF (new) — "Interview Complete" cinematic screen (4s) before navigating to report
```

- Add state: `phase: "pre-join" | "lobby" | "active" | "debrief"`
- Add state: `interviewerPersona: { name, title, company }`
- On "Join" click: generate question bank (existing), then enter lobby phase
- Lobby phase: show interviewer avatar with name/title/company, 5-second countdown, auto-transition to active phase where `startSession()` is called
- On "End Interview": enter debrief phase showing duration, question count from conversationLog, a checkmark animation, then after 4s navigate to report
- Generate persona randomly from a curated list of ~20 names, ~10 titles, ~10 companies (all hardcoded arrays, no API call needed)

**File: `src/components/interview/InterviewerPersona.ts`** (new)

A simple utility that exports a `generatePersona()` function returning `{ name, title, company, initials }` from curated arrays. Names are diverse and professional. Titles match the interview role context (e.g., for "Software Engineer" → "Engineering Manager", for "Product Manager" → "VP of Product").

### Changes Summary

| File | Change |
|------|--------|
| `src/components/interview/InterviewerPersona.ts` | New — persona generator utility |
| `src/pages/interview/LiveInterview.tsx` | Major — add lobby phase, debrief phase, persona display, 4-phase flow |

No database changes. No edge function changes. Pure frontend enhancement.

