import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const bodySchema = z.object({
  interviewId: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerUserId = claims.claims.sub as string;

    // Input validation
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid input" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { interviewId } = parsed.data;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch interview + report for context
    const { data: interview } = await supabase
      .from("interviews")
      .select("role, level, user_id")
      .eq("id", interviewId)
      .single();

    if (!interview) throw new Error("Interview not found");

    // Ownership check
    if (interview.user_id !== callerUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: report } = await supabase
      .from("reports")
      .select("market_insights, overall_score")
      .eq("interview_id", interviewId)
      .single();

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, experience_level")
      .eq("id", interview.user_id)
      .single();

    const candidateName = profile?.full_name || "the candidate";
    const marketInsights = report?.market_insights as any;
    const salaryMin = marketInsights?.salary_range?.min || "$80,000";
    const salaryMax = marketInsights?.salary_range?.max || "$120,000";

    const instructions = `You are an HR manager named Patricia Wells conducting a salary negotiation call. You work at a mid-to-large tech company. You are professional, friendly but firm. Never break character.

Context:
- The candidate's name is ${candidateName}
- Position: ${interview.role} (${interview.level} level)
- Market salary range: ${salaryMin} to ${salaryMax}

Your behavior:
1. Start by congratulating the candidate: "Hi ${candidateName.split(" ")[0]}, congratulations! We'd love to extend an offer for the ${interview.role} position."
2. Present an initial offer slightly below the market midpoint
3. Respond realistically to negotiation attempts — be willing to move a bit but push back on unreasonable asks
4. After 3-4 exchanges about compensation, wrap up naturally
5. At the end, give brief feedback on their negotiation style

Rules:
- Be conversational and natural — this is a voice call
- Don't be a pushover — push back on requests with business rationale
- Be specific with numbers
- Keep responses short (2-3 sentences max per turn)
- If the candidate accepts too quickly, note that they could have negotiated more`;

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "shimmer",
        instructions,
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI session error:", response.status, errText);
      throw new Error(`OpenAI session error: ${response.status}`);
    }

    const sessionData = await response.json();

    return new Response(
      JSON.stringify({ ephemeralToken: sessionData.client_secret?.value, model: sessionData.model }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Negotiation session error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
