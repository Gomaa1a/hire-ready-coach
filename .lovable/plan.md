

## Plan: Multi-Layer Noise Rejection for Voice Agent

### Root Cause

The current approach relies only on two things: (1) a system prompt telling the AI to "ignore noise" and (2) OpenAI's server-side VAD threshold at 0.7. This is insufficient because:

- **VAD still triggers** on loud coughs, door slams, or nearby speech — threshold 0.7 isn't high enough for noisy environments
- **Whisper still transcribes noise** — even if VAD triggers on a cough, Whisper produces a transcription like "Hmm" or "Yeah" or gibberish, and the model responds to it
- **No client-side filtering** — every transcription, no matter how short or incoherent, gets saved to the conversation log and DB, polluting the transcript

We need a **3-layer defense**: client-side audio processing → stricter VAD → client-side transcript filtering.

### Changes

#### 1. Client-Side Audio Noise Gate (`src/hooks/useRealtimeInterview.ts`)

Before sending microphone audio to WebRTC, run it through a Web Audio API processing chain:

- **Noise gate via `createDynamicsCompressor`** — suppress audio below a volume threshold so quiet background sounds never reach OpenAI
- **High-pass filter at 85Hz** — remove low-frequency rumble (AC units, traffic, fans)
- **The processed stream** replaces the raw mic stream on the PeerConnection

This means OpenAI never even *hears* quiet background noise.

#### 2. Increase VAD Threshold & Eagerness (`supabase/functions/realtime-session-token/index.ts`)

- `threshold`: 0.7 → **0.85** (only clear, loud speech triggers)
- `silence_duration_ms`: 1000 → **1200** (waits longer to confirm user stopped)
- `prefix_padding_ms`: 400 → **500** (captures more lead-in, reducing false starts)

#### 3. Client-Side Transcript Filtering (`src/hooks/useRealtimeInterview.ts`)

When a user transcription arrives (`conversation.item.input_audio_transcription.completed`), filter it before adding to the conversation:

- **Discard if fewer than 3 words** — single words like "Hmm", "Uh", cough transcriptions get dropped
- **Discard if it matches a noise pattern** — regex for common noise transcriptions: "hmm", "uh huh", "mm", "yeah", "(laughing)", "(coughing)", "[inaudible]", etc.
- **Only save clean, intentional speech** to the conversation log and database

#### 4. Reinforce Prompt with Explicit Ignore List (`supabase/functions/realtime-session-token/index.ts`)

Add an explicit list of transcriptions to never respond to:

```
TRANSCRIPTIONS TO SILENTLY IGNORE (do NOT respond, do NOT acknowledge):
- Single words: "Hmm", "Uh", "Mm", "Yeah", "Ok", "Ah"
- Sound descriptions: "(laughing)", "(coughing)", "[inaudible]", "(background noise)"
- Fragments under 3 words that don't form a question or statement
- Any text that appears to be someone else speaking in the background
If you're unsure whether the candidate is speaking to you, WAIT silently. Do NOT say "Could you repeat that?" or "I didn't catch that."
```

### Files Changed

| File | Change |
|------|--------|
| `src/hooks/useRealtimeInterview.ts` | Add Web Audio noise gate + high-pass filter before WebRTC; add transcript filtering logic to discard noise transcriptions |
| `supabase/functions/realtime-session-token/index.ts` | Raise VAD to 0.85/1200ms/500ms; add explicit ignore list to prompt |

### What This Achieves

| Layer | What It Blocks |
|-------|---------------|
| Audio noise gate (client) | Quiet sounds never reach OpenAI — fans, typing, distant speech |
| High-pass filter (client) | Low rumble from AC, traffic, vibrations |
| Higher VAD threshold (server) | Medium-volume sounds like coughs, door closing |
| Transcript filter (client) | Even if Whisper transcribes noise, short/gibberish text is discarded |
| Prompt ignore list (server) | Last resort — model explicitly told to ignore specific patterns |

