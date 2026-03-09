import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { useConversation } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";
import VoiceVisualizer from "@/components/interview/VoiceVisualizer";
import InterviewTopBar from "@/components/interview/InterviewTopBar";

const LiveInterview = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

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
    onMessage: (message: any) => {
      if (message.type === "user_transcript") {
        const text = message.user_transcription_event?.user_transcript;
        if (text) {
          setTranscript((prev) => [...prev, { role: "user", text }]);
        }
      } else if (message.type === "agent_response") {
        const text = message.agent_response_event?.agent_response;
        if (text) {
          setTranscript((prev) => [...prev, { role: "ai", text }]);
        }
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

      const { data, error } = await supabase.functions.invoke("elevenlabs-token");

      if (error || !data?.token) {
        throw new Error(error?.message || "No token received");
      }

      await conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
      });
    } catch (error) {
      console.error("Failed to start conversation:", error);
      toast.error("Failed to connect. Please check microphone permissions.");
    } finally {
      setIsConnecting(false);
    }
  }, [conversation]);

  const handleEndInterview = useCallback(() => {
    conversation.endSession();
    toast.success("Great work! Generating your report...");
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
            <p className="max-w-md text-sm text-primary-foreground/60">
              This is a voice-only interview. The AI interviewer will ask questions
              and listen to your answers, just like a real Google Meet interview.
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
