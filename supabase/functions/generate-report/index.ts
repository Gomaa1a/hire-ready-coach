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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { interviewId, userId } = await req.json();
    if (!interviewId || !userId) throw new Error("interviewId and userId are required");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch interview details
    const { data: interview, error: intErr } = await supabase
      .from("interviews")
      .select("role, level")
      .eq("id", interviewId)
      .single();

    if (intErr) throw new Error(`Failed to fetch interview: ${intErr.message}`);

    // Fetch transcript messages
    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("role, content")
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: true });

    if (msgErr) throw new Error(`Failed to fetch messages: ${msgErr.message}`);
    if (!messages || messages.length === 0) throw new Error("No transcript found");

    const transcriptText = messages
      .map((m) => `${m.role === "assistant" ? "Interviewer" : "Candidate"}: ${m.content}`)
      .join("\n");

    // Call Lovable AI with tool calling for structured output
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
            content: `You are an expert interview coach analyzing a mock interview transcript. The candidate interviewed for the role of ${interview.role} at ${interview.level} level. Evaluate their performance thoroughly and provide actionable feedback.`,
          },
          {
            role: "user",
            content: `Analyze this interview transcript and generate a detailed performance report:\n\n${transcriptText}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_report",
              description: "Generate a structured interview performance report with scores, feedback, strengths, weaknesses, and a learning roadmap.",
              parameters: {
                type: "object",
                properties: {
                  overall_score: {
                    type: "integer",
                    description: "Overall performance score 0-100",
                  },
                  comm_score: {
                    type: "integer",
                    description: "Communication skills score 0-100",
                  },
                  tech_score: {
                    type: "integer",
                    description: "Technical knowledge score 0-100",
                  },
                  conf_score: {
                    type: "integer",
                    description: "Confidence and composure score 0-100",
                  },
                  struct_score: {
                    type: "integer",
                    description: "Answer structure and organization score 0-100",
                  },
                  clarity_score: {
                    type: "integer",
                    description: "Clarity of expression score 0-100",
                  },
                  impact_score: {
                    type: "integer",
                    description: "Impact and persuasiveness score 0-100",
                  },
                  strengths: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 specific strengths observed in the interview",
                  },
                  weaknesses: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 specific areas for improvement",
                  },
                  feedback_text: {
                    type: "string",
                    description: "A detailed paragraph of overall feedback (3-5 sentences)",
                  },
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
                    description: "3-5 actionable learning roadmap items",
                  },
                },
                required: [
                  "overall_score", "comm_score", "tech_score", "conf_score",
                  "struct_score", "clarity_score", "impact_score",
                  "strengths", "weaknesses", "feedback_text", "roadmap",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_report" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured output");
    }

    const reportData = JSON.parse(toolCall.function.arguments);

    // Save report to database
    const { data: savedReport, error: saveErr } = await supabase
      .from("reports")
      .insert({
        interview_id: interviewId,
        user_id: userId,
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
      })
      .select("id")
      .single();

    if (saveErr) throw new Error(`Failed to save report: ${saveErr.message}`);

    return new Response(JSON.stringify({ success: true, reportId: savedReport.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Report generation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
