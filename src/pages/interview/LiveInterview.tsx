import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
import VoiceVisualizer from "@/components/interview/VoiceVisualizer";
import InterviewTopBar from "@/components/interview/InterviewTopBar";

type TranscriptEntry = { role: "ai" | "user"; text: string };

const PHASE_LABELS: Record<string, string> = {
  opening: "Opening",
  technical: "Technical Deep-dive",
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
  const userSpeechBuffer = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch interview details on mount
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

  // Setup ElevenLabs Scribe for real-time STT
  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      // Update live partial text display
      userSpeechBuffer.current = data.text;
    },
    onCommittedTranscript: (data) => {
      if (!data.text.trim() || aiSpeaking || processing) return;
      const text = data.text.trim();
      userSpeechBuffer.current = "";

      // Add to transcript display
      setTranscript((prev) => [...prev, { role: "user", text }]);

      // Debounce: wait for silence before sending to orchestrator
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        handleUserTurn(text);
      }, 1200);
    },
  });

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Timer
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

  const playTTS = useCallback(async (text: string): Promise<void> => {
    setAiSpeaking(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts-stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          reject(new Error("Audio playback failed"));
        };
        audio.play().catch(reject);
      });
    } catch (e) {
      console.error("TTS playback error:", e);
    } finally {
      setAiSpeaking(false);
      audioRef.current = null;
    }
  }, []);

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

      // Add AI response to transcript
      setTranscript((prev) => [...prev, { role: "ai", text: data.next_question }]);

      // Play TTS
      await playTTS(data.next_question);
    } catch (e) {
      console.error("Orchestrator error:", e);
      toast.error("Failed to get next question. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [id, playTTS]);

  const handleUserTurn = useCallback(async (text: string) => {
    await callOrchestrator(text);
  }, [callOrchestrator]);

  const startConversation = useCallback(async () => {
    setIsConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get scribe token
      const { data, error } = await supabase.functions.invoke("elevenlabs-scribe-token");
      if (error || !data?.token) throw new Error("No scribe token received");

      // Connect STT
      await scribe.connect({
        token: data.token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      setInterviewStarted(true);
      toast.success("Connected! Starting interview...");

      // Trigger first question from orchestrator
      await callOrchestrator();
    } catch (error) {
      console.error("Failed to start conversation:", error);
      toast.error("Failed to connect. Please check microphone permissions.");
    } finally {
      setIsConnecting(false);
    }
  }, [scribe, callOrchestrator]);

  const handleEndInterview = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;

    // Stop audio and STT
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    scribe.disconnect();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    toast.success("Great work! Processing results...");

    // Update interview status
    if (id) {
      await supabase
        .from("interviews")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", id);

      // Generate AI report
      toast.info("Generating your AI report...");
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: reportErr } = await supabase.functions.invoke("generate-report", {
          body: { interviewId: id, userId: user.id },
        });
        if (reportErr) {
          console.error("Report generation failed:", reportErr);
          toast.error("Report generation failed. You can retry from the dashboard.");
        }
      }
    }

    navigate(`/report/${id || "demo"}`);
  }, [scribe, navigate, id]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
    toast.info(isMuted ? "Microphone unmuted" : "Microphone muted");
  }, [isMuted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-screen flex-col bg-ink text-foreground">
      <InterviewTopBar
        timeLeft={timeLeft}
        formatTime={formatTime}
        interviewStarted={interviewStarted}
        onEnd={handleEndInterview}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-4">
        {!interviewStarted ? (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-primary/20">
              <Mic className="h-16 w-16 text-primary" />
            </div>
            <h1 className="font-heading text-3xl font-bold text-primary-foreground">
              Ready for your interview?
            </h1>
            {interviewData && (
              <p className="text-sm font-medium text-primary">
                {interviewData.role} · {interviewData.level}
              </p>
            )}
            <p className="max-w-md text-sm text-primary-foreground/60">
              This is a voice-only interview powered by advanced AI. The interviewer will adapt
              questions based on your answers, just like a real interview.
              {interviewData && " Your CV has been shared with the interviewer."}
            </p>
            <button
              onClick={startConversation}
              disabled={isConnecting}
              className="neo-btn bg-primary px-8 py-4 text-lg font-bold text-primary-foreground disabled:opacity-50"
            >
              {isConnecting ? "Connecting..." : "Join Interview"}
            </button>
          </div>
        ) : (
          <div className="flex w-full max-w-4xl flex-1 flex-col items-center gap-6">
            {/* Phase indicator */}
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-foreground/20 bg-foreground/10 px-3 py-1 text-xs font-semibold text-primary-foreground/70">
                {PHASE_LABELS[currentPhase] || currentPhase} · Q{questionCount}
              </span>
              {processing && (
                <span className="text-xs text-primary-foreground/50 animate-pulse">
                  Thinking...
                </span>
              )}
            </div>

            {/* Participant cards */}
            <div className="flex flex-1 items-center justify-center gap-8">
              {/* AI interviewer card */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className={`relative flex h-40 w-40 items-center justify-center rounded-full transition-all duration-300 ${
                    aiSpeaking
                      ? "bg-primary/30 ring-4 ring-primary ring-offset-4 ring-offset-ink"
                      : "bg-foreground/10"
                  }`}
                >
                  <span className="text-5xl">🤖</span>
                  {aiSpeaking && <VoiceVisualizer isActive={true} color="primary" />}
                </div>
                <div className="text-center">
                  <p className="font-heading text-sm font-bold text-primary-foreground">
                    AI Interviewer
                  </p>
                  <p className="text-xs text-primary-foreground/50">
                    {aiSpeaking ? "Speaking..." : processing ? "Thinking..." : "Listening"}
                  </p>
                </div>
              </div>

              {/* User card */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className={`relative flex h-40 w-40 items-center justify-center rounded-full transition-all duration-300 ${
                    !aiSpeaking && !isMuted && !processing
                      ? "bg-accent/30 ring-4 ring-accent ring-offset-4 ring-offset-ink"
                      : "bg-foreground/10"
                  }`}
                >
                  <span className="text-5xl">👤</span>
                  {!aiSpeaking && !isMuted && !processing && (
                    <VoiceVisualizer isActive={true} color="accent" />
                  )}
                </div>
                <div className="text-center">
                  <p className="font-heading text-sm font-bold text-primary-foreground">You</p>
                  <p className="text-xs text-primary-foreground/50">
                    {isMuted ? "Muted" : aiSpeaking ? "Waiting..." : processing ? "Waiting..." : "Your turn"}
                  </p>
                </div>
              </div>
            </div>

            {/* Live transcript */}
            <div className="w-full max-w-2xl rounded-xl bg-foreground/5 p-4">
              <div className="max-h-32 overflow-y-auto">
                {transcript.length === 0 ? (
                  <p className="text-center text-xs text-primary-foreground/40">
                    Live captions will appear here...
                  </p>
                ) : (
                  transcript.slice(-4).map((t, i) => (
                    <p key={i} className="mb-1 text-xs text-primary-foreground/70">
                      <span className="font-bold text-primary-foreground/90">
                        {t.role === "ai" ? "🤖 " : "You: "}
                      </span>
                      {t.text}
                    </p>
                  ))
                )}
                {userSpeechBuffer.current && (
                  <p className="mb-1 text-xs text-primary-foreground/40 italic">
                    You: {userSpeechBuffer.current}...
                  </p>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {interviewStarted && (
        <div className="flex items-center justify-center gap-4 border-t border-foreground/10 py-5">
          <button
            onClick={toggleMute}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
              isMuted
                ? "bg-destructive text-destructive-foreground"
                : "bg-foreground/10 text-primary-foreground hover:bg-foreground/20"
            }`}
          >
            {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
          <button
            onClick={handleEndInterview}
            className="flex h-14 w-20 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
};

export default LiveInterview;
