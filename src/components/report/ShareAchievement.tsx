import { useRef, useState, useCallback } from "react";
import { toPng } from "html-to-image";
import { Download, Linkedin, Copy, Monitor, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import InterviewShareCard from "./InterviewShareCard";

interface ShareAchievementProps {
  userName: string;
  jobTitle: string;
  overallScore: number;
  commScore: number;
  confScore: number;
  strengths: string[];
  reportUrl: string;
}

const ShareAchievement = ({
  userName,
  jobTitle,
  overallScore,
  commScore,
  confScore,
  strengths,
  reportUrl,
}: ShareAchievementProps) => {
  const [format, setFormat] = useState<"landscape" | "portrait">("landscape");
  const [generating, setGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const generateImage = useCallback(async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const w = format === "portrait" ? 1080 : 1200;
      const h = format === "portrait" ? 1920 : 630;
      const dataUrl = await toPng(cardRef.current, {
        width: w,
        height: h,
        pixelRatio: 2,
        cacheBust: true,
      });
      return dataUrl;
    } finally {
      setGenerating(false);
    }
  }, [format]);

  const handleDownload = async () => {
    const dataUrl = await generateImage();
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.download = `hireready-${format}.png`;
    link.href = dataUrl;
    link.click();
    toast({ title: "Downloaded!", description: "Share it on your socials 🔥" });
  };

  const handleLinkedIn = () => {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://hireready.co")}`,
      "_blank",
      "width=600,height=600"
    );
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(reportUrl);
    toast({ title: "Copied!", description: "Report link copied to clipboard" });
  };

  const isLandscape = format === "landscape";

  return (
    <div className="neo-card mb-8 overflow-hidden bg-card p-6 md:p-8">
      <div className="mb-6 text-center">
        <h3 className="mb-2 font-heading text-2xl font-bold">Share Your Achievement 🏆</h3>
        <p className="text-sm text-muted-foreground">
          Show the world you're putting in the work 💪
        </p>
      </div>

      {/* Format toggle */}
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-full border-2 border-ink bg-muted p-1">
          <button
            onClick={() => setFormat("landscape")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 font-heading text-xs font-bold transition-all ${
              isLandscape ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" /> Post
          </button>
          <button
            onClick={() => setFormat("portrait")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 font-heading text-xs font-bold transition-all ${
              !isLandscape ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Story
          </button>
        </div>
      </div>

      {/* Card preview (scaled) */}
      <div className="mb-6 flex justify-center overflow-hidden rounded-xl border-2 border-ink bg-ink/50 p-4">
        <div
          style={{
            transform: isLandscape ? "scale(0.45)" : "scale(0.22)",
            transformOrigin: "top center",
            height: isLandscape ? 630 * 0.45 : 1920 * 0.22,
          }}
        >
          <InterviewShareCard
            ref={cardRef}
            format={format}
            userName={userName}
            jobTitle={jobTitle}
            overallScore={overallScore}
            commScore={commScore}
            confScore={confScore}
            strengths={strengths}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          onClick={handleDownload}
          disabled={generating}
          className="neo-btn justify-center bg-primary text-primary-foreground"
        >
          <Download className="h-4 w-4" />
          {generating ? "Generating…" : "Download Image"}
        </button>
        <button
          onClick={handleLinkedIn}
          className="neo-btn justify-center bg-[#0A66C2] text-white border-[#0A66C2]"
        >
          <Linkedin className="h-4 w-4" /> Share to LinkedIn
        </button>
        <button
          onClick={handleCopyLink}
          className="neo-btn justify-center bg-muted text-foreground"
        >
          <Copy className="h-4 w-4" /> Copy Link
        </button>
      </div>
    </div>
  );
};

export default ShareAchievement;
