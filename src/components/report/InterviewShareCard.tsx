import { forwardRef } from "react";

interface InterviewShareCardProps {
  format: "landscape" | "portrait";
  userName: string;
  jobTitle: string;
  overallScore: number;
  commScore: number;
  confScore: number;
  strengths: string[];
}

function getHeadline(score: number) {
  if (score >= 85) return "Interview Ready. 🔥";
  if (score >= 70) return "Strong Performance. 💪";
  if (score >= 50) return "Good Progress. 📈";
  return "Keep Grinding. 🎯";
}

const pillColors = [
  "bg-[#3b82f6]",
  "bg-[#8b5cf6]",
  "bg-[#22c55e]",
];

const InterviewShareCard = forwardRef<HTMLDivElement, InterviewShareCardProps>(
  ({ format, userName, jobTitle, overallScore, commScore, confScore, strengths }, ref) => {
    const isPortrait = format === "portrait";
    const w = isPortrait ? 1080 : 1200;
    const h = isPortrait ? 1920 : 630;
    const firstName = userName?.split(" ")[0] || "You";
    const topStrength = strengths[0]
      ? strengths[0].length > 20
        ? strengths[0].slice(0, 20) + "…"
        : strengths[0]
      : "N/A";
    const tagStrengths = strengths.slice(0, 3);

    return (
      <div
        ref={ref}
        style={{
          width: w,
          height: h,
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#0a0a0f",
          color: "#ffffff",
        }}
      >
        {/* Gradient mesh background */}
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "-10%",
            width: "60%",
            height: "60%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-20%",
            right: "-10%",
            width: "60%",
            height: "60%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />

        {/* Content wrapper */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            padding: isPortrait ? "80px 60px" : "40px 56px",
          }}
        >
          {/* Top left — logo */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} />
              <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>HireReady</span>
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 4, marginLeft: 18 }}>
              AI Interview Coach
            </div>
          </div>

          {/* Center content */}
          <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: isPortrait ? 60 : 20 }}>
            {/* Headline */}
            <div>
              <div style={{ fontSize: isPortrait ? 56 : 42, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                {getHeadline(overallScore)}
              </div>
              <div style={{ fontSize: isPortrait ? 24 : 20, color: "rgba(255,255,255,0.6)", marginTop: isPortrait ? 20 : 10 }}>
                {firstName} nailed a <span style={{ color: "#3b82f6", fontWeight: 700 }}>{jobTitle}</span> interview
              </div>
            </div>

            {/* Stats row/column */}
            <div
              style={{
                display: "flex",
                flexDirection: isPortrait ? "column" : "row",
                justifyContent: "center",
                alignItems: "center",
                gap: isPortrait ? 24 : 20,
              }}
            >
              {[
                { value: `${overallScore}/100`, label: "Overall Score" },
                { value: `${commScore}`, label: "Communication" },
                { value: topStrength, label: "Top Strength", isText: true },
              ].map((stat, i) => (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 16,
                    padding: isPortrait ? "28px 40px" : "16px 28px",
                    minWidth: isPortrait ? 280 : 160,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: stat.isText ? (isPortrait ? 22 : 16) : (isPortrait ? 40 : 28),
                      fontWeight: 800,
                      letterSpacing: stat.isText ? "0" : "-0.02em",
                    }}
                  >
                    {stat.value}
                  </div>
                  <div style={{ fontSize: isPortrait ? 15 : 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
              Practiced on hireready.co
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {tagStrengths.map((s, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 999,
                    color: "#fff",
                    background:
                      i === 0 ? "#3b82f6" : i === 1 ? "#8b5cf6" : "#22c55e",
                  }}
                >
                  {s.length > 18 ? s.slice(0, 18) + "…" : s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

InterviewShareCard.displayName = "InterviewShareCard";

export default InterviewShareCard;
