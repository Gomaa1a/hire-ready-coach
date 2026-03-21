import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, PhoneOff, User } from "lucide-react";
import { toast } from "sonner";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";

type TranscriptEntry = { role: "ai" | "user"; text: string };

const PHASE_LABELS: Record<string, string> = {
  opening: "Opening",
  technical: "Technical",
  behavioral: "Behavioral",
  situational: "Situational",
  closing: "Closing",
};

const LiveInterview = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [interviewData, setInterviewData] = useState<{ role: string; level: string } | null>(null);
  const [currentPhase, setCurrentPhase] = useState("opening");
  const [questionCount, setQuestionCount] = useState(0);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const userSpeechBuffer = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSpeakingRef = useRef(false);
  const pendingUserText = useRef<string[]>([]);

  // === MUTEX: prevent double orchestrator calls ===
  const orchestratorLockRef = useRef(false);
  const queuedTextRef = useRef<string | null>(null);

  useEffect(() => {
    aiSpeakingRef.current = aiSpeaking;
  }, [aiSpeaking]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("interviews")
      .select("role, level")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) setInterviewData(data);
      });
  }, [id]);

  useEffect(() => {
    audioContextRef.current = new AudioContext({ latencyHint: "interactive" });
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  const stopAiAudio = useCallback(() => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch { /* already stopped */ }
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setAiSpeaking(false);
  }, []);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      userSpeechBuffer.current = data.text;
      if (aiSpeakingRef.current && data.text.trim().length > 3) {
        stopAiAudio();
      }
    },
    onCommittedTranscript: (data) => {
      if (!data.text.trim()) return;
      const text = data.text.trim();
      userSpeechBuffer.current = "";

      if (aiSpeakingRef.current) {
        stopAiAudio();
      }

      setTranscript((prev) => [...prev, { role: "user", text }]);

      pendingUserText.current.push(text);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        const fullText = pendingUserText.current.join(" ");
        pendingUserText.current = [];
        handleUserTurn(fullText);
      }, 1200);
    },
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    if (!interviewStarted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleEndInterview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [interviewStarted]);

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext({ latencyHint: "interactive" });
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playTTS = useCallback(async (text: string): Promise<void> => {
    setAiSpeaking(true);
    try {
      const audioContext = await ensureAudioContext();
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts-stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error("TTS response error:", response.status, errText);
        throw new Error(`TTS failed: ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      if (audioBuffer.byteLength === 0) throw new Error("Empty audio response");
      if (!aiSpeakingRef.current) return;

      try {
        const decoded = await audioContext.decodeAudioData(audioBuffer.slice(0));
        if (!aiSpeakingRef.current) return;
        await new Promise<void>((resolve) => {
          const source = audioContext.createBufferSource();
          source.buffer = decoded;
          source.connect(audioContext.destination);
          audioSourceRef.current = source;
          source.onended = () => {
            if (audioSourceRef.current === source) audioSourceRef.current = null;
            resolve();
          };
          source.start(0);
        });
      } catch (decodeError) {
        console.warn("AudioContext decode failed, using HTML audio fallback", decodeError);
        if (!aiSpeakingRef.current) return;
        const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.volume = 1.0;
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            if (audioRef.current === audio) audioRef.current = null;
            resolve();
          };
          audio.onerror = () => { URL.revokeObjectURL(audioUrl); reject(new Error("Audio playback failed")); };
          audio.play().catch((playErr) => { URL.revokeObjectURL(audioUrl); reject(playErr); });
        });
      }
    } catch (e) {
      console.error("TTS playback error:", e);
      toast.error("Could not play interviewer audio. Please check your device output.");
    } finally {
      setAiSpeaking(false);
      audioRef.current = null;
    }
  }, [ensureAudioContext]);

  const callOrchestrator = useCallback(async (userMessage?: string) => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("interview-orchestrator", {
        body: { interviewId: id, userMessage: userMessage || "" },
      });
      if (error) throw error;
      if (!data?.next_question) throw new Error("No question returned");

      setCurrentPhase(data.phase || "opening");
      setQuestionCount(data.question_count || 0);
      setTranscript((prev) => [...prev, { role: "ai", text: data.next_question }]);
      await playTTS(data.next_question);
    } catch (e) {
      console.error("Orchestrator error:", e);
      toast.error("Failed to get next question. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [id, playTTS]);

  // === MUTEX-GUARDED user turn handler ===
  const handleUserTurn = useCallback(async (text: string) => {
    if (orchestratorLockRef.current) {
      queuedTextRef.current = text; // latest wins
      return;
    }
    orchestratorLockRef.current = true;
    stopAiAudio();
    await callOrchestrator(text);
    orchestratorLockRef.current = false;

    // Process queued message if any
    if (queuedTextRef.current) {
      const queued = queuedTextRef.current;
      queuedTextRef.current = null;
      await handleUserTurn(queued);
    }
  }, [callOrchestrator, stopAiAudio]);

  const startConversation = useCallback(async () => {
    setIsConnecting(true);
    try {
      const audioCtxPromise = ensureAudioContext();
      const [, scribeResult, firstQuestionResult] = await Promise.all([
        Promise.all([audioCtxPromise, navigator.mediaDevices.getUserMedia({ audio: true })]),
        supabase.functions.invoke("elevenlabs-scribe-token"),
        supabase.functions.invoke("interview-orchestrator", {
          body: { interviewId: id, userMessage: "" },
        }),
      ]);

      const { data: scribeData, error: scribeError } = scribeResult;
      if (scribeError || !scribeData?.token) throw new Error("No scribe token received");

      await scribe.connect({
        token: scribeData.token,
        microphone: { echoCancellation: true, noiseSuppression: true },
      });

      setInterviewStarted(true);
      toast.success("Connected! Starting interview...");

      const { data: firstQ, error: firstQErr } = firstQuestionResult;
      if (firstQErr || !firstQ?.next_question) throw new Error("Failed to get first question");

      setCurrentPhase(firstQ.phase || "opening");
      setQuestionCount(firstQ.question_count || 0);
      setTranscript((prev) => [...prev, { role: "ai", text: firstQ.next_question }]);
      await playTTS(firstQ.next_question);
    } catch (error) {
      console.error("Failed to start conversation:", error);
      toast.error("Failed to connect. Please check microphone permissions.");
    } finally {
      setIsConnecting(false);
    }
  }, [scribe, ensureAudioContext, id, playTTS]);

  const handleEndInterview = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    stopAiAudio();
    scribe.disconnect();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    toast.success("Great work! Processing results...");

    if (id) {
      try {
        await supabase.from("interviews").update({ status: "completed", ended_at: new Date().toISOString() }).eq("id", id);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          supabase.functions.invoke("generate-report", { body: { interviewId: id, userId: user.id } })
            .then(({ error: reportErr }) => { if (reportErr) console.error("Report generation failed:", reportErr); });
        }
      } catch (e) {
        console.error("End interview error:", e);
      }
    }
    navigate(`/report/${id || "demo"}`);
  }, [scribe, navigate, id, stopAiAudio]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
    toast.info(isMuted ? "Microphone unmuted" : "Microphone muted");
  }, [isMuted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const pct = timeLeft / 900;
  const timerColor = pct > 0.4 ? "text-success" : pct > 0.15 ? "text-coral" : "text-destructive";

  const lastCaption = transcript.slice(-1)[0];

  // ============ RENDER ============

  // Pre-join screen
  if (!interviewStarted) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-ink px-4">
        <div className="flex flex-col items-center gap-6 text-center max-w-lg">
          {/* Large mic icon */}
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10">
            <Mic className="h-12 w-12 text-primary" />
            <div className="absolute inset-0 animate-ping rounded-full border border-primary/20" style={{ animationDuration: "2s" }} />
          </div>

          <h1 className="font-heading text-2xl font-bold text-primary-foreground">
            Ready when you are
          </h1>

          {interviewData && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary">
                {interviewData.role}
              </span>
              <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium text-primary-foreground/60">
                {interviewData.level}
              </span>
            </div>
          )}

          <p className="text-sm leading-relaxed text-primary-foreground/50">
            Voice interview with AI — it adapts in real time, just like a real conversation. 
            You can interrupt, pause, and speak naturally.
          </p>

          <button
            onClick={startConversation}
            disabled={isConnecting}
            className="mt-2 flex items-center gap-2 rounded-full bg-primary px-8 py-4 font-heading text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {isConnecting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                Connecting…
              </>
            ) : (
              "Join Interview"
            )}
          </button>
        </div>
      </div>
    );
  }

  // Active interview — video-call layout
  return (
    <div className="relative flex h-screen flex-col bg-ink overflow-hidden">
      {/* === TOP OVERLAY BAR === */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3">
        {/* Left: status + timer */}
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          <span className={`font-heading text-lg font-bold tabular-nums ${timerColor}`}>
            {formatTime(timeLeft)}
          </span>
        </div>
        {/* Right: phase pill */}
        <div className="flex items-center gap-2 rounded-full bg-foreground/10 backdrop-blur-sm px-3 py-1.5">
          <span className="text-xs font-medium text-primary-foreground/70">
            {PHASE_LABELS[currentPhase] || currentPhase}
          </span>
          <span className="text-xs text-primary-foreground/40">· Q{questionCount}</span>
        </div>
      </div>

      {/* === CENTER: AI AVATAR === */}
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          {/* Avatar with pulse ring */}
          <div className="relative">
            {/* Outer pulse rings when speaking */}
            {aiSpeaking && (
              <>
                <div className="absolute inset-0 -m-3 animate-ping rounded-full bg-primary/10" style={{ animationDuration: "1.5s" }} />
                <div className="absolute inset-0 -m-6 animate-ping rounded-full bg-primary/5" style={{ animationDuration: "2s" }} />
              </>
            )}
            <div
              className={`relative flex h-32 w-32 items-center justify-center rounded-full transition-all duration-500 ${
                aiSpeaking
                  ? "bg-primary/20 ring-2 ring-primary/60 shadow-[0_0_40px_rgba(var(--primary),0.3)]"
                  : processing
                  ? "bg-foreground/10 ring-2 ring-foreground/20"
                  : "bg-foreground/10"
              }`}
            >
              <User className="h-14 w-14 text-primary-foreground/60" />

              {/* Speaking waveform bars */}
              {aiSpeaking && (
                <div className="absolute -bottom-4 flex items-end gap-[3px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-[3px] rounded-full bg-primary animate-pulse"
                      style={{
                        height: `${10 + Math.random() * 14}px`,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: "0.4s",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Name + status */}
          <div className="text-center">
            <p className="font-heading text-sm font-semibold text-primary-foreground">
              AI Interviewer
            </p>
            <p className="mt-0.5 text-xs text-primary-foreground/40">
              {aiSpeaking ? "Speaking" : processing ? (
                <span className="inline-flex items-center gap-1">
                  Thinking
                  <span className="flex gap-0.5">
                    <span className="h-1 w-1 rounded-full bg-primary-foreground/40 animate-bounce" style={{ animationDelay: "0s" }} />
                    <span className="h-1 w-1 rounded-full bg-primary-foreground/40 animate-bounce" style={{ animationDelay: "0.15s" }} />
                    <span className="h-1 w-1 rounded-full bg-primary-foreground/40 animate-bounce" style={{ animationDelay: "0.3s" }} />
                  </span>
                </span>
              ) : "Listening"}
            </p>
          </div>
        </div>
      </div>

      {/* === BOTTOM: CAPTIONS + CONTROLS === */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-4 pb-6">
        {/* Live caption bar */}
        <div className="mx-4 w-full max-w-xl">
          {lastCaption ? (
            <div className="rounded-xl bg-foreground/10 backdrop-blur-md px-5 py-3">
              <p className="text-sm text-primary-foreground/80 text-center leading-relaxed">
                <span className="font-semibold text-primary-foreground/60 text-xs uppercase tracking-wider mr-2">
                  {lastCaption.role === "ai" ? "Interviewer" : "You"}
                </span>
                {lastCaption.text}
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-foreground/5 px-5 py-3">
              <p className="text-xs text-primary-foreground/30 text-center">
                Live captions will appear here
              </p>
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              isMuted
                ? "bg-destructive/90 text-destructive-foreground"
                : "bg-foreground/10 text-primary-foreground hover:bg-foreground/20"
            }`}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            onClick={handleEndInterview}
            className="flex h-12 items-center gap-2 rounded-full bg-destructive/90 px-6 text-destructive-foreground transition-all hover:bg-destructive"
          >
            <PhoneOff className="h-5 w-5" />
            <span className="text-sm font-semibold">End</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveInterview;
