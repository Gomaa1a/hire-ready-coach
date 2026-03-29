import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, BookOpen, Loader2, TrendingUp, DollarSign, Building2, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ShareAchievement from "@/components/report/ShareAchievement";

interface RoadmapItem {
  title: string;
  desc: string;
  resource: string;
}

interface MarketInsights {
  top_skills: string[];
  salary_range: { min: string; max: string; currency: string };
  hiring_trends: string[];
  company_tips: string[];
  top_companies: string[];
}

interface ReportData {
  overall_score: number;
  comm_score: number;
  tech_score: number;
  conf_score: number;
  struct_score: number;
  clarity_score: number;
  impact_score: number;
  strengths: string[];
  weaknesses: string[];
  feedback_text: string;
  roadmap: RoadmapItem[];
  market_insights: MarketInsights | null;
  created_at: string;
  interview: {
    role: string;
    level: string;
  } | null;
}

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

const getGrade = (score: number) => {
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "A-";
  if (score >= 75) return "B+";
  if (score >= 70) return "B";
  if (score >= 65) return "B-";
  if (score >= 60) return "C+";
  if (score >= 55) return "C";
  return "C-";
};

const getGradeColor = (grade: string) => {
  if (grade.startsWith("A")) return "text-success";
  if (grade.startsWith("B")) return "text-primary";
  return "text-coral";
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
  const { id } = useParams();
  const { user } = useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [retrying, setRetrying] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!id) {
      setError("No interview ID provided");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    let attempts = 0;
    const maxAttempts = 30;

    const poll = async () => {
      const { data, error: fetchErr } = await supabase
        .from("reports")
        .select("*, interviews:interview_id(role, level)")
        .eq("interview_id", id)
        .maybeSingle();

      if (fetchErr) {
        setError("Failed to load report");
        setLoading(false);
        return;
      }

      if (data) {
        const interviewData = Array.isArray(data.interviews)
          ? data.interviews[0]
          : data.interviews;

        setReport({
          overall_score: data.overall_score ?? 0,
          comm_score: data.comm_score ?? 0,
          tech_score: data.tech_score ?? 0,
          conf_score: data.conf_score ?? 0,
          struct_score: data.struct_score ?? 0,
          clarity_score: data.clarity_score ?? 0,
          impact_score: data.impact_score ?? 0,
          strengths: (data.strengths as string[]) ?? [],
          weaknesses: (data.weaknesses as string[]) ?? [],
          feedback_text: data.feedback_text ?? "",
          roadmap: (data.roadmap as unknown as RoadmapItem[]) ?? [],
          market_insights: (data.market_insights as unknown as MarketInsights) ?? null,
          created_at: data.created_at,
          interview: interviewData as { role: string; level: string } | null,
        });
        setLoading(false);
        return;
      }

      attempts++;
      if (attempts >= maxAttempts) {
        setError("Report is taking longer than expected.");
        setLoading(false);
        return;
      }

      setTimeout(poll, 2000);
    };

    poll();
  }, [id]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleRetry = async () => {
    if (!id || !user) return;
    setRetrying(true);
    try {
      await supabase.functions.invoke("generate-report", {
        body: { interviewId: id, userId: user.id },
      });
      // Now poll for the result
      fetchReport();
    } catch (e) {
      toast.error("Failed to regenerate report. Please try again.");
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="font-heading text-lg font-bold">Generating your AI report...</p>
        <p className="text-sm text-muted-foreground">This usually takes 10-20 seconds</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-lg font-bold text-destructive">{error || "Report not found"}</p>
        <Link to="/dashboard" className="neo-btn bg-primary text-primary-foreground">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const grade = getGrade(report.overall_score);
  const scores = {
    communication: report.comm_score,
    technical: report.tech_score,
    confidence: report.conf_score,
    structure: report.struct_score,
    clarity: report.clarity_score,
    impact: report.impact_score,
  };

  const formattedDate = new Date(report.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
            {report.interview && (
              <>
                <span className="neo-badge bg-primary text-primary-foreground">{report.interview.role}</span>
                <span className="neo-badge bg-muted text-muted-foreground">{report.interview.level}</span>
                <span>•</span>
              </>
            )}
            <span>{formattedDate}</span>
          </div>
        </div>

        {/* Score hero */}
        <div className="neo-card mb-8 bg-ink p-6 text-primary-foreground md:p-8">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <div className="text-center">
              <div className={`font-heading text-7xl font-extrabold ${getGradeColor(grade)}`}>
                {grade}
              </div>
              <div className="mt-2 font-heading text-3xl font-bold">{report.overall_score}%</div>
              <div className="text-sm text-foreground/60">Overall Score</div>
            </div>
            <div className="flex-1">
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(scores).map(([key, value]) => (
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
          {Object.entries(scores).map(([key, value]) => (
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
          <p className="text-muted-foreground leading-relaxed">{report.feedback_text}</p>
        </div>

        {/* Market Insights Section */}
        {report.market_insights && (
          <div className="neo-card mb-8 border-2 border-primary/20 bg-primary/5 p-6">
            <h3 className="mb-6 flex items-center gap-2 font-heading text-lg font-bold">
              <TrendingUp className="h-5 w-5 text-primary" /> Market Insights for {report.interview?.role || "This Role"}
            </h3>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Top Skills */}
              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground/80">
                  <Lightbulb className="h-4 w-4 text-primary" /> In-Demand Skills
                </h4>
                <div className="flex flex-wrap gap-2">
                  {report.market_insights.top_skills?.map((skill, i) => (
                    <span key={i} className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Salary Range */}
              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground/80">
                  <DollarSign className="h-4 w-4 text-success" /> Salary Range
                </h4>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading text-2xl font-bold text-success">
                    {report.market_insights.salary_range?.min}
                  </span>
                  <span className="text-muted-foreground">to</span>
                  <span className="font-heading text-2xl font-bold text-success">
                    {report.market_insights.salary_range?.max}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.interview?.level} level · {report.market_insights.salary_range?.currency}
                </p>
              </div>

              {/* Top Companies Hiring */}
              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground/80">
                  <Building2 className="h-4 w-4 text-primary" /> Companies Hiring
                </h4>
                <div className="flex flex-wrap gap-2">
                  {report.market_insights.top_companies?.map((company, i) => (
                    <span key={i} className="rounded-md border border-foreground/15 bg-foreground/5 px-3 py-1 text-xs font-medium">
                      {company}
                    </span>
                  ))}
                </div>
              </div>

              {/* Hiring Trends */}
              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground/80">
                  <TrendingUp className="h-4 w-4 text-primary" /> Hiring Trends
                </h4>
                <ul className="space-y-2">
                  {report.market_insights.hiring_trends?.map((trend, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="mt-0.5 text-primary">→</span>
                      {trend}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Company Tips */}
            {report.market_insights.company_tips && report.market_insights.company_tips.length > 0 && (
              <div className="mt-6 border-t border-primary/10 pt-4">
                <h4 className="mb-3 text-sm font-bold text-foreground/80">💡 Stand Out Tips</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {report.market_insights.company_tips.map((tip, i) => (
                    <div key={i} className="rounded-lg bg-background/60 p-3 text-xs text-muted-foreground">
                      {tip}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Learning roadmap */}
        {report.roadmap.length > 0 && (
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
        )}

        {/* Share Achievement Card */}
        <ShareAchievement
          userName={user?.user_metadata?.full_name || "You"}
          jobTitle={report.interview?.role ?? "General"}
          overallScore={report.overall_score}
          commScore={report.comm_score}
          confScore={report.conf_score}
          strengths={report.strengths}
          reportUrl={window.location.href}
        />

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
