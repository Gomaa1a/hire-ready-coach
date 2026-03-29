import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Sarah voice - warm professional female narrator
const NARRATOR_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { interviewId } = await req.json();
    if (!interviewId) throw new Error("interviewId is required");

    // Fetch report
    const { data: report, error: repErr } = await supabase
      .from("reports")
      .select("*, interviews:interview_id(role, level, user_id)")
      .eq("interview_id", interviewId)
      .single();

    if (repErr || !report) throw new Error("Report not found");

    const interview = Array.isArray(report.interviews) ? report.interviews[0] : report.interviews;
    const userId = interview?.user_id;

    // Fetch profile for name
    let candidateName = "there";
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();
      candidateName = profile?.full_name?.split(" ")[0] || "there";
    }

    const strengths = (report.strengths as string[]) || [];
    const weaknesses = (report.weaknesses as string[]) || [];
    const roadmap = (report.roadmap as any[]) || [];

    // Build narration script
    const script = `Hey ${candidateName}! Let me walk you through your interview results.

You scored ${report.overall_score} percent overall for the ${interview?.role || "interview"} position — ${
      report.overall_score >= 80
        ? "that's an excellent result, you should be really proud!"
        : report.overall_score >= 60
        ? "that's a solid performance with room to grow."
        : "there's definitely room for improvement, but that's exactly why practice helps."
    }

${strengths.length > 0 ? `Your biggest strength was: ${strengths[0]}. ` : ""}${
      weaknesses.length > 0 ? `The main area to work on is: ${weaknesses[0]}. ` : ""
    }

Your communication score was ${report.comm_score} percent, and your confidence came in at ${report.conf_score} percent.

${roadmap.length > 0 ? `My top recommendation for you: focus on ${roadmap[0].title}. ${roadmap[0].desc}` : ""}

Keep practicing, and you'll see real improvement. You've got this!`;

    // Call ElevenLabs TTS
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${NARRATOR_VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: script,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.8,
            style: 0.4,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      console.error("ElevenLabs TTS error:", ttsResponse.status, errText);
      throw new Error(`TTS error: ${ttsResponse.status}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = base64Encode(audioBuffer);

    return new Response(
      JSON.stringify({ audio: audioBase64, script }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Narrate report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
