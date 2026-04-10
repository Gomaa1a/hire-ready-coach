import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, BookOpen, Loader2, TrendingUp, DollarSign, Building2, Lightbulb, Headphones, Pause, Play, Shield, Target, Quote, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ShareAchievement from "@/components/report/ShareAchievement";

interface RoadmapItem {
  title: string;
  desc: string;
  resource: string;
}

interface SkillWithSource {
  skill: string;
  source: string;
  why_critical?: string;
}

interface BenchmarkWithSource {
  benchmark: string;
  source: string;
}

interface RoleRequirements {
  must_have_skills: SkillWithSource[];
  nice_to_have_skills: SkillWithSource[];
  level_expectations: string;
  industry_benchmarks: BenchmarkWithSource[];
}

interface ScoringRubricItem {
  skill: string;
  weight: string;
  score: number;
  evidence: string;
}

interface StrengthItem {
  point: string;
  quote: string;
  maps_to: string;
  relevance: string;
}

interface WeaknessItem {
  point: string;
  expected: string;
  actual: string;
  rubric_skill: string;
}

interface MarketSkill {
  skill: string;
  source: string;
}

interface MarketTrend {
  trend: string;
  source: string;
}

interface MarketInsights {
  top_skills: (string | MarketSkill)[];
  salary_range: { min: string; max: string; currency: string; source?: string };
  hiring_trends: (string | MarketTrend)[];
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
  strengths: (string | StrengthItem)[];
  weaknesses: (string | WeaknessItem)[];
  feedback_text: string;
  roadmap: RoadmapItem[];
  market_insights: MarketInsights | null;
  role_requirements: RoleRequirements | null;
  scoring_rubric: ScoringRubricItem[] | null;
  created_at: string;
  interview: {
    role: string;
    level: string;
  } | null;
}

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-primary";
  if (score >= 20) return "text-coral";
  return "text-destructive";
};

const getScoreBg = (score: number) => {
  if (score >= 80) return "bg-success/20";
  if (score >= 60) return "bg-primary/20";
  if (score >= 20) return "bg-coral/20";
  return "bg-destructive/20";
};

const getScoreBarColor = (score: number) => {
  if (score >= 80) return "bg-success";
  if (score >= 60) return "bg-primary";
  if (score >= 20) return "bg-coral";
  return "bg-destructive";
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
  if (score >= 40) return "C-";
  if (score >= 25) return "D";
  if (score >= 10) return "D-";
  return "F";
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
  const { id } = useParams();
  const { user } = useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [narrationPlaying, setNarrationPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
          strengths: (data.strengths as any[]) ?? [],
          weaknesses: (data.weaknesses as any[]) ?? [],
          feedback_text: data.feedback_text ?? "",
          roadmap: (data.roadmap as unknown as RoadmapItem[]) ?? [],
          market_insights: (data.market_insights as unknown as MarketInsights) ?? null,
          role_requirements: (data.role_requirements as unknown as RoleRequirements) ?? null,
          scoring_rubric: (data.scoring_rubric as unknown as ScoringRubricItem[]) ?? null,
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
        body: { interviewId: id },
      });
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
        <p className="text-sm text-muted-foreground">This usually takes 15-30 seconds</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-lg font-bold text-destructive">{error || "Report not found"}</p>
        <div className="flex gap-3">
          <button onClick={handleRetry} disabled={retrying} className="neo-btn bg-primary text-primary-foreground disabled:opacity-50">
            {retrying ? "Regenerating..." : "Retry Report Generation"}
          </button>
          <Link to="/dashboard" className="neo-btn bg-muted text-muted-foreground">Back to Dashboard</Link>
        </div>
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

  // Helper to get skill/trend text regardless of format
  const getSkillText = (s: string | MarketSkill) => typeof s === "string" ? s : s.skill;
  const getSkillSource = (s: string | MarketSkill) => typeof s === "string" ? null : s.source;
  const getTrendText = (t: string | MarketTrend) => typeof t === "string" ? t : t.trend;
  const getTrendSource = (t: string | MarketTrend) => typeof t === "string" ? null : t.source;

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

        {/* Listen to Debrief + Practice Negotiation */}
        <div className="mb-8 flex flex-wrap gap-3">
          <button
            onClick={async () => {
              if (narrationPlaying && audioRef.current) {
                audioRef.current.pause();
                setNarrationPlaying(false);
                return;
              }
              if (audioRef.current?.src) {
                audioRef.current.play();
                setNarrationPlaying(true);
                return;
              }
              setNarrationLoading(true);
              try {
                const { data, error } = await supabase.functions.invoke("narrate-report", {
                  body: { interviewId: id },
                });
                if (error || !data?.audio) throw new Error("Failed to generate narration");
                const audioUrl = `data:audio/mpeg;base64,${data.audio}`;
                const audio = new Audio(audioUrl);
                audioRef.current = audio;
                audio.onended = () => setNarrationPlaying(false);
                audio.play();
                setNarrationPlaying(true);
              } catch (e) {
                toast.error("Failed to load audio debrief");
              } finally {
                setNarrationLoading(false);
              }
            }}
            disabled={narrationLoading}
            className="neo-btn bg-gradient-to-r from-primary to-blue-600 text-primary-foreground flex items-center gap-2"
          >
            {narrationLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating Audio...</>
            ) : narrationPlaying ? (
              <><Pause className="h-4 w-4" /> Pause Debrief</>
            ) : (
              <><Headphones className="h-4 w-4" /> Listen to Your Debrief</>
            )}
          </button>
          <Link to={`/negotiation/${id}`} className="neo-btn bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Practice Salary Negotiation
          </Link>
        </div>

        {/* Overall Score Card */}
        <div className="neo-card mb-8 bg-ink p-6 text-primary-foreground md:p-8">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <div className="text-center">
              <div className={`font-heading text-5xl sm:text-7xl font-extrabold ${getGradeColor(grade)}`}>
                {grade}
              </div>
              <div className="mt-2 font-heading text-2xl sm:text-3xl font-bold">{report.overall_score}%</div>
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
                        className={`h-full rounded-full transition-all ${getScoreBarColor(value)}`}
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
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {Object.entries(scores).map(([key, value]) => (
            <div key={key} className={`neo-card p-4 text-center ${getScoreBg(value)}`}>
              <div className="text-2xl">{scoreEmojis[key]}</div>
              <div className={`font-heading text-xl font-bold ${getScoreColor(value)}`}>{value}%</div>
              <div className="text-xs capitalize text-muted-foreground">{key}</div>
            </div>
          ))}
        </div>

        {/* ═══ HOW WE SCORED YOU ═══ */}
        {report.scoring_rubric && report.scoring_rubric.length > 0 && (
          <div className="neo-card mb-8 border-2 border-foreground/20 bg-card p-6">
            <h3 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold">
              <Target className="h-5 w-5 text-primary" /> How We Scored You
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Each skill was evaluated individually against the role requirements. Must-have skills count 3× in the overall score.
            </p>
            <div className="space-y-3">
              {report.scoring_rubric.map((item, i) => (
                <div key={i} className="rounded-lg border border-foreground/10 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${item.weight.includes("must") || item.weight.includes("3x") ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>
                        {item.weight.includes("must") || item.weight.includes("3x") ? "MUST-HAVE" : "NICE-TO-HAVE"}
                      </span>
                      <span className="font-medium text-sm">{item.skill}</span>
                    </div>
                    <span className={`font-heading font-bold ${getScoreColor(item.score)}`}>{item.score}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-foreground/10 mb-2">
                    <div className={`h-full rounded-full ${getScoreBarColor(item.score)}`} style={{ width: `${item.score}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{item.evidence}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ ROLE REQUIREMENTS ═══ */}
        {report.role_requirements && (
          <div className="neo-card mb-8 border-2 border-primary/20 bg-primary/5 p-6">
            <h3 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold">
              <Shield className="h-5 w-5 text-primary" /> Role Requirements — {report.interview?.role} ({report.interview?.level})
            </h3>
            <p className="mb-4 text-sm text-muted-foreground italic">{report.role_requirements.level_expectations}</p>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-bold text-destructive">Must-Have Skills (3× weight)</h4>
                <div className="space-y-2">
                  {report.role_requirements.must_have_skills.map((s, i) => (
                    <div key={i} className="rounded-md bg-destructive/5 border border-destructive/15 p-2">
                      <div className="font-medium text-sm">{s.skill}</div>
                      {s.why_critical && <p className="text-xs text-muted-foreground mt-1">{s.why_critical}</p>}
                      <p className="text-xs text-muted-foreground/70 mt-1 italic">📎 {s.source}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-bold text-muted-foreground">Nice-to-Have Skills (1× weight)</h4>
                <div className="space-y-2">
                  {report.role_requirements.nice_to_have_skills.map((s, i) => (
                    <div key={i} className="rounded-md bg-muted/50 border border-foreground/10 p-2">
                      <div className="font-medium text-sm">{s.skill}</div>
                      <p className="text-xs text-muted-foreground/70 mt-1 italic">📎 {s.source}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {report.role_requirements.industry_benchmarks.length > 0 && (
              <div className="mt-4 border-t border-primary/10 pt-4">
                <h4 className="mb-2 text-sm font-bold text-foreground/80">🏆 Industry Benchmarks</h4>
                <ul className="space-y-1">
                  {report.role_requirements.industry_benchmarks.map((b, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      • {b.benchmark} <span className="italic text-muted-foreground/60">— {b.source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Strengths & Weaknesses — enhanced */}
        <div className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="neo-card bg-success/10 p-6">
            <h3 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-success">
              <CheckCircle className="h-5 w-5" /> Strengths
            </h3>
            {report.strengths.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No rubric-mapped strengths demonstrated in this interview.</p>
            ) : (
              <ul className="space-y-4">
                {report.strengths.map((s, i) => {
                  if (typeof s === "string") {
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-success">✓</span>{s}
                      </li>
                    );
                  }
                  return (
                    <li key={i} className="rounded-md bg-success/5 p-3 text-sm space-y-1">
                      <div className="flex items-start gap-2 font-medium">
                        <span className="text-success">✓</span>{s.point}
                      </div>
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground ml-5">
                        <Quote className="h-3 w-3 mt-0.5 shrink-0 text-success/60" />
                        <span className="italic">"{s.quote}"</span>
                      </div>
                      <div className="ml-5 text-xs">
                        <span className="text-success/80 font-medium">Maps to:</span>{" "}
                        <span className="text-muted-foreground">{s.maps_to}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="neo-card bg-coral/10 p-6">
            <h3 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-coral">
              <AlertTriangle className="h-5 w-5" /> Areas to Improve
            </h3>
            <ul className="space-y-4">
              {report.weaknesses.map((w, i) => {
                if (typeof w === "string") {
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-coral">⚠</span>{w}
                    </li>
                  );
                }
                return (
                  <li key={i} className="rounded-md bg-coral/5 p-3 text-sm space-y-1">
                    <div className="flex items-start gap-2 font-medium">
                      <span className="text-coral">⚠</span>{w.point}
                    </div>
                    <div className="ml-5 text-xs text-muted-foreground">
                      <span className="font-medium text-coral/80">Expected:</span> {w.expected}
                    </div>
                    <div className="ml-5 text-xs text-muted-foreground">
                      <span className="font-medium text-coral/80">Actual:</span> {w.actual}
                    </div>
                    <div className="ml-5 text-xs">
                      <span className="text-coral/80 font-medium">Rubric skill:</span>{" "}
                      <span className="text-muted-foreground">{w.rubric_skill}</span>
                    </div>
                  </li>
                );
              })}
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
                <div className="space-y-1">
                  {report.market_insights.top_skills?.map((skill, i) => (
                    <div key={i}>
                      <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary inline-block">
                        {getSkillText(skill)}
                      </span>
                      {getSkillSource(skill) && (
                        <span className="text-[10px] text-muted-foreground/60 ml-1 italic">{getSkillSource(skill)}</span>
                      )}
                    </div>
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
                {report.market_insights.salary_range?.source && (
                  <p className="mt-1 text-[10px] text-muted-foreground/60 italic">📎 {report.market_insights.salary_range.source}</p>
                )}
              </div>

              {/* Top Companies */}
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
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="text-primary">→</span> {getTrendText(trend)}
                      {getTrendSource(trend) && (
                        <span className="block text-[10px] text-muted-foreground/60 italic ml-3">📎 {getTrendSource(trend)}</span>
                      )}
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
          strengths={report.strengths.map(s => typeof s === "string" ? s : s.point)}
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
