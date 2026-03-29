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
  persona: z.object({
    name: z.string(),
    title: z.string(),
    company: z.string(),
  }).optional(),
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
      return new Response(JSON.stringify({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { interviewId, persona } = parsed.data;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch interview with topic guide
    const { data: interview, error: intErr } = await supabase
      .from("interviews")
      .select("role, level, question_bank, user_id")
      .eq("id", interviewId)
      .single();

    if (intErr || !interview) throw new Error("Interview not found");

    // Ownership check
    if (interview.user_id !== callerUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!interview.question_bank) throw new Error("Topic guide not generated yet");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", interview.user_id)
      .single();

    const candidateName = profile?.full_name || "the candidate";
    const firstName = candidateName.split(" ")[0];
    const guide = interview.question_bank as any;

    // Build persona identity
    const personaName = persona?.name || "Alex Morgan";
    const personaTitle = persona?.title || "Senior Hiring Manager";
    const personaCompany = persona?.company || "the company";

    // Build competency briefing from topic guide
    const competenciesBrief = (guide.competencies || [])
      .map((c: any) => {
        const signals = (c.signals_to_look_for || []).join(", ");
        const flags = (c.red_flags || []).join(", ");
        return `• ${c.area} (${c.depth_level} depth): ${c.why}. Look for: ${signals}. Red flags: ${flags}`;
      })
      .join("\n");

    const highlightsBrief = (guide.candidate_highlights || [])
      .map((h: string) => `• ${h}`)
      .join("\n");

    const icebreaker = guide.suggested_icebreaker || `Tell me about your background and what brought you here today.`;
    const levelExpectations = guide.level_expectations || "";

    const instructions = `You are ${personaName}, ${personaTitle} at ${personaCompany}. You are conducting a live voice interview for a ${interview.level} ${interview.role} position.

The candidate's name is ${candidateName}. Address them as "${firstName}" naturally throughout the conversation.

CANDIDATE CONTEXT:
${highlightsBrief ? `Key highlights from their background:\n${highlightsBrief}` : "No CV provided — discover their background through conversation."}

COMPETENCY AREAS TO EXPLORE:
${competenciesBrief || "Cover technical depth, problem-solving, collaboration, and motivation."}

${levelExpectations ? `LEVEL CALIBRATION:\n${levelExpectations}\n` : ""}
YOUR INTERVIEW APPROACH:
- Start with a warm, brief intro of yourself and the company, then ease in with this icebreaker: "${icebreaker}"
- Cover 5-6 topics naturally over ~15 minutes. You don't need to hit every competency — prioritize based on what the conversation reveals
- Listen actively — when something interesting comes up, dig deeper with 2-3 follow-ups before moving on. Don't just accept surface-level answers
- If the candidate mentions a project, challenge, or decision, ask specifics: "What was your specific role?", "What trade-offs did you consider?", "What would you do differently now?"
- Adapt difficulty based on their responses — if they handle something easily, push harder. If they struggle, pivot gracefully to a different angle
- Use natural transitions: "That reminds me...", "Building on what you said about...", "Interesting — that actually connects to something I wanted to explore..."
- React genuinely before asking the next thing: "That's a great example", "I can see why that was challenging", "That's an interesting approach"
- If an answer is vague, probe: "Can you walk me through a specific example?", "What did that look like in practice?"
- Manage time naturally — don't rush, but if one topic is consuming too much time, gracefully transition
- Near the end (~12-13 minutes in), wrap up current topic and ask: "Before we wrap up, is there anything you'd like to ask me about the role or the team?"
- Close warmly and naturally

CRITICAL RULES:
- NEVER list multiple questions at once
- NEVER say "next question", "moving on to question 3", or anything that reveals a script
- NEVER evaluate or score answers out loud during the interview
- NEVER break character — you are a real person having a real conversation
- Speak naturally and conversationally — use filler words occasionally ("So...", "Right...", "Yeah...")
- Keep your responses SHORT — a real interviewer mostly listens. Your turns should be 1-3 sentences, not paragraphs
- When the conversation has reached a natural conclusion or ~15 minutes have passed, let the candidate know the interview is wrapping up, thank them, and mention they can click the "End" button to finish the session`;

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
