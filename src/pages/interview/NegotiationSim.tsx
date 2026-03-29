import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, PhoneOff, User, DollarSign, Award, TrendingUp, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInterview } from "@/hooks/useRealtimeInterview";
import { generatePersona, type InterviewerPersona } from "@/components/interview/InterviewerPersona";

type Phase = "connecting" | "active" | "scoring" | "results";

interface NegotiationScores {
  assertiveness_score: number;
  professionalism_score: number;
  outcome: string;
  tips: string[];
}

const NegotiationSim = () => {
  const navigate = useNavigate();
  const { interviewId } = useParams();
  const [phase, setPhase] = useState<Phase>("connecting");
  const [persona, setPersona] = useState<InterviewerPersona | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [scores, setScores] = useState<NegotiationScores | null>(null);
  const [interviewData, setInterviewData] = useState<{ role: string; level: string } | null>(null);
  const endingRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    startSession,
    endSession,
    isConnected,
    isAISpeaking,
    conversationLog,
    connectionStatus,
    getStream,
  } = useRealtimeInterview();

  // Load interview data and start
  useEffect(() => {
    if (!interviewId) return;
    const init = async () => {
      const { data } = await supabase
        .from("interviews")
        .select("role, level")
        .eq("id", interviewId)
        .single();

      if (data) {
        setInterviewData(data);
        // Generate HR persona
        const p = generatePersona("hr");
        // Override with HR-specific name
        p.title = ["HR Director", "VP of People", "Compensation Manager", "Head of Talent"][Math.floor(Math.random() * 4)];
        setPersona(p);

        try {
          const { data: tokenData, error } = await supabase.functions.invoke("negotiation-session-token", {
            body: { interviewId },
          });
          if (error || !tokenData?.ephemeralToken) throw new Error("Failed to get session token");

          // Start the WebRTC session with the negotiation token
          await startSession(interviewId, tokenData.ephemeralToken);
          setPhase("active");
        } catch (err) {
          console.error("Failed to start negotiation:", err);
          toast.error("Failed to start negotiation session.");
          navigate(`/report/${interviewId}`);
        }
      }
    };
    init();
  }, [interviewId]);

  // Timer
  useEffect(() => {
    if (phase !== "active" || !isConnected) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, isConnected]);

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationLog]);

  const handleEnd = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;

    await endSession();
    setPhase("scoring");

    // Build transcript from conversation log
    const transcript = conversationLog
      .map((e) => `${e.role === "assistant" ? "HR Manager" : "Candidate"}: ${e.text}`)
      .join("\n");

    try {
      const { data, error } = await supabase.functions.invoke("score-negotiation", {
        body: {
          transcript,
          role: interviewData?.role || "Unknown",
          level: interviewData?.level || "Unknown",
        },
      });

      if (error || !data) throw new Error("Scoring failed");

      setScores(data);

      // Save to database
      const { data: { user } } = await supabase.auth.getUser();
      if (user && interviewId) {
        await supabase.from("negotiation_sessions").insert({
          interview_id: interviewId,
          user_id: user.id,
          ended_at: new Date().toISOString(),
          assertiveness_score: data.assertiveness_score,
          professionalism_score: data.professionalism_score,
          outcome: data.outcome,
          tips: data.tips,
        });
      }

      setPhase("results");
    } catch (e) {
      console.error("Scoring error:", e);
      toast.error("Failed to score negotiation");
      setPhase("results");
      setScores({
        assertiveness_score: 0,
        professionalism_score: 0,
        outcome: "unknown",
        tips: ["Session could not be scored. Please try again."],
      });
    }
  }, [endSession, conversationLog, interviewData, interviewId]);

  const toggleMute = useCallback(() => {
    const stream = getStream();
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      const newMuted = !isMuted;
      audioTracks.forEach((track) => { track.enabled = !newMuted; });
      setIsMuted(newMuted);
    }
  }, [getStream, isMuted]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const getOutcomeColor = (outcome: string) => {
    if (outcome === "excellent") return "text-green-400";
    if (outcome === "good") return "text-blue-400";
    if (outcome === "fair") return "text-amber-400";
    return "text-red-400";
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-blue-400";
    return "text-amber-400";
  };

  // ===== CONNECTING =====
  if (phase === "connecting") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-400" />
          <p className="text-white/60">Connecting to HR Manager...</p>
        </div>
      </div>
    );
  }

  // ===== SCORING =====
  if (phase === "scoring") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-400" />
          <p className="text-white/60">Analyzing your negotiation performance...</p>
        </div>
      </div>
    );
  }

  // ===== RESULTS =====
  if (phase === "results" && scores) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4">
        <div className="flex flex-col items-center gap-8 max-w-md w-full animate-fade-in">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/15 border border-blue-500/30">
              <DollarSign className="h-8 w-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Negotiation Results</h1>
            <p className={`text-lg font-semibold capitalize ${getOutcomeColor(scores.outcome)}`}>
              {scores.outcome}
            </p>
          </div>

          {/* Scores */}
          <div className="w-full grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-5 text-center">
              <Award className="h-5 w-5 text-blue-400 mx-auto mb-2" />
              <p className={`text-3xl font-bold ${getScoreColor(scores.assertiveness_score)}`}>
                {scores.assertiveness_score}
              </p>
              <p className="text-xs text-white/40 mt-1">Assertiveness</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-5 text-center">
              <TrendingUp className="h-5 w-5 text-green-400 mx-auto mb-2" />
              <p className={`text-3xl font-bold ${getScoreColor(scores.professionalism_score)}`}>
                {scores.professionalism_score}
              </p>
              <p className="text-xs text-white/40 mt-1">Professionalism</p>
            </div>
          </div>

          {/* Tips */}
          <div className="w-full rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
            <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3">Improvement Tips</p>
            <ul className="space-y-2">
              {scores.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                  <span className="text-blue-400 mt-0.5">→</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => navigate(`/report/${interviewId}`)}
            className="flex items-center gap-2 rounded-full bg-blue-500 px-6 py-3 text-sm font-bold text-white hover:bg-blue-600 transition-all"
          >
            Back to Report <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ===== ACTIVE NEGOTIATION =====
  const pct = timeLeft / 300;
  const timerColor = pct > 0.4 ? "text-green-400" : pct > 0.15 ? "text-amber-400" : "text-red-400";

  return (
    <div className="relative flex h-screen flex-col bg-[#0a0a0a] overflow-hidden">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className={`text-lg font-bold tabular-nums ${timerColor}`}>{formatTime(timeLeft)}</span>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-amber-500/10 backdrop-blur-sm px-3 py-1.5">
          <DollarSign className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-medium text-amber-300">Salary Negotiation</span>
        </div>
      </div>

      {/* Center Avatar */}
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            {isAISpeaking && (
              <>
                <div className="absolute inset-0 -m-4 animate-ping rounded-full bg-amber-500/15" style={{ animationDuration: "1.5s" }} />
                <div className="absolute inset-0 -m-8 animate-ping rounded-full bg-amber-500/[0.08]" style={{ animationDuration: "2s" }} />
              </>
            )}
            <div className={`relative flex h-36 w-36 items-center justify-center rounded-full transition-all duration-500 ${
              isAISpeaking
                ? "bg-amber-500/20 ring-2 ring-amber-500/60 shadow-[0_0_60px_rgba(245,158,11,0.3)]"
                : "bg-white/5"
            }`}>
              {persona ? (
                <span className="text-3xl font-bold text-white/60">{persona.initials}</span>
              ) : (
                <User className="h-16 w-16 text-white/50" />
              )}
              {isAISpeaking && (
                <div className="absolute -bottom-5 flex items-end gap-[3px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-[3px] rounded-full bg-amber-400 animate-pulse"
                      style={{ height: `${10 + Math.random() * 14}px`, animationDelay: `${i * 0.1}s`, animationDuration: "0.4s" }} />
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white">{persona?.name || "HR Manager"}</p>
            {persona && <p className="text-xs text-white/30 mt-0.5">{persona.title}</p>}
            <p className="mt-1 text-xs text-white/40">{isAISpeaking ? "Speaking" : "Listening"}</p>
          </div>
        </div>
      </div>

      {/* Transcript + Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-4 pb-6">
        <div className="mx-4 w-full max-w-xl max-h-32 overflow-y-auto">
          {conversationLog.length > 0 ? (
            <div className="space-y-2 px-2">
              {conversationLog.slice(-4).map((entry, i) => (
                <div key={i} className={`rounded-lg px-4 py-2 text-sm ${
                  entry.role === "assistant" ? "bg-white/5 text-white/80" : "bg-amber-500/10 text-amber-200/80"
                }`}>
                  <span className="font-semibold text-xs uppercase tracking-wider mr-2 opacity-60">
                    {entry.role === "assistant" ? (persona?.name.split(" ")[0] || "HR") : "You"}
                  </span>
                  {entry.text}
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          ) : (
            <div className="rounded-xl bg-white/5 px-5 py-3">
              <p className="text-xs text-white/30 text-center">Negotiation will begin shortly...</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              isMuted ? "bg-red-500/90 text-white" : "bg-white/10 text-white hover:bg-white/20"
            }`}>
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button onClick={handleEnd}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white transition-all hover:bg-red-600 hover:scale-105">
            <PhoneOff className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default NegotiationSim;
