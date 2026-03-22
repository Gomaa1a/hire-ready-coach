import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PlatformStats {
  total_users: number;
  total_interviews: number;
}

function formatNumber(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

function useAnimatedNumber(target: number, duration = 800) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  const raf = useRef<number>();

  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(start + diff * eased);
      setDisplay(current);
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        prev.current = target;
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);

  return display;
}

function PulseDot() {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-success"
      style={{
        boxShadow: "0 0 0 0 rgba(34, 197, 94, 0.4)",
        animation: "stats-pulse 2s infinite",
      }}
    />
  );
}

export default function LiveStatsBar({ compact = false }: { compact?: boolean }) {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-platform-stats");
      if (error) throw error;
      setStats(data as PlatformStats);
    } catch {
      // silently fail — keep last known stats
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Realtime subscription for live interview count bumps
  useEffect(() => {
    const channel = supabase
      .channel("live-stats-interviews")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "interviews" },
        () => {
          setStats((prev) =>
            prev ? { ...prev, total_interviews: prev.total_interviews + 1 } : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const animatedUsers = useAnimatedNumber(stats?.total_users ?? 0);
  const animatedInterviews = useAnimatedNumber(stats?.total_interviews ?? 0);

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 py-1.5 backdrop-blur-lg">
        {loading ? (
          <>
            <Skeleton className="h-4 w-10 rounded bg-muted-foreground/20" />
            <span className="text-muted-foreground/30">|</span>
            <Skeleton className="h-4 w-10 rounded bg-muted-foreground/20" />
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <PulseDot />
              <span className="font-heading text-xs font-bold text-foreground">
                {formatNumber(animatedUsers)}
              </span>
            </span>
            <span className="text-muted-foreground/30">|</span>
            <span className="flex items-center gap-1.5">
              <PulseDot />
              <span className="font-heading text-xs font-bold text-foreground">
                {formatNumber(animatedInterviews)}
              </span>
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-6 rounded-full border border-foreground/10",
        "bg-foreground/[0.03] px-8 py-3 backdrop-blur-lg"
      )}
    >
      {loading ? (
        <>
          <div className="flex flex-col items-center gap-1">
            <Skeleton className="h-7 w-16 rounded bg-muted-foreground/20" />
            <Skeleton className="h-3 w-20 rounded bg-muted-foreground/10" />
          </div>
          <div className="h-10 w-px bg-foreground/10" />
          <div className="flex flex-col items-center gap-1">
            <Skeleton className="h-7 w-16 rounded bg-muted-foreground/20" />
            <Skeleton className="h-3 w-24 rounded bg-muted-foreground/10" />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex items-center gap-2">
              <PulseDot />
              <span className="font-heading text-2xl font-extrabold text-foreground">
                {formatNumber(animatedUsers)}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">Learners Joined</span>
          </div>
          <div className="h-10 w-px bg-foreground/10" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="flex items-center gap-2">
              <PulseDot />
              <span className="font-heading text-2xl font-extrabold text-foreground">
                {formatNumber(animatedInterviews)}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">Interviews Completed</span>
          </div>
        </>
      )}
    </div>
  );
}
