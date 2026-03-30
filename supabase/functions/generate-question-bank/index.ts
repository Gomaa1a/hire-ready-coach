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

const interviewTypeContext: Record<string, string> = {
  behavioral: "This is a BEHAVIORAL interview. Focus competencies on past experiences, leadership stories, conflict resolution, teamwork, and decision-making using the STAR method.",
  technical: "This is a TECHNICAL interview. Focus competencies on deep domain knowledge, problem-solving methodology, system design, debugging approaches, and technical trade-offs.",
  case_study: "This is a CASE STUDY interview. Focus competencies on analytical thinking, structured problem-solving, data-driven reasoning, business acumen, and communication of recommendations.",
  stress: "This is a STRESS interview. Focus competencies on composure under pressure, rapid decision-making, handling ambiguity, defending positions, and recovering from difficult questions.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
    const { interviewId } = parsed.data;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch interview details + CV
    const { data: interview, error: intErr } = await supabase
      .from("interviews")
      .select("role, level, cv_url, user_id, interview_type")
      .eq("id", interviewId)
      .single();

    if (intErr || !interview) throw new Error("Interview not found");

    // Ownership check
    if (interview.user_id !== callerUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse CV if available
    let cvContext = "";
    if (interview.cv_url) {
      try {
        const { extractText } = await import("npm:unpdf@0.12.1");
        const { data: fileData } = await supabase.storage.from("cvs").download(interview.cv_url);
        if (fileData) {
          const buffer = await fileData.arrayBuffer();
          const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
          cvContext = text ? text.substring(0, 4000) : "";
        }
      } catch (e) {
        console.error("CV parse failed:", e);
      }
    }

    const cvSection = cvContext
      ? `\n\nThe candidate's CV/resume content:\n${cvContext}\n\nExtract key highlights: notable projects, specific technologies, leadership experience, career progression, and anything unique about this candidate.`
      : "";

    const interviewType = interview.interview_type || "behavioral";
    const typeContext = interviewTypeContext[interviewType] || interviewTypeContext.behavioral;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert interviewer preparing a topic guide for a live conversational interview. This is NOT a list of questions to read — it's a briefing document that tells a smart AI interviewer what competency areas to explore, what signals to look for, and what makes this candidate unique.

The interview is for a ${interview.level} ${interview.role} position.

${typeContext}${cvSection}`,
          },
          {
            role: "user",
            content: `Create a competency-based topic guide for interviewing a ${interview.level} ${interview.role}. 

The guide should:
1. Identify 5-6 competency areas relevant to this specific role, level, and interview type (${interviewType})
2. For each area, describe what good looks like and what red flags to watch for
3. Extract specific highlights from the CV that the interviewer can reference naturally in conversation
4. Suggest a personalized icebreaker based on something interesting from their background
5. Include evaluation signals — not scripted questions
6. Include a difficulty escalation guide showing what easy, medium, hard, and expert-level probing looks like for this specific role`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "topic_guide",
              description: "Return a structured topic guide for a conversational interview.",
              parameters: {
                type: "object",
                properties: {
                  competencies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        area: { type: "string", description: "Competency area name" },
                        why: { type: "string", description: "Why this area matters for this specific role and level" },
                        signals_to_look_for: { type: "array", items: { type: "string" }, description: "What good answers sound like" },
                        red_flags: { type: "array", items: { type: "string" }, description: "Warning signs in responses" },
                        depth_level: { type: "string", enum: ["surface", "moderate", "deep"], description: "How deeply to probe" },
                      },
                      required: ["area", "why", "signals_to_look_for", "red_flags", "depth_level"],
                      additionalProperties: false,
                    },
                  },
                  candidate_highlights: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key things from the CV the interviewer can reference naturally",
                  },
                  suggested_icebreaker: {
                    type: "string",
                    description: "A natural, personalized opening based on something interesting from their background",
                  },
                  level_expectations: {
                    type: "string",
                    description: "What depth and maturity of answers to expect given the candidate's seniority level",
                  },
                  difficulty_escalation: {
                    type: "object",
                    properties: {
                      level_3_easy: { type: "string", description: "What easy questions look like for this role" },
                      level_5_medium: { type: "string", description: "What medium questions look like — real-world application" },
                      level_7_hard: { type: "string", description: "What hard questions look like — edge cases, failures, scale" },
                      level_10_extreme: { type: "string", description: "What expert questions look like — novel scenarios, no-right-answer dilemmas" },
                    },
                    required: ["level_3_easy", "level_5_medium", "level_7_hard", "level_10_extreme"],
                    additionalProperties: false,
                  },
                },
                required: ["competencies", "candidate_highlights", "suggested_icebreaker", "level_expectations", "difficulty_escalation"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "topic_guide" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured output");

    const topicGuide = JSON.parse(toolCall.function.arguments);

    // Save topic guide to interview
    const { error: updateErr } = await supabase
      .from("interviews")
      .update({ question_bank: topicGuide })
      .eq("id", interviewId);

    if (updateErr) throw new Error(`Failed to save topic guide: ${updateErr.message}`);

    return new Response(JSON.stringify({ success: true, topicGuide }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Topic guide error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
