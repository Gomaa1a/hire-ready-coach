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

// Interview type prompt variants
const interviewTypePrompts: Record<string, string> = {
  behavioral: `INTERVIEW STYLE — BEHAVIORAL:
- Focus on past experiences using the STAR method (Situation, Task, Action, Result)
- Ask "Tell me about a time when..." questions
- Probe for specific examples, not hypotheticals
- Dig into leadership, conflict resolution, teamwork, and decision-making
- Look for self-awareness and learning from mistakes`,

  technical: `INTERVIEW STYLE — TECHNICAL:
- Focus on deep domain knowledge, problem-solving methodology, and system thinking
- Ask the candidate to walk through how they would solve real problems
- Probe for trade-off reasoning, scalability awareness, and edge case thinking
- If they mention a technology, ask them to go deeper: "Why that over alternatives?"
- Push for specifics: architecture decisions, debugging approaches, performance considerations`,

  case_study: `INTERVIEW STYLE — CASE STUDY:
- Present a realistic business scenario relevant to the role
- Walk the candidate through analysis step by step
- Ask them to identify the problem, propose solutions, and evaluate trade-offs
- Probe their reasoning: "What data would you need?", "How would you measure success?"
- Test structured thinking and communication clarity`,

  stress: `INTERVIEW STYLE — STRESS:
- This is a pressure interview. Move fast. Interrupt occasionally.
- Ask rapid-fire follow-ups. Don't let vague answers slide.
- Challenge every answer: "I disagree — convince me.", "That sounds theoretical — what actually happened?"
- Use time pressure: "You have 30 seconds to explain..."
- Stay professional but demanding. You're testing composure under pressure.
- If they handle it well, push harder. If they crack, ease up slightly.`,
};

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
      .select("role, level, question_bank, user_id, interview_type")
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
    const interviewType = interview.interview_type || "behavioral";

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

    // Get interview type specific prompt
    const typePrompt = interviewTypePrompts[interviewType] || interviewTypePrompts.behavioral;

    // Difficulty escalation context
    const difficultyEscalation = guide.difficulty_escalation
      ? `\nDIFFICULTY CALIBRATION:\n- Easy: ${guide.difficulty_escalation.level_3_easy}\n- Medium: ${guide.difficulty_escalation.level_5_medium}\n- Hard: ${guide.difficulty_escalation.level_7_hard}\n- Expert: ${guide.difficulty_escalation.level_10_extreme}\n`
      : "";

    const instructions = `You are ${personaName}, ${personaTitle} at ${personaCompany}. You are conducting a live voice interview for a ${interview.level} ${interview.role} position.

The candidate's name is ${candidateName}. Address them as "${firstName}" naturally throughout the conversation.

CANDIDATE CONTEXT:
${highlightsBrief ? `Key highlights from their background:\n${highlightsBrief}` : "No CV provided — discover their background through conversation."}

COMPETENCY AREAS TO EXPLORE:
${competenciesBrief || "Cover technical depth, problem-solving, collaboration, and motivation."}

${levelExpectations ? `LEVEL CALIBRATION:\n${levelExpectations}\n` : ""}
${typePrompt}

${difficultyEscalation}
ADAPTIVE DIFFICULTY ENGINE:
- Track candidate performance mentally across the conversation
- Start at difficulty level 5 out of 10
- If a candidate gives a strong, detailed answer with specific examples and trade-offs → INCREASE difficulty: ask about edge cases, failure modes, scale challenges
- If they give another strong answer → push even harder: hypothetical scenarios, "walk me through how you'd debug this at 3am with no documentation"
- If a candidate struggles or gives a vague answer → DON'T repeat harder. Pivot to a related but easier angle, or move to a different competency area
- The goal is to find the candidate's ceiling, not to make them fail
- Never go below difficulty 3

CHALLENGE BEHAVIOR:
- After every 2-3 answers, gently push back on one point: "Interesting, but what if [alternative]?", "I'd challenge that — what about [edge case]?"
- If the candidate gives a textbook answer, say: "That's the standard approach. What would YOU do differently?"
- Occasionally play devil's advocate: "Let me push back on that..."
- Never be hostile. Be professionally skeptical, like a senior colleague stress-testing an idea.

YOUR INTERVIEW APPROACH:
- Start with a warm, brief intro of yourself and the company, then ease in with this icebreaker: "${icebreaker}"
- Cover 5-6 topics naturally over ~15 minutes. Prioritize based on what the conversation reveals
- Listen actively — when something interesting comes up, dig deeper with 2-3 follow-ups before moving on
- If the candidate mentions a project, challenge, or decision, ask specifics: "What was your specific role?", "What trade-offs did you consider?"
- Use natural transitions: "That reminds me...", "Building on what you said about..."
- React genuinely before asking the next thing — but keep reactions SHORT (one brief phrase max)
- If an answer is vague, probe: "Can you walk me through a specific example?"
- Near the end (~12-13 minutes in), wrap up and ask: "Before we wrap up, is there anything you'd like to ask me?"
- Close warmly

RESPONSE LENGTH — THIS IS CRITICAL:
- Maximum 2 sentences per turn. A real interviewer mostly LISTENS.
- Never repeat or summarize what the candidate just said
- Never give long preambles like "Great question, that's really interesting, let me think about that..."
- Get to your next question FAST

SESSION MANAGEMENT:
- This interview runs for approximately 15 minutes. There is NO fixed number of questions
- Spend 2-3 minutes per competency area, going deeper if the candidate is strong
- NEVER end the interview early because you "ran out of questions"
- If you've covered all planned areas and time remains, go deeper into the candidate's strongest or weakest area

CRITICAL RULES:
- NEVER list multiple questions at once
- NEVER say "next question", "moving on to question 3", or anything that reveals a script
- NEVER evaluate or score answers out loud during the interview
- NEVER break character — you are a real person having a real conversation
- Keep your responses SHORT — maximum 2 sentences
- When the conversation has reached ~15 minutes, tell the candidate: "We're wrapping up — thank you for your time, ${firstName}. Please click the End button to finish the session. If you have any feedback about this interview experience, you'll be able to share it on the next screen."`;

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
