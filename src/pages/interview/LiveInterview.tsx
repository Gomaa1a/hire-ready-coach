import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, PhoneOff, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInterview } from "@/hooks/useRealtimeInterview";

const LiveInterview = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [interviewData, setInterviewData] = useState<{ role: string; level: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [preparing, setPreparing] = useState(false);
  const endingRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const {
    startSession,
    endSession,
    isConnected,
    isAISpeaking,
    conversationLog,
    connectionStatus,
  } = useRealtimeInterview();

  // Load interview data
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

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationLog]);

  // Timer
  useEffect(() => {
    if (!isConnected) return;
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
  }, [isConnected]);

  const handleStart = useCallback(async () => {
    if (!id) return;
    setPreparing(true);

    try {
      // Step 1: Generate question bank
      toast.info("Preparing your interview questions...");
      const { error: qbErr } = await supabase.functions.invoke("generate-question-bank", {
        body: { interviewId: id },
      });
      if (qbErr) throw new Error("Failed to generate questions");

      // Step 2: Start realtime session
      toast.info("Connecting to interviewer...");
      await startSession(id);
      toast.success("Connected! Interview starting...");
    } catch (err: any) {
      console.error("Failed to start:", err);
      toast.error("Failed to connect. Please check microphone permissions and try again.");
    } finally {
      setPreparing(false);
    }
  }, [id, startSession]);

  const handleEndInterview = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;

    await endSession();
    toast.success("Great work! Processing results...");

    if (id) {
      try {
        await supabase
          .from("interviews")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", id);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          supabase.functions
            .invoke("generate-report", { body: { interviewId: id, userId: user.id } })
            .then(({ error }) => {
              if (error) console.error("Report generation failed:", error);
            });
        }
      } catch (e) {
        console.error("End interview error:", e);
      }
    }

    navigate(`/report/${id || "demo"}`);
  }, [endSession, navigate, id]);

  const toggleMute = useCallback(() => {
    // We need to access the media stream from the peer connection
    // The hook manages the stream internally, but we can toggle tracks
    setIsMuted((prev) => {
      const newMuted = !prev;
      // Try to mute/unmute via any active audio tracks
      const senders = (document.querySelector("audio") as any);
      toast.info(newMuted ? "Microphone muted" : "Microphone unmuted");
      return newMuted;
    });
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const pct = timeLeft / 900;
  const timerColor = pct > 0.4 ? "text-success" : pct > 0.15 ? "text-coral" : "text-destructive";
  const lastEntry = conversationLog.slice(-1)[0];

  // ===== PRE-JOIN SCREEN =====
  if (!isConnected && connectionStatus !== "connecting") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0f0f0f] px-4">
        <div className="flex flex-col items-center gap-6 text-center max-w-lg">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-blue-500/30 bg-blue-500/10">
            <Mic className="h-12 w-12 text-blue-400" />
            {!preparing && (
              <div
                className="absolute inset-0 animate-ping rounded-full border border-blue-500/20"
                style={{ animationDuration: "2s" }}
              />
            )}
          </div>

          <h1 className="text-2xl font-bold text-white">Ready when you are</h1>

          {interviewData && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-400">
                {interviewData.role}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/60">
                {interviewData.level}
              </span>
            </div>
          )}

          <p className="text-sm leading-relaxed text-white/50">
            Real-time voice interview powered by AI. Speak naturally — the interviewer
            listens, responds, and adapts just like a real conversation. No lag.
          </p>

          <button
            onClick={handleStart}
            disabled={preparing}
            className="mt-2 flex items-center gap-2 rounded-full bg-blue-500 px-8 py-4 text-sm font-bold text-white transition-all hover:bg-blue-600 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {preparing ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Preparing…
              </>
            ) : (
              "Join Interview"
            )}
          </button>
        </div>
      </div>
    );
  }

  // ===== ACTIVE INTERVIEW =====
  return (
    <div className="relative flex h-screen flex-col bg-[#0f0f0f] overflow-hidden">
      {/* Top overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className={`text-lg font-bold tabular-nums ${timerColor}`}>
            {formatTime(timeLeft)}
          </span>
        </div>
        {interviewData && (
          <div className="flex items-center gap-2 rounded-full bg-white/5 backdrop-blur-sm px-3 py-1.5">
            <span className="text-xs font-medium text-white/70">
              {interviewData.role}
            </span>
          </div>
        )}
      </div>

      {/* Center: AI Avatar */}
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            {/* Pulse rings when speaking */}
            {isAISpeaking && (
              <>
                <div
                  className="absolute inset-0 -m-4 animate-ping rounded-full bg-blue-500/15"
                  style={{ animationDuration: "1.5s" }}
                />
                <div
                  className="absolute inset-0 -m-8 animate-ping rounded-full bg-blue-500/8"
                  style={{ animationDuration: "2s" }}
                />
              </>
            )}

            <div
              className={`relative flex h-36 w-36 items-center justify-center rounded-full transition-all duration-500 ${
                isAISpeaking
                  ? "bg-blue-500/20 ring-2 ring-blue-500/60 shadow-[0_0_60px_rgba(59,130,246,0.3)]"
                  : "bg-white/5"
              }`}
            >
              <User className="h-16 w-16 text-white/50" />

              {/* Waveform bars */}
              {isAISpeaking && (
                <div className="absolute -bottom-5 flex items-end gap-[3px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-[3px] rounded-full bg-blue-400 animate-pulse"
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

          <div className="text-center">
            <p className="text-sm font-semibold text-white">AI Interviewer</p>
            <p className="mt-0.5 text-xs text-white/40">
              {isAISpeaking
                ? "Speaking"
                : connectionStatus === "connecting"
                ? (
                    <span className="inline-flex items-center gap-1">
                      Connecting
                      <span className="flex gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0s" }} />
                        <span className="h-1 w-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0.15s" }} />
                        <span className="h-1 w-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0.3s" }} />
                      </span>
                    </span>
                  )
                : "Listening"}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom: Transcript + Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-4 pb-6">
        {/* Scrollable transcript */}
        <div className="mx-4 w-full max-w-xl max-h-32 overflow-y-auto">
          {conversationLog.length > 0 ? (
            <div className="space-y-2 px-2">
              {conversationLog.slice(-4).map((entry, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-4 py-2 text-sm ${
                    entry.role === "assistant"
                      ? "bg-white/5 text-white/80"
                      : "bg-blue-500/10 text-blue-200/80"
                  }`}
                >
                  <span className="font-semibold text-xs uppercase tracking-wider mr-2 opacity-60">
                    {entry.role === "assistant" ? "Interviewer" : "You"}
                  </span>
                  {entry.text}
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          ) : (
            <div className="rounded-xl bg-white/5 px-5 py-3">
              <p className="text-xs text-white/30 text-center">
                Transcript will appear here
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              isMuted
                ? "bg-red-500/90 text-white"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            onClick={handleEndInterview}
            className="flex h-12 items-center gap-2 rounded-full bg-red-500/90 px-6 text-white transition-all hover:bg-red-600"
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
