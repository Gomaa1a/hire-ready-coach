import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PastInterview {
  id: string;
  role: string;
  level: string;
  created_at: string;
  ended_at: string | null;
  ai_summary: string | null;
  user_id: string;
  userName: string;
  overallScore: number | null;
}

const PAGE_SIZE = 20;

const AdminPastInterviews = () => {
  const [interviews, setInterviews] = useState<PastInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchInterviews = async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("interviews")
      .select("id, role, level, created_at, ended_at, ai_summary, user_id", { count: "exact" })
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search.trim()) {
      query = query.ilike("role", `%${search.trim()}%`);
    }

    const { data, count } = await query;
    setTotal(count ?? 0);

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(i => i.user_id))];
      const interviewIds = data.map(i => i.id);

      const [profilesRes, reportsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", userIds),
        supabase.from("reports").select("interview_id, overall_score").in("interview_id", interviewIds),
      ]);

      const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p.full_name || "Unknown"]));
      const reportMap = new Map((reportsRes.data ?? []).map(r => [r.interview_id, r.overall_score]));

      setInterviews(
        data.map(i => ({
          ...i,
          userName: profileMap.get(i.user_id) || "Unknown",
          overallScore: reportMap.get(i.id) ?? null,
        }))
      );
    } else {
      setInterviews([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInterviews();
  }, [page, search]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
  };

  const getDuration = (start: string, end: string | null) => {
    if (!end) return "—";
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.floor(diff / 60000);
    return `${mins}m`;
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Past Interviews</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by job title..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.08)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,255,255,0.06)] text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Job Title</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">AI Summary</th>
                </tr>
              </thead>
              <tbody>
                {interviews.map((i) => (
                  <tr key={i.id} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{i.userName}</td>
                    <td className="px-4 py-3 text-foreground">{i.role}</td>
                    <td className="px-4 py-3 text-muted-foreground">{i.level}</td>
                    <td className="px-4 py-3">
                      {i.overallScore != null ? (
                        <span className={`font-bold ${getScoreColor(i.overallScore)}`}>{i.overallScore}%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{getDuration(i.created_at, i.ended_at)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {i.ai_summary ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help text-muted-foreground truncate block">
                              {i.ai_summary.length > 50 ? i.ai_summary.slice(0, 50) + "..." : i.ai_summary}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-sm">
                            <p className="text-sm">{i.ai_summary}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {interviews.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      No completed interviews found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-[rgba(255,255,255,0.08)] p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg border border-[rgba(255,255,255,0.08)] p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminPastInterviews;
