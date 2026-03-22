import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronUp } from "lucide-react";

interface UserRow {
  id: string;
  full_name: string | null;
  created_at: string;
  target_role: string | null;
  experience_level: string | null;
  primary_goal: string | null;
  current_role: string | null;
  biggest_challenge: string | null;
  interview_frequency: string | null;
  heard_from: string | null;
  interviewCount: number;
}

const AdminUsers = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userInterviews, setUserInterviews] = useState<Record<string, any[]>>({});

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, created_at, target_role, experience_level, primary_goal, current_role, biggest_challenge, interview_frequency, heard_from")
        .order("created_at", { ascending: false });

      if (profiles && profiles.length > 0) {
        // Count interviews per user
        const { data: interviews } = await supabase
          .from("interviews")
          .select("user_id");

        const countMap = new Map<string, number>();
        (interviews ?? []).forEach(i => {
          countMap.set(i.user_id, (countMap.get(i.user_id) || 0) + 1);
        });

        setUsers(
          (profiles as any[]).map(p => ({
            ...p,
            interviewCount: countMap.get(p.id) || 0,
          }))
        );
      }
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const toggleExpand = async (userId: string) => {
    if (expandedId === userId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(userId);

    if (!userInterviews[userId]) {
      const { data } = await supabase
        .from("interviews")
        .select("id, role, level, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      setUserInterviews(prev => ({ ...prev, [userId]: data ?? [] }));
    }
  };

  const filtered = search.trim()
    ? users.filter(u =>
        (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (u.target_role || "").toLowerCase().includes(search.toLowerCase())
      )
    : users;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Users ({users.length})</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)]"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.08)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.06)] text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 w-8" />
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Signup Date</th>
              <th className="px-4 py-3">Target Role</th>
              <th className="px-4 py-3">Experience</th>
              <th className="px-4 py-3">Goal</th>
              <th className="px-4 py-3">Interviews</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <>
                <tr
                  key={u.id}
                  onClick={() => toggleExpand(u.id)}
                  className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    {expandedId === u.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{u.full_name || "No name"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-foreground">{u.target_role || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.experience_level || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.primary_goal || "—"}</td>
                  <td className="px-4 py-3 text-foreground font-medium">{u.interviewCount}</td>
                </tr>
                {expandedId === u.id && (
                  <tr key={`${u.id}-expanded`}>
                    <td colSpan={7} className="bg-[rgba(255,255,255,0.02)] px-8 py-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Onboarding Answers</h3>
                          <div className="space-y-1 text-sm">
                            <p><span className="text-muted-foreground">Situation:</span> <span className="text-foreground">{u.current_role || "—"}</span></p>
                            <p><span className="text-muted-foreground">Challenge:</span> <span className="text-foreground">{u.biggest_challenge || "—"}</span></p>
                            <p><span className="text-muted-foreground">Frequency:</span> <span className="text-foreground">{u.interview_frequency || "—"}</span></p>
                            <p><span className="text-muted-foreground">Heard from:</span> <span className="text-foreground">{u.heard_from || "—"}</span></p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Interviews</h3>
                          {userInterviews[u.id]?.length ? (
                            <div className="space-y-1">
                              {userInterviews[u.id].map((iv: any) => (
                                <div key={iv.id} className="flex items-center justify-between text-sm">
                                  <span className="text-foreground">{iv.role} ({iv.level})</span>
                                  <span className={`text-xs ${iv.status === "completed" ? "text-green-500" : "text-amber-500"}`}>
                                    {iv.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No interviews yet</p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminUsers;
