import { Link, useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import { CreditCard, CheckCircle, Trophy, Mic, ArrowRight, Lightbulb } from "lucide-react";
import { toast } from "sonner";

// Mock data - replace with real data from Supabase
const mockCredits: number = 3;
const mockInterviews = [
  { id: "1", role: "Software Engineer", level: "Junior", date: "2024-01-15", score: 78 },
  { id: "2", role: "Product Manager", level: "Mid-level", date: "2024-01-12", score: 85 },
];

const Dashboard = () => {
  const navigate = useNavigate();

  const handleSignOut = () => {
    toast.success("Signed out");
    navigate("/");
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-primary";
    return "text-coral";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b-2 border-ink bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link to="/dashboard">
              <Logo />
            </Link>
            <div className="hidden items-center gap-6 md:flex">
              <Link to="/dashboard" className="font-body text-sm font-semibold text-foreground">
                Dashboard
              </Link>
              <Link to="/interview/new" className="font-body text-sm font-semibold text-muted-foreground hover:text-foreground">
                New Interview
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`neo-badge ${mockCredits === 0 ? "bg-coral text-coral-foreground" : "bg-primary text-primary-foreground"}`}>
              {mockCredits} credits
            </div>
            <button onClick={handleSignOut} className="neo-btn bg-background text-foreground text-sm">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="mb-2 font-heading text-3xl font-extrabold">Hey there 👋</h1>
          <p className="text-muted-foreground">
            You have <span className="font-bold text-primary">{mockCredits} interviews</span> remaining.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="neo-card flex items-center gap-4 bg-primary p-5 text-primary-foreground">
            <CreditCard className="h-8 w-8" />
            <div>
              <div className="font-heading text-2xl font-bold">{mockCredits}</div>
              <div className="text-sm opacity-80">Credits Left</div>
            </div>
          </div>
          <div className="neo-card flex items-center gap-4 bg-success p-5 text-success-foreground">
            <CheckCircle className="h-8 w-8" />
            <div>
              <div className="font-heading text-2xl font-bold">{mockInterviews.length}</div>
              <div className="text-sm opacity-80">Done</div>
            </div>
          </div>
          <div className="neo-card flex items-center gap-4 bg-coral p-5 text-coral-foreground">
            <Trophy className="h-8 w-8" />
            <div>
              <div className="font-heading text-2xl font-bold">
                {mockInterviews.length > 0 ? Math.max(...mockInterviews.map((i) => i.score)) : 0}%
              </div>
              <div className="text-sm opacity-80">Best Score</div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Past interviews */}
          <div className="lg:col-span-2">
            <div className="neo-card bg-card p-6">
              <h2 className="mb-4 font-heading text-xl font-bold">Past Interviews</h2>
              {mockInterviews.length === 0 ? (
                <div className="py-12 text-center">
                  <Mic className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-4 text-muted-foreground">No interviews yet. Start your first one!</p>
                  <Link to="/interview/new" className="neo-btn bg-primary text-primary-foreground">
                    Start Interview
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {mockInterviews.map((interview) => (
                    <div
                      key={interview.id}
                      className="flex items-center justify-between rounded-xl border-2 border-ink bg-background p-4"
                    >
                      <div>
                        <div className="font-heading font-bold">{interview.role}</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{interview.level}</span>
                          <span>•</span>
                          <span>{interview.date}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="neo-badge bg-success/20 text-success">Done</span>
                        <span className={`font-heading text-lg font-bold ${getScoreColor(interview.score)}`}>
                          {interview.score}%
                        </span>
                        <Link
                          to={`/report/${interview.id}`}
                          className="flex items-center gap-1 font-semibold text-primary hover:underline"
                        >
                          View <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Credits */}
            <div className={`neo-card p-6 ${mockCredits === 0 ? "bg-coral text-coral-foreground" : "bg-card"}`}>
              <h3 className="mb-2 font-heading text-lg font-bold">Credits</h3>
              <div className="mb-2 font-heading text-4xl font-extrabold">{mockCredits}</div>
              <p className="mb-4 text-sm opacity-80">
                {mockCredits === 0 ? "You're out of credits!" : "interviews remaining"}
              </p>
              <Link
                to="/pricing"
                className={`neo-btn w-full text-center ${
                  mockCredits === 0 ? "bg-background text-foreground" : "bg-primary text-primary-foreground"
                }`}
              >
                {mockCredits === 0 ? "Get More Credits" : "Buy Credits"}
              </Link>
            </div>

            {/* Tips */}
            <div className="neo-card bg-success/10 p-6">
              <div className="mb-2 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-success" />
                <h3 className="font-heading text-lg font-bold text-success">Pro Tip</h3>
              </div>
              <p className="text-sm text-foreground">
                Use the STAR method (Situation, Task, Action, Result) when answering behavioral questions. It helps
                structure your response and shows clear impact.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
