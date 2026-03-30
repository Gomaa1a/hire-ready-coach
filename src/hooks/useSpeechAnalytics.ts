import { useState, useEffect, useCallback, useRef } from "react";
import { ConversationEntry } from "@/hooks/useRealtimeInterview";

const FILLER_WORDS = ["um", "uh", "like", "you know", "basically", "actually", "literally", "right", "so", "well", "i mean", "kind of", "sort of"];

export type SpeechAnalytics = {
  fillerCount: number;
  wordsPerMinute: number;
  totalWords: number;
  fillerRate: "low" | "moderate" | "high";
  paceStatus: "slow" | "good" | "fast";
};

export function useSpeechAnalytics(conversationLog: ConversationEntry[]) {
  const [analytics, setAnalytics] = useState<SpeechAnalytics>({
    fillerCount: 0,
    wordsPerMinute: 0,
    totalWords: 0,
    fillerRate: "low",
    paceStatus: "good",
  });
  const firstUserTimestamp = useRef<number | null>(null);

  useEffect(() => {
    const userEntries = conversationLog.filter((e) => e.role === "user");
    if (userEntries.length === 0) return;

    if (!firstUserTimestamp.current) {
      firstUserTimestamp.current = userEntries[0].timestamp;
    }

    const allUserText = userEntries.map((e) => e.text).join(" ").toLowerCase();
    const words = allUserText.split(/\s+/).filter(Boolean);
    const totalWords = words.length;

    // Count filler words
    let fillerCount = 0;
    for (const filler of FILLER_WORDS) {
      const regex = new RegExp(`\\b${filler}\\b`, "gi");
      const matches = allUserText.match(regex);
      if (matches) fillerCount += matches.length;
    }

    // WPM calculation
    const elapsedMinutes = (Date.now() - firstUserTimestamp.current) / 60000;
    const wpm = elapsedMinutes > 0.1 ? Math.round(totalWords / elapsedMinutes) : 0;

    // Rate classification
    const fillerPct = totalWords > 0 ? fillerCount / totalWords : 0;
    const fillerRate: SpeechAnalytics["fillerRate"] =
      fillerPct > 0.08 ? "high" : fillerPct > 0.04 ? "moderate" : "low";

    const paceStatus: SpeechAnalytics["paceStatus"] =
      wpm > 180 ? "fast" : wpm < 100 && wpm > 0 ? "slow" : "good";

    setAnalytics({ fillerCount, wordsPerMinute: wpm, totalWords, fillerRate, paceStatus });
  }, [conversationLog]);

  return analytics;
}
