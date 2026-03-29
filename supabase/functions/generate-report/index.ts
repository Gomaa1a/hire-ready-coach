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

async function callAI(apiKey: string, messages: any[], tools?: any[], toolChoice?: any) {
  const body: any = {
    model: "google/gemini-3-flash-preview",
    messages,
  };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 429 || response.status === 402) {
      throw { status: response.status };
    }
    const errText = await response.text();
    console.error("AI gateway error:", response.status, errText);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  return response.json();
}

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

    // Fetch interview details + candidate name in parallel
    const [interviewResult, profileResult, messagesResult] = await Promise.all([
      supabase.from("interviews").select("role, level, user_id").eq("id", interviewId).single(),
      supabase.from("profiles").select("full_name, target_role, experience_level, primary_goal, biggest_challenge").eq("id", callerUserId).single(),
      supabase.from("messages").select("role, content").eq("interview_id", interviewId).order("created_at", { ascending: true }),
    ]);

    if (interviewResult.error) throw new Error(`Failed to fetch interview: ${interviewResult.error.message}`);

    // Ownership check
    if (interviewResult.data.user_id !== callerUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (messagesResult.error) throw new Error(`Failed to fetch messages: ${messagesResult.error.message}`);
    if (!messagesResult.data || messagesResult.data.length === 0) throw new Error("No transcript found");

    const interview = interviewResult.data;
    const candidateName = profileResult.data?.full_name || "the candidate";
    const candidateGoal = profileResult.data?.primary_goal || null;
    const candidateChallenge = profileResult.data?.biggest_challenge || null;
    const candidateExpLevel = profileResult.data?.experience_level || null;

    const transcriptText = messagesResult.data
      .map((m) => `${m.role === "assistant" ? "Interviewer" : "Candidate"}: ${m.content}`)
      .join("\n");

    // Step 1: Generate market insights for this role
    const marketInsightsResult = await callAI(
      LOVABLE_API_KEY,
      [
        {
          role: "system",
          content: "You are a job market research analyst. Provide current, realistic market insights based on your knowledge. Be specific and actionable.",
        },
        {
          role: "user",
          content: `Generate current job market insights for a ${interview.level} ${interview.role} position. Include: top skills employers look for, salary range expectations, hiring trends, and tips for standing out at top companies.`,
        },
      ],
      [
        {
          type: "function",
          function: {
            name: "market_insights",
            description: "Return structured job market insights for a specific role.",
            parameters: {
              type: "object",
              properties: {
                top_skills: { type: "array", items: { type: "string" }, description: "6-8 most in-demand skills for this role" },
                salary_range: {
                  type: "object",
                  properties: {
                    min: { type: "string", description: "Minimum salary (e.g., '$85,000')" },
                    max: { type: "string", description: "Maximum salary (e.g., '$140,000')" },
                    currency: { type: "string", description: "Currency code" },
                  },
                  required: ["min", "max", "currency"],
                  additionalProperties: false,
                },
                hiring_trends: { type: "array", items: { type: "string" }, description: "3-4 current hiring trends for this role" },
                company_tips: { type: "array", items: { type: "string" }, description: "3-4 tips for standing out when applying to top companies" },
                top_companies: { type: "array", items: { type: "string" }, description: "5-6 companies actively hiring for this role" },
              },
              required: ["top_skills", "salary_range", "hiring_trends", "company_tips", "top_companies"],
              additionalProperties: false,
            },
          },
        },
      ],
      { type: "function", function: { name: "market_insights" } }
    );

    let marketInsights = null;
    try {
      const marketToolCall = marketInsightsResult.choices?.[0]?.message?.tool_calls?.[0];
      if (marketToolCall?.function?.arguments) {
        marketInsights = JSON.parse(marketToolCall.function.arguments);
      }
    } catch (e) {
      console.error("Failed to parse market insights:", e);
    }

    // Step 2: Generate the full report with market context
    const marketContext = marketInsights
      ? `\n\nMARKET CONTEXT for ${interview.role}:\nTop skills in demand: ${marketInsights.top_skills?.join(", ")}\nSalary range: ${marketInsights.salary_range?.min} - ${marketInsights.salary_range?.max}\nThis context should inform your personalized tips — compare the candidate's demonstrated skills against market demands.`
      : "";

    const personalization = [
      candidateGoal ? `The candidate's primary goal is: "${candidateGoal}".` : "",
      candidateChallenge ? `Their self-identified biggest challenge is: "${candidateChallenge}".` : "",
      candidateExpLevel ? `They identify as ${candidateExpLevel} level.` : "",
    ].filter(Boolean).join(" ");

    const personalizationSection = personalization
      ? `\n\nCANDIDATE CONTEXT: ${personalization} Tailor roadmap items and feedback to directly address their stated goal and challenge.`
      : "";

    const reportResult = await callAI(
      LOVABLE_API_KEY,
      [
        {
          role: "system",
          content: `You are an expert interview coach analyzing a mock interview transcript. The candidate "${candidateName}" interviewed for the role of ${interview.role} at ${interview.level} level. Evaluate their performance thoroughly and provide actionable, personalized feedback.${marketContext}${personalizationSection}`,
        },
        {
          role: "user",
          content: `Analyze this interview transcript and generate a detailed performance report. Make feedback specific to ${candidateName}'s actual responses — quote or reference what they said.\n\n${transcriptText}`,
        },
      ],
      [
        {
          type: "function",
          function: {
            name: "generate_report",
            description: "Generate a structured interview performance report with scores, feedback, strengths, weaknesses, personalized tips, and a learning roadmap.",
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "integer", description: "Overall performance score 0-100" },
                comm_score: { type: "integer", description: "Communication skills score 0-100" },
                tech_score: { type: "integer", description: "Technical knowledge score 0-100" },
                conf_score: { type: "integer", description: "Confidence and composure score 0-100" },
                struct_score: { type: "integer", description: "Answer structure and organization score 0-100" },
                clarity_score: { type: "integer", description: "Clarity of expression score 0-100" },
                impact_score: { type: "integer", description: "Impact and persuasiveness score 0-100" },
                strengths: { type: "array", items: { type: "string" }, description: "3-5 specific strengths observed, referencing actual candidate responses" },
                weaknesses: { type: "array", items: { type: "string" }, description: "3-5 specific areas for improvement, referencing actual responses" },
                feedback_text: { type: "string", description: "A detailed paragraph of personalized overall feedback (4-6 sentences) addressing the candidate by name" },
                roadmap: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Action item title" },
                      desc: { type: "string", description: "Brief description of what to do" },
                      resource: { type: "string", description: "Suggested resource or platform" },
                    },
                    required: ["title", "desc", "resource"],
                    additionalProperties: false,
                  },
                  description: "3-5 actionable learning roadmap items tailored to candidate's gaps",
                },
              },
              required: ["overall_score", "comm_score", "tech_score", "conf_score", "struct_score", "clarity_score", "impact_score", "strengths", "weaknesses", "feedback_text", "roadmap"],
              additionalProperties: false,
            },
          },
        },
      ],
      { type: "function", function: { name: "generate_report" } }
    );

    const toolCall = reportResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured output");
    }

    const reportData = JSON.parse(toolCall.function.arguments);

    // Save report — use callerUserId from JWT, not from request body
    const { data: savedReport, error: saveErr } = await supabase
      .from("reports")
      .insert({
        interview_id: interviewId,
        user_id: callerUserId,
        overall_score: reportData.overall_score,
        comm_score: reportData.comm_score,
        tech_score: reportData.tech_score,
        conf_score: reportData.conf_score,
        struct_score: reportData.struct_score,
        clarity_score: reportData.clarity_score,
        impact_score: reportData.impact_score,
        strengths: reportData.strengths,
        weaknesses: reportData.weaknesses,
        feedback_text: reportData.feedback_text,
        roadmap: reportData.roadmap,
        market_insights: marketInsights,
      })
      .select("id")
      .single();

    if (saveErr) throw new Error(`Failed to save report: ${saveErr.message}`);

    return new Response(JSON.stringify({ success: true, reportId: savedReport.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e?.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (e?.status === 402) {
      return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("Report generation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
