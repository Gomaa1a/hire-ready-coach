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
    model: "google/gemini-2.5-flash",
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

function parseToolCall(result: any): any | null {
  try {
    const tc = result.choices?.[0]?.message?.tool_calls?.[0];
    if (tc?.function?.arguments) return JSON.parse(tc.function.arguments);
  } catch (e) {
    console.error("Failed to parse tool call:", e);
  }
  return null;
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

    // Fetch interview details + candidate profile + messages in parallel
    const [interviewResult, profileResult, messagesResult] = await Promise.all([
      supabase.from("interviews").select("role, level, user_id").eq("id", interviewId).single(),
      supabase.from("profiles").select("full_name, target_role, experience_level, primary_goal, biggest_challenge").eq("id", callerUserId).single(),
      supabase.from("messages").select("role, content").eq("interview_id", interviewId).order("created_at", { ascending: true }),
    ]);

    if (interviewResult.error) throw new Error(`Failed to fetch interview: ${interviewResult.error.message}`);
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

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Role Research Agent — Build the scoring rubric
    // ═══════════════════════════════════════════════════════════════
    const roleResearchResult = await callAI(
      LOVABLE_API_KEY,
      [
        {
          role: "system",
          content: `You are a senior talent acquisition researcher. Your job is to produce an accurate, industry-grounded job requirements profile for a specific role and level. Every skill and benchmark you list MUST include a source reference (e.g., "Based on Google/Meta/Amazon 2024-2025 job postings", "Per LinkedIn Skills Report 2025", "Industry standard per IEEE/ACM"). Do NOT invent sources — only cite well-known, real industry references. If you are uncertain about a source, say "Industry consensus" rather than fabricating a specific report name.`,
        },
        {
          role: "user",
          content: `Generate a detailed job requirements profile for: ${interview.role} at ${interview.level} level.\n\nThis will be used as a scoring rubric to evaluate a candidate's interview performance. Be specific to the role — a "Senior Software Engineer" has completely different must-haves than a "Marketing Manager" or "Nurse Practitioner".`,
        },
      ],
      [
        {
          type: "function",
          function: {
            name: "role_requirements",
            description: "Return a structured job requirements profile with sources for each requirement.",
            parameters: {
              type: "object",
              properties: {
                must_have_skills: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      skill: { type: "string", description: "The specific skill or competency" },
                      why_critical: { type: "string", description: "Why this is non-negotiable for the role" },
                      source: { type: "string", description: "Reference source for this requirement" },
                    },
                    required: ["skill", "why_critical", "source"],
                    additionalProperties: false,
                  },
                  description: "6-8 non-negotiable skills for this specific role and level",
                },
                nice_to_have_skills: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      skill: { type: "string" },
                      source: { type: "string" },
                    },
                    required: ["skill", "source"],
                    additionalProperties: false,
                  },
                  description: "4-5 bonus skills that differentiate strong candidates",
                },
                level_expectations: {
                  type: "string",
                  description: "What is specifically expected at this level (Junior vs Mid vs Senior vs Lead). 2-3 sentences.",
                },
                industry_benchmarks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      benchmark: { type: "string" },
                      source: { type: "string" },
                    },
                    required: ["benchmark", "source"],
                    additionalProperties: false,
                  },
                  description: "3-4 things top performers in this role actually do, with sources",
                },
              },
              required: ["must_have_skills", "nice_to_have_skills", "level_expectations", "industry_benchmarks"],
              additionalProperties: false,
            },
          },
        },
      ],
      { type: "function", function: { name: "role_requirements" } }
    );

    const roleRequirements = parseToolCall(roleResearchResult);
    if (!roleRequirements) throw new Error("Role research agent failed to produce requirements");

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Market Insights Agent — with cited sources
    // ═══════════════════════════════════════════════════════════════
    const marketInsightsResult = await callAI(
      LOVABLE_API_KEY,
      [
        {
          role: "system",
          content: "You are a job market research analyst. Provide current, realistic market insights. Every data point MUST include a source reference. Use well-known real sources like Glassdoor, Levels.fyi, LinkedIn, Indeed, Bureau of Labor Statistics, etc. If uncertain, say 'Industry estimate' — never fabricate specific report names.",
        },
        {
          role: "user",
          content: `Generate current job market insights for a ${interview.level} ${interview.role} position. Include sources for every data point.`,
        },
      ],
      [
        {
          type: "function",
          function: {
            name: "market_insights",
            description: "Return structured job market insights with source citations.",
            parameters: {
              type: "object",
              properties: {
                top_skills: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      skill: { type: "string" },
                      source: { type: "string" },
                    },
                    required: ["skill", "source"],
                    additionalProperties: false,
                  },
                  description: "6-8 most in-demand skills with sources",
                },
                salary_range: {
                  type: "object",
                  properties: {
                    min: { type: "string" },
                    max: { type: "string" },
                    currency: { type: "string" },
                    source: { type: "string" },
                  },
                  required: ["min", "max", "currency", "source"],
                  additionalProperties: false,
                },
                hiring_trends: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      trend: { type: "string" },
                      source: { type: "string" },
                    },
                    required: ["trend", "source"],
                    additionalProperties: false,
                  },
                  description: "3-4 current hiring trends with sources",
                },
                company_tips: { type: "array", items: { type: "string" }, description: "3-4 tips for standing out" },
                top_companies: { type: "array", items: { type: "string" }, description: "5-6 companies actively hiring" },
              },
              required: ["top_skills", "salary_range", "hiring_trends", "company_tips", "top_companies"],
              additionalProperties: false,
            },
          },
        },
      ],
      { type: "function", function: { name: "market_insights" } }
    );

    const marketInsights = parseToolCall(marketInsightsResult);

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Strict Evaluator Agent — brutally honest scoring
    // ═══════════════════════════════════════════════════════════════
    const mustHaveList = roleRequirements.must_have_skills.map((s: any) => s.skill).join(", ");
    const niceToHaveList = roleRequirements.nice_to_have_skills.map((s: any) => s.skill).join(", ");

    const personalization = [
      candidateGoal ? `The candidate's stated goal: "${candidateGoal}".` : "",
      candidateChallenge ? `Their self-identified challenge: "${candidateChallenge}".` : "",
      candidateExpLevel ? `They identify as ${candidateExpLevel} level.` : "",
    ].filter(Boolean).join(" ");

    const reportResult = await callAI(
      LOVABLE_API_KEY,
      [
        {
          role: "system",
          content: `You are a STRICT, no-nonsense interview evaluator. You are scoring "${candidateName}" for a ${interview.level} ${interview.role} position.

YOUR SCORING RUBRIC (from Role Research):
MUST-HAVE skills (3x weight each): ${mustHaveList}
NICE-TO-HAVE skills (1x weight each): ${niceToHaveList}
Level expectations: ${roleRequirements.level_expectations}

STRICT SCORING RULES:
1. ONLY count strengths that directly map to a must-have or nice-to-have skill listed above. Generic qualities like "good communicator" or "positive attitude" are NOT strengths unless communication is in the rubric.
2. If the candidate showed ZERO evidence of a required skill, score that area 0. Not 10, not 20. ZERO.
3. Every strength MUST include: (a) an exact quote from the transcript, (b) which rubric skill it maps to, (c) why it matters for this role.
4. Every weakness MUST include: (a) what was expected per the rubric, (b) what the candidate actually said or failed to say, (c) the specific rubric skill they missed.
5. Overall score = weighted average: must-have skills count 3x, nice-to-have count 1x. A candidate who nails nice-to-haves but misses must-haves should score LOW.
6. Be brutally honest in feedback. Example: "You scored 15% on technical depth. For a Senior Engineer, you could not explain basic system design concepts, which is a fundamental must-have per industry standards."
7. Do NOT praise the candidate for showing up, being polite, or "trying". Only acknowledge demonstrated competence against the rubric.
8. If the interview was short or the candidate gave one-word answers, reflect that in scores — lack of evidence = low score.
${personalization ? `\nCANDIDATE CONTEXT: ${personalization}` : ""}`,
        },
        {
          role: "user",
          content: `Evaluate this interview transcript against the scoring rubric. Be brutally honest. If the candidate deserves 0, give 0.\n\nTRANSCRIPT:\n${transcriptText}`,
        },
      ],
      [
        {
          type: "function",
          function: {
            name: "generate_report",
            description: "Generate a strictly scored interview report.",
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "integer", description: "Weighted overall score 0-100. Must-haves count 3x." },
                comm_score: { type: "integer", description: "Communication score 0-100. 0 if no evidence." },
                tech_score: { type: "integer", description: "Technical/domain knowledge score 0-100. 0 if no evidence." },
                conf_score: { type: "integer", description: "Confidence and composure score 0-100. 0 if no evidence." },
                struct_score: { type: "integer", description: "Answer structure score 0-100. 0 if no evidence." },
                clarity_score: { type: "integer", description: "Clarity of expression score 0-100. 0 if no evidence." },
                impact_score: { type: "integer", description: "Impact/persuasiveness score 0-100. 0 if no evidence." },
                strengths: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      point: { type: "string", description: "The strength observation" },
                      quote: { type: "string", description: "Exact quote from candidate that proves this" },
                      maps_to: { type: "string", description: "Which rubric skill this maps to (must-have or nice-to-have)" },
                      relevance: { type: "string", description: "Why this matters for the specific role" },
                    },
                    required: ["point", "quote", "maps_to", "relevance"],
                    additionalProperties: false,
                  },
                  description: "0-5 strengths. ONLY include if directly mapped to rubric. 0 is valid if none demonstrated.",
                },
                weaknesses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      point: { type: "string", description: "The weakness observation" },
                      expected: { type: "string", description: "What was expected per the rubric" },
                      actual: { type: "string", description: "What the candidate said or failed to say" },
                      rubric_skill: { type: "string", description: "Which rubric skill was missed" },
                    },
                    required: ["point", "expected", "actual", "rubric_skill"],
                    additionalProperties: false,
                  },
                  description: "3-8 weaknesses. Be thorough — every missed rubric skill should appear here.",
                },
                feedback_text: { type: "string", description: "Brutally honest 4-6 sentence feedback. Reference specific scores and rubric gaps. Address candidate by name." },
                roadmap: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      desc: { type: "string" },
                      resource: { type: "string" },
                    },
                    required: ["title", "desc", "resource"],
                    additionalProperties: false,
                  },
                  description: "3-5 actionable items targeting the candidate's weakest rubric areas",
                },
                scoring_breakdown: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      skill: { type: "string", description: "The rubric skill" },
                      weight: { type: "string", description: "must-have (3x) or nice-to-have (1x)" },
                      score: { type: "integer", description: "Score 0-100 for this specific skill" },
                      evidence: { type: "string", description: "Brief evidence or 'No evidence demonstrated'" },
                    },
                    required: ["skill", "weight", "score", "evidence"],
                    additionalProperties: false,
                  },
                  description: "Score for EACH rubric skill individually. This creates full transparency.",
                },
              },
              required: ["overall_score", "comm_score", "tech_score", "conf_score", "struct_score", "clarity_score", "impact_score", "strengths", "weaknesses", "feedback_text", "roadmap", "scoring_breakdown"],
              additionalProperties: false,
            },
          },
        },
      ],
      { type: "function", function: { name: "generate_report" } }
    );

    const reportData = parseToolCall(reportResult);
    if (!reportData) throw new Error("AI did not return structured output");

    // Save report with role requirements and scoring rubric
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
        role_requirements: roleRequirements,
        scoring_rubric: reportData.scoring_breakdown,
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
