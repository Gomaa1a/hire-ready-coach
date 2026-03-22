import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Mic, CalendarDays, Radio } from "lucide-react";

interface Stats {
  totalUsers: number;
  totalInterviews: number;
  interviewsToday: number;
  activeNow: number;
}

interface RecentUser {
  id: string;
  full_name: string | null;
  created_at: string;
  target_role: string | null;
  primary_goal: string | null;
}

interface RecentInterview {
  id: string;
  role: string;
  created_at: string;
  status: string;
  user_id: string;
  profiles?: { full_name: string | null } | null;
  reports?: { overall_score: number | null }[] | null;
}

const StatCard = ({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
}) => (
  <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-6">
    <div className="flex items-center gap-3 mb-3">
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
    <div className="text-3xl font-bold text-foreground">{value.toLocaleString()}</div>
  </div>
);

const AdminOverview = () => {
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalInterviews: 0, interviewsToday: 0, activeNow: 0 });
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [recentInterviews, setRecentInterviews] = useState<RecentInterview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [usersRes, interviewsRes, todayRes, activeRes, recentUsersRes, recentIntRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("interviews").select("id", { count: "exact", head: true }),
        supabase.from("interviews").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        supabase.from("interviews").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("profiles").select("id, full_name, created_at, target_role, primary_goal").order("created_at", { ascending: false }).limit(10),
        supabase.from("interviews").select("id, role, created_at, status, user_id").order("created_at", { ascending: false }).limit(10),
      ]);

      setStats({
        totalUsers: usersRes.count ?? 0,
        totalInterviews: interviewsRes.count ?? 0,
        interviewsToday: todayRes.count ?? 0,
        activeNow: activeRes.count ?? 0,
      });

      setRecentUsers((recentUsersRes.data as any[]) ?? []);
      
      // Fetch user names and scores for recent interviews
      const interviews = (recentIntRes.data ?? []) as RecentInterview[];
      if (interviews.length > 0) {
        const userIds = [...new Set(interviews.map(i => i.user_id))];
        const interviewIds = interviews.map(i => i.id);
        
        const [profilesRes, reportsRes] = await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", userIds),
          supabase.from("reports").select("interview_id, overall_score").in("interview_id", interviewIds),
        ]);

        const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p]));
        const reportMap = new Map((reportsRes.data ?? []).map(r => [r.interview_id, r]));

        const enriched = interviews.map(i => ({
          ...i,
          profiles: profileMap.get(i.user_id) ?? null,
          reports: reportMap.has(i.id) ? [reportMap.get(i.id)!] : null,
        }));
        setRecentInterviews(enriched);
      }

      setLoading(false);
    };
    fetchAll();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-foreground">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} value={stats.totalUsers} label="Total Users" />
        <StatCard icon={Mic} value={stats.totalInterviews} label="Total Interviews" />
        <StatCard icon={CalendarDays} value={stats.interviewsToday} label="Interviews Today" />
        <StatCard icon={Radio} value={stats.activeNow} label="Active Right Now" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Signups */}
        <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Recent Signups</h2>
          <div className="space-y-0">
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] py-3 hover:bg-[rgba(255,255,255,0.03)] px-2 rounded">
                <div>
                  <p className="text-sm font-medium text-foreground">{u.full_name || "No name"}</p>
                  <p className="text-xs text-muted-foreground">{u.target_role || "—"} · {u.primary_goal || "—"}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Interviews */}
        <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Recent Interviews</h2>
          <div className="space-y-0">
            {recentInterviews.map((i) => {
              const score = i.reports?.[0]?.overall_score;
              return (
                <div key={i.id} className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] py-3 hover:bg-[rgba(255,255,255,0.03)] px-2 rounded">
                  <div>
                    <p className="text-sm font-medium text-foreground">{(i.profiles as any)?.full_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{i.role}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {score != null && (
                      <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}%</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(i.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminOverview;
