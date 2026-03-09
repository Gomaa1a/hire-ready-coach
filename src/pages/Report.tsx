import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, BookOpen } from "lucide-react";

// Mock report data
const report = {
  role: "Software Engineer",
  level: "Junior",
  date: "January 15, 2024",
  overall: 78,
  grade: "B+",
  scores: {
    communication: 82,
    technical: 71,
    confidence: 75,
    structure: 80,
    clarity: 78,
    impact: 72,
  },
  strengths: [
    "Clear articulation of technical concepts",
    "Good use of specific examples with metrics",
    "Confident tone and professional demeanor",
  ],
  weaknesses: [
    "Could provide more depth on system design",
    "Some answers lacked quantifiable outcomes",
    "Hesitation when discussing unfamiliar topics",
  ],
  feedback: `You demonstrated solid communication skills and a good understanding of fundamental concepts. Your answers were generally well-structured, especially when discussing past projects. However, there's room for improvement in providing more specific metrics and diving deeper into technical details. When facing challenging questions, try to maintain confidence and use the STAR method more consistently.`,
  roadmap: [
    {
      title: "Master System Design",
      desc: "Study distributed systems, scalability patterns, and common architectures.",
      resource: "System Design Primer",
    },
    {
      title: "Practice Behavioral Questions",
      desc: "Use STAR method for all behavioral answers. Prepare 10 stories with metrics.",
      resource: "Behavioral Interview Guide",
    },
    {
      title: "Build Confidence",
      desc: "Practice mock interviews weekly. Record yourself and review.",
      resource: "Mock Interview Platform",
    },
  ],
};

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-primary";
  return "text-coral";
};

const getScoreBg = (score: number) => {
  if (score >= 80) return "bg-success/20";
  if (score >= 60) return "bg-primary/20";
  return "bg-coral/20";
};

const getGradeColor = (grade: string) => {
  if (grade.startsWith("A")) return "text-success";
  if (grade.startsWith("B")) return "text-primary";
  if (grade.startsWith("C")) return "text-coral";
  return "text-destructive";
};

const scoreEmojis: Record<string, string> = {
  communication: "🗣️",
  technical: "⚙️",
  confidence: "💪",
  structure: "📐",
  clarity: "💡",
  impact: "🎯",
};

const Report = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/dashboard" className="neo-btn bg-background text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <Link to="/interview/new" className="neo-btn bg-primary text-primary-foreground">
            <RefreshCw className="h-4 w-4" /> Practice Again
          </Link>
        </div>

        {/* Title */}
        <div className="mb-8">
          <h1 className="mb-2 font-heading text-3xl font-extrabold">Interview Report 📊</h1>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span className="neo-badge bg-primary text-primary-foreground">{report.role}</span>
            <span className="neo-badge bg-muted text-muted-foreground">{report.level}</span>
            <span>•</span>
            <span>{report.date}</span>
          </div>
        </div>

        {/* Score hero */}
        <div className="neo-card mb-8 bg-ink p-6 text-primary-foreground md:p-8">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <div className="text-center">
              <div className={`font-heading text-7xl font-extrabold ${getGradeColor(report.grade)}`}>
                {report.grade}
              </div>
              <div className="mt-2 font-heading text-3xl font-bold">{report.overall}%</div>
              <div className="text-sm text-foreground/60">Overall Score</div>
            </div>
            <div className="flex-1">
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(report.scores).map(([key, value]) => (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span>{scoreEmojis[key]}</span>
                        <span className="capitalize">{key}</span>
                      </span>
                      <span className={`font-bold ${getScoreColor(value)}`}>{value}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-foreground/20">
                      <div
                        className={`h-full rounded-full transition-all ${
                          value >= 80 ? "bg-success" : value >= 60 ? "bg-primary" : "bg-coral"
                        }`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Score mini-cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(report.scores).map(([key, value]) => (
            <div key={key} className={`neo-card p-4 text-center ${getScoreBg(value)}`}>
              <div className="text-2xl">{scoreEmojis[key]}</div>
              <div className={`font-heading text-xl font-bold ${getScoreColor(value)}`}>{value}%</div>
              <div className="text-xs capitalize text-muted-foreground">{key}</div>
            </div>
          ))}
        </div>

        {/* Strengths & Weaknesses */}
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="neo-card bg-success/10 p-6">
            <h3 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-success">
              <CheckCircle className="h-5 w-5" /> Strengths
            </h3>
            <ul className="space-y-2">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-success">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="neo-card bg-coral/10 p-6">
            <h3 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-coral">
              <AlertTriangle className="h-5 w-5" /> Areas to Improve
            </h3>
            <ul className="space-y-2">
              {report.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-coral">⚠</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Detailed feedback */}
        <div className="neo-card mb-8 bg-card p-6">
          <h3 className="mb-4 font-heading text-lg font-bold">Detailed Feedback</h3>
          <p className="text-muted-foreground leading-relaxed">{report.feedback}</p>
        </div>

        {/* Learning roadmap */}
        <div className="neo-card mb-8 bg-primary/10 p-6">
          <h3 className="mb-6 flex items-center gap-2 font-heading text-lg font-bold">
            <BookOpen className="h-5 w-5 text-primary" /> Your Learning Roadmap
          </h3>
          <div className="space-y-4">
            {report.roadmap.map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary font-heading font-bold text-primary-foreground">
                  {i + 1}
                </div>
                <div>
                  <h4 className="font-heading font-bold">{item.title}</h4>
                  <p className="mb-2 text-sm text-muted-foreground">{item.desc}</p>
                  <span className="neo-badge bg-lime text-lime-foreground text-xs">{item.resource}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="neo-card bg-primary p-8 text-center text-primary-foreground">
          <h3 className="mb-2 font-heading text-2xl font-bold">Ready to improve your score?</h3>
          <p className="mb-6 text-primary-foreground/70">Practice makes perfect. Start another session now.</p>
          <Link to="/interview/new" className="neo-btn bg-lime text-lime-foreground">
            Practice Again
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Report;
