

## Plan: Add Unique AI Agents to the Platform

### What We're Building

Three new AI-powered agents that extend the candidate journey beyond the core interview, making HireReady a full career preparation platform:

1. **Pre-Interview Coach Agent** — A voice agent on the lobby/waiting room screen that gives the candidate a 60-second personalized coaching tip before the interview starts (e.g., "For this Senior Software Engineer role, make sure to emphasize system design experience...")
2. **Report Narrator Agent** — After the report is generated, a "Listen to your debrief" button plays an AI voice walkthrough of the report results, like a personal career coach explaining the scores
3. **Salary Negotiation Simulator** — A separate page/modal accessible from the report where the candidate practices negotiating a job offer with an AI HR manager voice agent

### Technical Details

#### Agent 1: Pre-Interview Coach (Edge Function + Frontend)

**New edge function: `supabase/functions/pre-interview-coach/index.ts`**
- Receives `{ interviewId }`, fetches the role, level, and candidate profile (target_role, experience_level, biggest_challenge)
- Calls Lovable AI (Gemini Flash) to generate a short (3-4 sentence) personalized coaching tip
- Returns `{ coachingTip: string }`

**Frontend: `src/pages/interview/LiveInterview.tsx`**
- During the lobby phase, after generating question bank, call `pre-interview-coach` edge function
- Display the coaching tip as an animated text reveal below the interviewer persona card
- Add a subtle "Coach says:" label with a lightbulb icon
- The tip appears during the 5-second countdown, giving the candidate something valuable to read while waiting

#### Agent 2: Report Narrator (Edge Function + Frontend)

**New edge function: `supabase/functions/narrate-report/index.ts`**
- Receives `{ interviewId }`, fetches the report data from the `reports` table
- Builds a natural script: "Hey [name], let me walk you through your results. You scored [X]% overall — here's what stood out..."
- Calls ElevenLabs TTS API (already have ELEVENLABS_API_KEY) to generate audio
- Returns the audio as a base64 string or streams it

**Frontend: `src/pages/Report.tsx`**
- Add a "Listen to Your Debrief" button at the top of the report (below header)
- On click, fetch audio from the edge function, play it using an `<audio>` element
- Show a mini player bar with play/pause, progress, and a pulsing avatar while playing
- The narration covers: overall score, top strength, biggest area to improve, and one roadmap item

#### Agent 3: Salary Negotiation Simulator (Edge Function + Page)

**New edge function: `supabase/functions/negotiation-session-token/index.ts`**
- Similar to `realtime-session-token` but with a different system prompt
- The AI plays an HR manager making a job offer for the candidate's role
- Instructions: present an offer (salary from market_insights), let candidate negotiate, respond realistically, after 3-4 exchanges wrap up and give feedback on negotiation skills
- Uses OpenAI Realtime API (same WebRTC approach as the interview)

**New page: `src/pages/interview/NegotiationSim.tsx`**
- Accessible from the Report page via a "Practice Negotiation" button
- Reuses the same dark video-call UI from LiveInterview (interviewer avatar, captions, controls)
- Different persona: "HR Manager" type (uses `generatePersona` with HR-related titles)
- Shorter session: 5-minute timer instead of 15
- After ending, shows a brief scorecard (assertiveness, professionalism, outcome) — generated via Lovable AI edge function call

**New edge function: `supabase/functions/score-negotiation/index.ts`**
- Takes the negotiation transcript, scores on: assertiveness (0-100), professionalism (0-100), negotiation outcome (accepted/countered/rejected), and 2-3 tips
- Returns structured JSON, displayed on a simple results card

**Database migration:**
- Add `negotiation_sessions` table: `id`, `interview_id`, `user_id`, `created_at`, `ended_at`, `assertiveness_score`, `professionalism_score`, `outcome`, `tips` (jsonb)

**Route:** Add `/negotiation/:interviewId` to App.tsx

**InterviewerPersona.ts update:**
- Add HR-specific title category: "HR Director", "VP of People", "Compensation Manager", "Head of Talent"

### Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/pre-interview-coach/index.ts` | New — generates personalized coaching tip |
| `supabase/functions/narrate-report/index.ts` | New — generates TTS audio walkthrough of report |
| `supabase/functions/negotiation-session-token/index.ts` | New — OpenAI Realtime session for salary negotiation |
| `supabase/functions/score-negotiation/index.ts` | New — scores negotiation transcript |
| `src/pages/interview/LiveInterview.tsx` | Add coaching tip display in lobby phase |
| `src/pages/Report.tsx` | Add "Listen to Debrief" button + audio player, "Practice Negotiation" button |
| `src/pages/interview/NegotiationSim.tsx` | New — salary negotiation voice simulator page |
| `src/components/interview/InterviewerPersona.ts` | Add HR title category |
| `src/App.tsx` | Add `/negotiation/:interviewId` route |
| Database migration | New `negotiation_sessions` table |

### What Makes This Unique

- **Pre-Interview Coach**: No other platform gives you a personalized pep talk before the interview starts — it reduces anxiety and primes the candidate
- **Report Narrator**: Hearing your results explained by a voice coach is far more engaging than reading a wall of text — "Spotify Wrapped" for interviews
- **Salary Negotiation**: This is the feature no competitor has — candidates practice the hardest conversation (money talk) in a safe environment with AI feedback

