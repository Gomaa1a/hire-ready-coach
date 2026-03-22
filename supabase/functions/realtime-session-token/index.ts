import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { interviewId } = await req.json();
    if (!interviewId) throw new Error("interviewId is required");

    // Fetch interview with question bank
    const [interviewResult, profileResult] = await Promise.all([
      supabase.from("interviews").select("role, level, question_bank, user_id").eq("id", interviewId).single(),
      // We'll get profile after we have user_id
    ]);

    // Need interview first to get user_id for profile
    const { data: interview, error: intErr } = await supabase
      .from("interviews")
      .select("role, level, question_bank, user_id")
      .eq("id", interviewId)
      .single();

    if (intErr || !interview) throw new Error("Interview not found");
    if (!interview.question_bank) throw new Error("Question bank not generated yet");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", interview.user_id)
      .single();

    const candidateName = profile?.full_name || "the candidate";
    const qb = interview.question_bank as any;

    // Build instructions from question bank
    const questionsFormatted = qb.questions
      .map((q: any, i: number) => `${i + 1}. ${q.question}`)
      .join("\n");

    const instructions = `You are a professional job interviewer conducting a real interview for the position of ${interview.role} at ${interview.level} level. The candidate's name is ${candidateName}. Be warm but professional. Never break character.

Start with this exact opening: "${qb.opening}"

Then ask these questions one by one. Wait for the candidate to fully finish before responding. After each answer, you may ask one follow-up if relevant, then move to the next question:
${questionsFormatted}

End the interview with: "${qb.closing}"

Important rules:
- Address the candidate by their first name "${candidateName.split(" ")[0]}" naturally
- Keep your responses short and natural, like a real interviewer
- Never list all questions at once
- React naturally to answers (say things like "That's interesting", "Tell me more about that", "Great point")
- If the candidate goes off topic, gently redirect them
- Do not evaluate answers out loud during the interview
- Speak naturally and conversationally — you are having a real voice conversation
- Use brief transition phrases between topics
- If an answer is vague, probe deeper with a follow-up before moving on`;

    // Create ephemeral token via OpenAI
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "alloy",
        instructions,
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI session error:", response.status, errText);
      throw new Error(`OpenAI session error: ${response.status}`);
    }

    const sessionData = await response.json();

    return new Response(
      JSON.stringify({
        ephemeralToken: sessionData.client_secret?.value,
        model: sessionData.model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("Realtime session token error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
