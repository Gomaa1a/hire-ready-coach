import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { useConversation } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
import VoiceVisualizer from "@/components/interview/VoiceVisualizer";
import InterviewTopBar from "@/components/interview/InterviewTopBar";

type TranscriptEntry = { role: "ai" | "user"; text: string };

const parseTranscriptMessage = (payload: unknown): TranscriptEntry | null => {
  if (!payload) return null;

  if (typeof payload === "string") {
    const text = payload.trim();
    return text ? { role: "ai", text } : null;
  }

  if (typeof payload !== "object") return null;

  const data = payload as Record<string, unknown>;
  const nested =
    data.message && typeof data.message === "object"
      ? (data.message as Record<string, unknown>)
      : null;

  const textCandidate =
    data.message ?? data.text ?? data.content ?? nested?.message ?? nested?.text ?? nested?.content;

  if (typeof textCandidate !== "string" || !textCandidate.trim()) return null;

  const roleCandidate = data.role ?? data.source ?? nested?.role ?? nested?.source;
  const role =
    roleCandidate === "agent" || roleCandidate === "ai" ? "ai" : "user";

  return { role, text: textCandidate.trim() };
};

const LiveInterview = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const [interviewData, setInterviewData] = useState<{ role: string; level: string } | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);

  // Fetch interview details on mount
  useEffect(() => {
    if (!id) return;
    const fetchInterview = async () => {
      const { data } = await supabase
        .from("interviews")
        .select("role, level")
        .eq("id", id)
        .single();
      if (data) setInterviewData(data);
    };
    fetchInterview();
  }, [id]);

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to AI interviewer");
      setInterviewStarted(true);
      toast.success("Connected! The interviewer will begin shortly.");
    },
    onDisconnect: () => {
      console.log("Disconnected from AI interviewer");
      if (interviewStarted) {
        handleEndInterview();
      }
    },
    onMessage: (props: { message: string; source: string }) => {
      const { message, source } = props;
      if (message) {
        const entry = { role: source === "ai" ? "ai" : "user", text: message };
        setTranscript((prev) => {
          const next = [...prev, entry];
          transcriptRef.current = next;
          return next;
        });
      }
    },
    onError: (error) => {
      console.error("Conversation error:", error);
      toast.error("Connection error. Please try again.");
    },
  });

  // Timer
  useEffect(() => {
    if (!interviewStarted) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          conversation.endSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [interviewStarted]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const startConversation = useCallback(async () => {
    setIsConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const { data, error } = await supabase.functions.invoke("elevenlabs-token", {
        body: { interviewId: id },
      });

      if (error || !data?.token) {
        throw new Error(error?.message || "No token received");
      }

      // Use WebRTC with conversation token (recommended for best audio quality)
      await conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
      });

      // Send CV context as a contextual update (doesn't replace agent prompt)
      if (data.cvContext) {
        conversation.sendContextualUpdate(data.cvContext);
      }
    } catch (error) {
      console.error("Failed to start conversation:", error);
      toast.error("Failed to connect. Please check microphone permissions.");
    } finally {
      setIsConnecting(false);
    }
  }, [conversation]);

  const handleEndInterview = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    conversation.endSession();
    toast.success("Great work! Saving transcript...");

    const currentTranscript = transcriptRef.current;

    // Save transcript to messages table
    if (id && currentTranscript.length > 0) {
      try {
        const msgs = currentTranscript.map((t) => ({
          interview_id: id,
          role: t.role === "ai" ? "assistant" : "user",
          content: t.text,
        }));
        const { error } = await supabase.from("messages").insert(msgs);
        if (error) console.error("Failed to save transcript:", error);
      } catch (err) {
        console.error("Error saving transcript:", err);
      }
    }

    // Update interview status to completed
    if (id) {
      await supabase
        .from("interviews")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", id);

      // Generate AI report only if we have transcript
      if (currentTranscript.length > 0) {
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
    }

    navigate(`/report/${id || "demo"}`);
  }, [conversation, navigate, id]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
    // Note: ElevenLabs SDK handles muting internally
    toast.info(isMuted ? "Microphone unmuted" : "Microphone muted");
  }, [isMuted]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-screen flex-col bg-ink text-foreground">
      {/* Top bar */}
      <InterviewTopBar
        timeLeft={timeLeft}
        formatTime={formatTime}
        interviewStarted={interviewStarted}
        onEnd={handleEndInterview}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-4">
        {!interviewStarted ? (
          /* Pre-call screen */
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
              This is a voice-only interview. The AI interviewer will ask questions
              and listen to your answers, just like a real Google Meet interview.
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
          /* Active call screen */
          <div className="flex w-full max-w-4xl flex-1 flex-col items-center gap-6">
            {/* Participant cards */}
            <div className="flex flex-1 items-center justify-center gap-8">
              {/* AI interviewer card */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className={`relative flex h-40 w-40 items-center justify-center rounded-full transition-all duration-300 ${
                    conversation.isSpeaking
                      ? "bg-primary/30 ring-4 ring-primary ring-offset-4 ring-offset-ink"
                      : "bg-foreground/10"
                  }`}
                >
                  <span className="text-5xl">🤖</span>
                  {conversation.isSpeaking && (
                    <VoiceVisualizer isActive={true} color="primary" />
                  )}
                </div>
                <div className="text-center">
                  <p className="font-heading text-sm font-bold text-primary-foreground">
                    AI Interviewer
                  </p>
                  <p className="text-xs text-primary-foreground/50">
                    {conversation.isSpeaking ? "Speaking..." : "Listening"}
                  </p>
                </div>
              </div>

              {/* User card */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className={`relative flex h-40 w-40 items-center justify-center rounded-full transition-all duration-300 ${
                    !conversation.isSpeaking && !isMuted
                      ? "bg-accent/30 ring-4 ring-accent ring-offset-4 ring-offset-ink"
                      : "bg-foreground/10"
                  }`}
                >
                  <span className="text-5xl">👤</span>
                  {!conversation.isSpeaking && !isMuted && (
                    <VoiceVisualizer isActive={true} color="accent" />
                  )}
                </div>
                <div className="text-center">
                  <p className="font-heading text-sm font-bold text-primary-foreground">
                    You
                  </p>
                  <p className="text-xs text-primary-foreground/50">
                    {isMuted ? "Muted" : conversation.isSpeaking ? "Waiting..." : "Your turn"}
                  </p>
                </div>
              </div>
            </div>

            {/* Live transcript (subtle, bottom area) */}
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
                <div ref={transcriptEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls bar (Google Meet style) */}
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
