import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "ai" | "user";
  content: string;
}

interface Scores {
  communication: number;
  technical: number;
  confidence: number;
  structure: number;
  clarity: number;
  impact: number;
}

const initialMessages: Message[] = [
  {
    id: "1",
    role: "ai",
    content:
      "Hello! I'm your AI interviewer for this Software Engineer position. Let's get started. Tell me about yourself and what makes you interested in this role.",
  },
];

const LiveInterview = () => {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes
  const [isRecording, setIsRecording] = useState(false);
  const [scores, setScores] = useState<Scores>({
    communication: 65,
    technical: 60,
    confidence: 55,
    structure: 58,
    clarity: 62,
    impact: 50,
  });

  // Timer
  useEffect(() => {
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
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getTimerColor = () => {
    const pct = timeLeft / 900;
    if (pct > 0.4) return "text-success";
    if (pct > 0.15) return "text-coral";
    return "text-destructive";
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-success";
    if (score >= 60) return "bg-primary";
    return "bg-coral";
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response and score update
    setTimeout(() => {
      const aiResponses = [
        "Interesting. Can you give me a specific example with measurable outcomes?",
        "🔥 That's a bit vague. What were the actual metrics or KPIs you impacted?",
        "Good answer. Now, walk me through a time when you faced a technical challenge you couldn't solve immediately. How did you approach it?",
        "Tell me about a conflict you had with a teammate. How did you resolve it?",
        "What's your biggest weakness, and what are you doing to improve it?",
      ];
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: aiResponses[Math.floor(Math.random() * aiResponses.length)],
      };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);

      // Update scores randomly for demo
      setScores((prev) => ({
        communication: Math.min(100, prev.communication + Math.floor(Math.random() * 8) - 2),
        technical: Math.min(100, prev.technical + Math.floor(Math.random() * 8) - 2),
        confidence: Math.min(100, prev.confidence + Math.floor(Math.random() * 8) - 2),
        structure: Math.min(100, prev.structure + Math.floor(Math.random() * 8) - 2),
        clarity: Math.min(100, prev.clarity + Math.floor(Math.random() * 8) - 2),
        impact: Math.min(100, prev.impact + Math.floor(Math.random() * 8) - 2),
      }));
    }, 2000);
  };

  const handleEndInterview = () => {
    toast.success("Great work! Generating your report...");
    navigate("/report/demo");
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      toast.info("Voice recording started (demo mode)");
    } else {
      toast.info("Voice recording stopped");
    }
  };

  const exchanges = messages.filter((m) => m.role === "user").length;

  return (
    <div className="flex h-screen flex-col bg-ink text-primary-foreground">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 animate-blink rounded-full bg-success" />
          <span className="font-heading text-sm font-bold">HireReady AI</span>
          <span className="neo-badge border-foreground/20 bg-foreground/10 text-xs">
            Software Engineer • Junior
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className={`font-heading text-xl font-bold ${getTimerColor()}`}>{formatTime(timeLeft)}</span>
          <button onClick={handleEndInterview} className="neo-btn bg-coral text-coral-foreground text-sm">
            End Interview
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl p-4 ${
                    msg.role === "user"
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm bg-foreground/10"
                  }`}
                >
                  {msg.role === "ai" && (
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-lg">🤖</span>
                      <span className="font-heading text-[10px] font-bold uppercase text-primary">AI Interviewer</span>
                    </div>
                  )}
                  <p className="text-sm">{msg.content}</p>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="mb-4 flex justify-start">
                <div className="rounded-2xl rounded-tl-sm bg-foreground/10 p-4">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-foreground/10 p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleRecording}
                className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors ${
                  isRecording ? "border-coral bg-coral/20 text-coral" : "border-primary bg-primary text-primary-foreground"
                }`}
              >
                {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type your answer..."
                className="flex-1 rounded-xl border-2 border-foreground/20 bg-transparent px-4 py-3 text-sm placeholder:text-foreground/40 focus:border-primary focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="neo-btn bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Score sidebar */}
        <div className="hidden w-56 border-l border-foreground/10 p-4 md:block">
          <h3 className="mb-4 font-heading text-sm font-bold uppercase text-foreground/60">Live Scores</h3>
          <div className="space-y-4">
            {Object.entries(scores).map(([key, value]) => (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="capitalize">{key}</span>
                  <span className="font-bold">{value}</span>
                </div>
                <div className="h-2 rounded-full bg-foreground/10">
                  <div
                    className={`h-full rounded-full transition-all ${getScoreColor(value)}`}
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-foreground/10 pt-4">
            <div className="text-center">
              <div className="font-heading text-2xl font-bold">{exchanges}</div>
              <div className="text-xs text-foreground/60">Exchanges</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveInterview;
