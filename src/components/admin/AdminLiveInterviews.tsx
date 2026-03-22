import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Radio } from "lucide-react";

interface LiveInterview {
  id: string;
  role: string;
  level: string;
  created_at: string;
  user_id: string;
  userName: string;
}

const ElapsedTime = ({ startTime }: { startTime: string }) => {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(startTime).getTime();
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className="font-mono text-lg font-bold text-foreground">{elapsed}</span>;
};

const AdminLiveInterviews = () => {
  const [interviews, setInterviews] = useState<LiveInterview[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLive = async () => {
    const { data } = await supabase
      .from("interviews")
      .select("id, role, level, created_at, user_id")
      .eq("status", "in_progress");

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(i => i.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p.full_name || "Unknown"]));

      setInterviews(
        data.map(i => ({
          ...i,
          userName: profileMap.get(i.user_id) || "Unknown",
        }))
      );
    } else {
      setInterviews([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLive();

    const channel = supabase
      .channel("admin-live-interviews")
      .on("postgres_changes", { event: "*", schema: "public", table: "interviews" }, () => {
        fetchLive();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Live Interviews</h1>

      {interviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio className="mb-4 h-12 w-12 text-muted-foreground animate-pulse" />
          <p className="text-lg text-muted-foreground">No interviews in progress right now</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {interviews.map((interview) => {
            const initials = interview.userName
              .split(" ")
              .map(w => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <div
                key={interview.id}
                className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                      {initials}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{interview.userName}</p>
                      <p className="text-xs text-muted-foreground">{interview.role}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-bold text-green-400">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    LIVE
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{interview.level}</span>
                  <ElapsedTime startTime={interview.created_at} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminLiveInterviews;
