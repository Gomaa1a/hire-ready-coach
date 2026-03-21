

## Plan: Fix Double-Voice Bug + Realistic Interview UI

### Problem 1: Double Voice (Race Condition)

The `handleUserTurn` → `callOrchestrator` → `playTTS` pipeline has no concurrency guard. If two committed transcripts fire close together (debounce fires while a previous orchestrator call is still running), two TTS streams play simultaneously, creating overlapping voices.

**Fix**: Add a `processingRef` mutex lock. Before calling the orchestrator, check if already processing. If so, queue the text and process it after the current turn completes. Also stop any in-flight TTS before starting a new one.

### Problem 2: Unrealistic UI

Current UI uses emoji circles (🤖 👤) with a cartoon-like layout. Replace with a professional video-call-inspired design.

**New UI Design**:
- Full dark background mimicking a video call (like Zoom/Google Meet)
- AI interviewer: a large centered "avatar card" with subtle animated waveform ring (no emoji — use initials or a professional silhouette icon)
- Candidate area: minimal bottom bar with mic/end controls
- Live captions overlay at the bottom (like real-time subtitles in video calls)
- Phase indicator as a subtle pill in the top-right corner
- Timer in top-left, minimal
- Smooth pulse animation on the AI avatar when speaking instead of the separate VoiceVisualizer component
- "Thinking..." state shows a subtle typing indicator dots animation

### Files to Edit

| File | Changes |
|------|---------|
| `src/pages/interview/LiveInterview.tsx` | Add processing mutex to prevent double orchestrator calls; complete UI redesign to video-call style |
| `src/components/interview/InterviewTopBar.tsx` | Simplify to minimal overlay-style top bar |

### Technical Details

**Mutex pattern for orchestrator calls:**
```typescript
const orchestratorLockRef = useRef(false);
const queuedTextRef = useRef<string | null>(null);

const handleUserTurn = async (text: string) => {
  if (orchestratorLockRef.current) {
    queuedTextRef.current = text; // overwrite — latest message wins
    return;
  }
  orchestratorLockRef.current = true;
  stopAiAudio(); // stop any playing audio first
  await callOrchestrator(text);
  orchestratorLockRef.current = false;
  
  // Process queued message if any
  if (queuedTextRef.current) {
    const queued = queuedTextRef.current;
    queuedTextRef.current = null;
    await handleUserTurn(queued);
  }
};
```

**UI layout (video-call style):**
```text
┌─────────────────────────────────────┐
│ 🟢 15:00          Technical · Q3    │  ← minimal top overlay
│                                     │
│                                     │
│          ┌───────────┐              │
│          │           │              │
│          │    AI     │              │  ← large centered avatar
│          │  Avatar   │              │     with pulse ring when speaking
│          │           │              │
│          └───────────┘              │
│         "AI Interviewer"            │
│                                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ Live captions subtitle bar  │    │  ← bottom caption overlay
│  └─────────────────────────────┘    │
│                                     │
│        [🎤]  [📞 End]              │  ← floating controls
└─────────────────────────────────────┘
```

