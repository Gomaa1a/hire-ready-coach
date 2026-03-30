import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, PhoneOff, User, CheckCircle2, Lightbulb, Video, VideoOff, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInterview } from "@/hooks/useRealtimeInterview";
import { useSpeechAnalytics } from "@/hooks/useSpeechAnalytics";
import { generatePersona, type InterviewerPersona } from "@/components/interview/InterviewerPersona";

type Phase = "pre-join" | "lobby" | "active" | "debrief";

const LiveInterview = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [interviewData, setInterviewData] = useState<{ role: string; level: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [phase, setPhase] = useState<Phase>("pre-join");
  const [persona, setPersona] = useState<InterviewerPersona | null>(null);
  const [lobbyCountdown, setLobbyCountdown] = useState(5);
  const [preparing, setPreparing] = useState(false);
  const [coachingTip, setCoachingTip] = useState<string | null>(null);
  const [showWebcam, setShowWebcam] = useState(true);
  const [isTakingNotes, setIsTakingNotes] = useState(false);
  const endingRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const webcamRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const {
    startSession,
    endSession,
    isConnected,
    isAISpeaking,
    conversationLog,
    connectionStatus,
    getStream,
  } = useRealtimeInterview();

  const analytics = useSpeechAnalytics(conversationLog);

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

  // Start webcam when active
  useEffect(() => {
    if (phase === "active" && showWebcam) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: 160, height: 160, facingMode: "user" } })
        .then((stream) => {
          webcamStreamRef.current = stream;
          if (webcamRef.current) {
            webcamRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          // webcam not available, hide silently
          setShowWebcam(false);
        });
    }
    return () => {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        webcamStreamRef.current = null;
      }
    };
  }, [phase, showWebcam]);

  // "Taking notes" state — show between user finishing and AI starting
  useEffect(() => {
    if (conversationLog.length === 0) return;
    const lastEntry = conversationLog[conversationLog.length - 1];
    if (lastEntry.role === "user" && !isAISpeaking) {
      setIsTakingNotes(true);
      const timeout = setTimeout(() => setIsTakingNotes(false), 3000);
      return () => clearTimeout(timeout);
    } else {
      setIsTakingNotes(false);
    }
  }, [conversationLog, isAISpeaking]);

  // Clear taking notes when AI starts speaking
  useEffect(() => {
    if (isAISpeaking) setIsTakingNotes(false);
  }, [isAISpeaking]);

  // Timer (only in active phase)
  useEffect(() => {
    if (phase !== "active" || !isConnected) return;
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
  }, [phase, isConnected]);

  // Lobby countdown
  useEffect(() => {
    if (phase !== "lobby") return;
    const timer = setInterval(() => {
      setLobbyCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase("active");
          startTimeRef.current = Date.now();
          if (id) {
            startSession(id, undefined, persona ? { name: persona.name, title: persona.title, company: persona.company } : undefined).catch((err) => {
              console.error("Failed to start session:", err);
              toast.error("Connection failed. Please try again.");
              setPhase("pre-join");
            });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, id, startSession]);

  const handleStart = useCallback(async () => {
    if (!id) return;
    setPreparing(true);

    try {
      const p = generatePersona(interviewData?.role);
      setPersona(p);

      toast.info("Preparing your interview...");
      const { error: qbErr } = await supabase.functions.invoke("generate-question-bank", {
        body: { interviewId: id },
      });
      if (qbErr) throw new Error("Failed to prepare interview");

      setLobbyCountdown(5);
      setPhase("lobby");

      supabase.functions.invoke("pre-interview-coach", {
        body: { interviewId: id },
      }).then(({ data }) => {
        if (data?.coachingTip) setCoachingTip(data.coachingTip);
      }).catch(() => {});
    } catch (err: any) {
      console.error("Failed to start:", err);
      toast.error("Failed to prepare. Please try again.");
    } finally {
      setPreparing(false);
    }
  }, [id, interviewData, startSession]);

  const handleEndInterview = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;

    // Stop webcam
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }

    await endSession();
    setPhase("debrief");

    if (id) {
      try {
        await supabase
          .from("interviews")
          .update({ status: "completed", ended_at: new Date().toISOString() })
          .eq("id", id);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          supabase.functions
            .invoke("generate-report", { body: { interviewId: id } })
            .then(({ error }) => {
              if (error) console.error("Report generation failed:", error);
            });
        }
      } catch (e) {
        console.error("End interview error:", e);
      }
    }

    setTimeout(() => {
      navigate(`/report/${id || "demo"}`);
    }, 4000);
  }, [endSession, navigate, id]);

  const toggleMute = useCallback(() => {
    const stream = getStream();
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      const newMuted = !isMuted;
      audioTracks.forEach((track) => {
        track.enabled = !newMuted;
      });
      setIsMuted(newMuted);
      toast.info(newMuted ? "Microphone muted" : "Microphone unmuted");
    }
  }, [getStream, isMuted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getInterviewDuration = () => {
    if (!startTimeRef.current) return "0:00";
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const topicsDiscussed = conversationLog.filter((e) => e.role === "user").length;

  const pct = timeLeft / 900;
  const timerColor = pct > 0.4 ? "text-green-400" : pct > 0.15 ? "text-amber-400" : "text-red-400";

  // Speech analytics badge colors
  const fillerColor = analytics.fillerRate === "high" ? "text-red-400 bg-red-500/10" : analytics.fillerRate === "moderate" ? "text-amber-400 bg-amber-500/10" : "text-green-400 bg-green-500/10";
  const paceColor = analytics.paceStatus === "fast" ? "text-amber-400 bg-amber-500/10" : analytics.paceStatus === "slow" ? "text-blue-400 bg-blue-500/10" : "text-green-400 bg-green-500/10";

  // Interviewer status text
  const getInterviewerStatus = () => {
    if (isAISpeaking) return "Speaking";
    if (isTakingNotes) return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-amber-400/70">✍️ Taking notes</span>
        <span className="flex gap-0.5">
          <span className="h-1 w-1 rounded-full bg-amber-400/50 animate-bounce" style={{ animationDelay: "0s" }} />
          <span className="h-1 w-1 rounded-full bg-amber-400/50 animate-bounce" style={{ animationDelay: "0.15s" }} />
          <span className="h-1 w-1 rounded-full bg-amber-400/50 animate-bounce" style={{ animationDelay: "0.3s" }} />
        </span>
      </span>
    );
    if (connectionStatus === "connecting") return (
      <span className="inline-flex items-center gap-1">
        Connecting
        <span className="flex gap-0.5">
          <span className="h-1 w-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0s" }} />
          <span className="h-1 w-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0.15s" }} />
          <span className="h-1 w-1 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0.3s" }} />
        </span>
      </span>
    );
    return "Listening";
  };

  // ===== PHASE 1: PRE-JOIN =====
  if (phase === "pre-join") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
        <div className="flex flex-col items-center gap-6 text-center max-w-lg animate-fade-in">
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
            listens, responds, and adapts just like a real conversation.
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

  // ===== PHASE 2: WAITING ROOM LOBBY =====
  if (phase === "lobby") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
        <div className="flex flex-col items-center gap-8 text-center max-w-md animate-fade-in">
          {persona && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-indigo-500/30 border border-white/10">
                  <span className="text-2xl font-bold text-white/80">{persona.initials}</span>
                </div>
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-green-500 border-2 border-[#0a0a0a]" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{persona.name}</p>
                <p className="text-sm text-white/50">{persona.title}</p>
                <p className="text-xs text-blue-400/70 mt-0.5">{persona.company}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-white/40">Your interviewer is joining in</p>
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-blue-500/40 bg-blue-500/10">
              <span className="text-2xl font-bold text-blue-400 tabular-nums">{lobbyCountdown}</span>
            </div>
          </div>

          {coachingTip ? (
            <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/20 px-6 py-4 text-left animate-fade-in">
              <p className="text-xs font-medium text-blue-400/70 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5" /> Coach says
              </p>
              <p className="text-sm text-white/70 leading-relaxed">{coachingTip}</p>
            </div>
          ) : (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-6 py-4 text-left">
              <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-2">Quick tips</p>
              <ul className="space-y-1.5 text-sm text-white/50">
                <li>• Speak clearly and at a natural pace</li>
                <li>• Take a moment to think before answering</li>
                <li>• It's okay to ask for clarification</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== PHASE 4: DEBRIEF =====
  if (phase === "debrief") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
        <div className="flex flex-col items-center gap-6 text-center max-w-md animate-fade-in">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/15 border border-green-500/30">
            <CheckCircle2 className="h-10 w-10 text-green-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">Interview Complete</h1>
            <p className="mt-2 text-sm text-white/50">Great work! Let's see how you did.</p>
          </div>

          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-white tabular-nums">{getInterviewDuration()}</p>
              <p className="text-xs text-white/40 mt-1">Duration</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <p className="text-2xl font-bold text-white tabular-nums">{topicsDiscussed}</p>
              <p className="text-xs text-white/40 mt-1">Responses</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <p className={`text-2xl font-bold tabular-nums ${analytics.fillerRate === "high" ? "text-red-400" : analytics.fillerRate === "moderate" ? "text-amber-400" : "text-green-400"}`}>
                {analytics.fillerCount}
              </p>
              <p className="text-xs text-white/40 mt-1">Fillers</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-400" />
            <span className="text-sm text-white/40">Generating your report…</span>
          </div>
        </div>
      </div>
    );
  }

  // ===== PHASE 3: ACTIVE INTERVIEW =====
  return (
    <div className="relative flex h-screen flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Top overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className={`text-lg font-bold tabular-nums ${timerColor}`}>
            {formatTime(timeLeft)}
          </span>
        </div>

        {/* Speech analytics bar */}
        {analytics.totalWords > 10 && (
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${fillerColor}`}>
              {analytics.fillerRate === "high" && <AlertTriangle className="h-3 w-3" />}
              {analytics.fillerCount} fillers
            </div>
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${paceColor}`}>
              {analytics.wordsPerMinute} wpm
            </div>
          </div>
        )}

        {interviewData && (
          <div className="flex items-center gap-2 rounded-full bg-white/5 backdrop-blur-sm px-3 py-1.5">
            <span className="text-xs font-medium text-white/70">
              {interviewData.role}
            </span>
          </div>
        )}
      </div>

      {/* Center: Interviewer Avatar */}
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            {isAISpeaking && (
              <>
                <div
                  className="absolute inset-0 -m-4 animate-ping rounded-full bg-blue-500/15"
                  style={{ animationDuration: "1.5s" }}
                />
                <div
                  className="absolute inset-0 -m-8 animate-ping rounded-full bg-blue-500/[0.08]"
                  style={{ animationDuration: "2s" }}
                />
              </>
            )}

            <div
              className={`relative flex h-36 w-36 items-center justify-center rounded-full transition-all duration-500 ${
                isAISpeaking
                  ? "bg-blue-500/20 ring-2 ring-blue-500/60 shadow-[0_0_60px_rgba(59,130,246,0.3)]"
                  : isTakingNotes
                  ? "bg-amber-500/10 ring-1 ring-amber-500/30"
                  : "bg-white/5"
              }`}
            >
              {persona ? (
                <span className="text-3xl font-bold text-white/60">{persona.initials}</span>
              ) : (
                <User className="h-16 w-16 text-white/50" />
              )}

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
            <p className="text-sm font-semibold text-white">
              {persona ? persona.name : "AI Interviewer"}
            </p>
            {persona && (
              <p className="text-xs text-white/30 mt-0.5">{persona.title}</p>
            )}
            <p className="mt-1 text-xs text-white/40">
              {getInterviewerStatus()}
            </p>
          </div>
        </div>
      </div>

      {/* Webcam self-view (bottom-right) */}
      {showWebcam && phase === "active" && (
        <div className="absolute bottom-24 right-5 z-30">
          <div className="relative">
            <video
              ref={webcamRef}
              autoPlay
              muted
              playsInline
              className="h-[120px] w-[120px] rounded-full object-cover border-2 border-white/20 shadow-lg shadow-black/50"
              style={{ transform: "scaleX(-1)" }}
            />
            <button
              onClick={() => {
                setShowWebcam(false);
                if (webcamStreamRef.current) {
                  webcamStreamRef.current.getTracks().forEach((t) => t.stop());
                  webcamStreamRef.current = null;
                }
              }}
              className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-white/60 hover:text-white transition-colors"
            >
              <VideoOff className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Show webcam button when hidden */}
      {!showWebcam && phase === "active" && (
        <button
          onClick={() => setShowWebcam(true)}
          className="absolute bottom-24 right-5 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/40 hover:text-white hover:bg-white/20 transition-all"
        >
          <Video className="h-4 w-4" />
        </button>
      )}

      {/* Bottom: Transcript + Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-4 pb-6">
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
                    {entry.role === "assistant" ? (persona?.name.split(" ")[0] || "Interviewer") : "You"}
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
