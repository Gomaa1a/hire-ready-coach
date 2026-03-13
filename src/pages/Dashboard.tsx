import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, CheckCircle, Trophy, Mic, ArrowRight, Lightbulb } from "lucide-react";
import DownloadShareCard from "@/components/dashboard/DownloadShareCard";
import { toast } from "sonner";

interface Interview {
  id: string;
  role: string;
  level: string;
  created_at: string;
  status: string;
}

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [credits, setCredits] = useState<number>(0);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [reports, setReports] = useState<Record<string, { overall_score: number; conf_score: number; clarity_score: number; struct_score: number; comm_score: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Fetch credits
      const { data: creditData } = await supabase
        .from("credits")
        .select("balance")
        .eq("user_id", user.id)
        .single();
      if (creditData) setCredits(creditData.balance);

      // Fetch interviews
      const { data: interviewData } = await supabase
        .from("interviews")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (interviewData) setInterviews(interviewData);

      // Fetch reports for scores
      const { data: reportData } = await supabase
        .from("reports")
        .select("interview_id, overall_score, conf_score, clarity_score, struct_score, comm_score")
        .eq("user_id", user.id);
      if (reportData) {
        const map: Record<string, { overall_score: number; conf_score: number; clarity_score: number; struct_score: number; comm_score: number }> = {};
        reportData.forEach((r) => {
          if (r.overall_score !== null) map[r.interview_id] = {
            overall_score: r.overall_score ?? 0,
            conf_score: r.conf_score ?? 0,
            clarity_score: r.clarity_score ?? 0,
            struct_score: r.struct_score ?? 0,
            comm_score: r.comm_score ?? 0,
          };
        });
        setReports(map);
      }

      setLoading(false);
    };
    fetchData();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/");
  };

  const completedInterviews = interviews.filter((i) => i.status === "completed");
  const bestScore = Object.values(reports).length > 0 ? Math.max(...Object.values(reports)) : 0;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-primary";
    return "text-coral";
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b-2 border-ink bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link to="/dashboard"><Logo /></Link>
            <div className="hidden items-center gap-6 md:flex">
              <Link to="/dashboard" className="font-body text-sm font-semibold text-foreground">Dashboard</Link>
              <Link to="/interview/new" className="font-body text-sm font-semibold text-muted-foreground hover:text-foreground">New Interview</Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`neo-badge ${credits === 0 ? "bg-coral text-coral-foreground" : "bg-primary text-primary-foreground"}`}>
              {credits} credits
            </div>
            <button onClick={handleSignOut} className="neo-btn bg-background text-foreground text-sm">Sign out</button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="mb-2 font-heading text-3xl font-extrabold">Hey there 👋</h1>
          <p className="text-muted-foreground">
            You have <span className="font-bold text-primary">{credits} interviews</span> remaining.
          </p>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="neo-card flex items-center gap-4 bg-primary p-5 text-primary-foreground">
            <CreditCard className="h-8 w-8" />
            <div>
              <div className="font-heading text-2xl font-bold">{credits}</div>
              <div className="text-sm opacity-80">Credits Left</div>
            </div>
          </div>
          <div className="neo-card flex items-center gap-4 bg-success p-5 text-success-foreground">
            <CheckCircle className="h-8 w-8" />
            <div>
              <div className="font-heading text-2xl font-bold">{completedInterviews.length}</div>
              <div className="text-sm opacity-80">Done</div>
            </div>
          </div>
          <div className="neo-card flex items-center gap-4 bg-coral p-5 text-coral-foreground">
            <Trophy className="h-8 w-8" />
            <div>
              <div className="font-heading text-2xl font-bold">{bestScore}%</div>
              <div className="text-sm opacity-80">Best Score</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="neo-card bg-card p-6">
              <h2 className="mb-4 font-heading text-xl font-bold">Past Interviews</h2>
              {completedInterviews.length === 0 ? (
                <div className="py-12 text-center">
                  <Mic className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-4 text-muted-foreground">No interviews yet. Start your first one!</p>
                  <Link to="/interview/new" className="neo-btn bg-primary text-primary-foreground">Start Interview</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {completedInterviews.map((interview) => (
                    <div key={interview.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-background p-4">
                      <div>
                        <div className="font-heading font-bold">{interview.role}</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{interview.level}</span>
                          <span>•</span>
                          <span>{new Date(interview.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="neo-badge bg-success/20 text-success">Done</span>
                        {reports[interview.id] !== undefined && (
                          <span className={`font-heading text-lg font-bold ${getScoreColor(reports[interview.id])}`}>
                            {reports[interview.id]}%
                          </span>
                        )}
                        <Link to={`/report/${interview.id}`} className="flex items-center gap-1 font-semibold text-primary hover:underline">
                          View <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className={`neo-card p-6 ${credits === 0 ? "bg-coral text-coral-foreground" : "bg-card"}`}>
              <h3 className="mb-2 font-heading text-lg font-bold">Credits</h3>
              <div className="mb-2 font-heading text-4xl font-extrabold">{credits}</div>
              <p className="mb-4 text-sm opacity-80">{credits === 0 ? "You're out of credits!" : "interviews remaining"}</p>
              <Link to="/pricing" className={`neo-btn w-full text-center ${credits === 0 ? "bg-background text-foreground" : "bg-primary text-primary-foreground"}`}>
                {credits === 0 ? "Get More Credits" : "Buy Credits"}
              </Link>
            </div>
            <div className="neo-card bg-success/10 p-6">
              <div className="mb-2 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-success" />
                <h3 className="font-heading text-lg font-bold text-success">Pro Tip</h3>
              </div>
              <p className="text-sm text-foreground">
                Use the STAR method (Situation, Task, Action, Result) when answering behavioral questions.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
