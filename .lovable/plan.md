

## Plan: Make the Interviewer Strict & Fix Background Noise Handling

### Problem

1. **Too agreeable** — The agent acts like a "perfect ChatGPT", praising every answer ("Great answer!", "That's wonderful!"). Real interviewers are neutral-to-skeptical.
2. **Background noise misinterpretation** — The agent picks up ambient sounds, coughs, side conversations and treats them as candidate speech, then asks about them.

### Changes

**Single file:** `supabase/functions/realtime-session-token/index.ts`

#### 1. Strict Interviewer Tone (System Prompt)

Add a `TONE & DEMEANOR` section replacing the current overly friendly approach:

- **Never praise answers.** No "Great answer", "That's really impressive", "Wonderful point". A real interviewer stays neutral.
- **Acknowledge with minimal phrases only:** "I see.", "Understood.", "Okay.", "Got it.", "Noted." — then move to the next question or follow-up.
- **If the answer is weak, say so diplomatically:** "I was hoping for more specifics there.", "That's quite general — can you give me a concrete example?"
- **If the answer is strong, don't celebrate.** Just dig deeper: "Walk me through the hardest part of that."
- **Default posture: professionally skeptical.** You are evaluating, not cheerleading.

#### 2. Background Noise Handling (System Prompt + VAD Config)

**Prompt addition — `AUDIO AWARENESS` section:**
- You are in a voice call. Background noises (coughs, doors, typing, other people talking nearby, ambient sounds) are normal and expected.
- **NEVER** ask about or reference background sounds: "What was that?", "Did you say something?", "I heard something."
- If you receive a transcription that is clearly not a coherent sentence or seems like background noise (single words, gibberish, sounds), **ignore it completely** and wait for the candidate to speak.
- Only respond to clear, intentional speech directed at you.

**VAD threshold tuning:**
- Increase `threshold` from `0.5` → `0.7` (requires louder/clearer speech to trigger)
- Increase `silence_duration_ms` from `700` → `1000` (waits longer before deciding the user stopped talking, reducing false triggers from brief noises)
- Increase `prefix_padding_ms` from `300` → `400`

### Summary

| Area | Current | After |
|------|---------|-------|
| Tone | Overly positive, praises everything | Neutral, professionally skeptical |
| Noise | Reacts to every sound as speech | Ignores background noise, only responds to clear speech |
| VAD threshold | 0.5 (sensitive) | 0.7 (requires clearer speech) |
| VAD silence | 700ms | 1000ms (fewer false triggers) |

