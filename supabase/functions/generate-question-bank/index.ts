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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { interviewId } = await req.json();
    if (!interviewId) throw new Error("interviewId is required");

    // Fetch interview details + CV
    const { data: interview, error: intErr } = await supabase
      .from("interviews")
      .select("role, level, cv_url, user_id")
      .eq("id", interviewId)
      .single();

    if (intErr || !interview) throw new Error("Interview not found");

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
      ? `\n\nThe candidate's CV/resume:\n${cvContext}\n\nUse this to personalize questions about their specific experience, projects, and skills.`
      : "";

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
            content: `You are an expert technical interviewer. Generate a structured interview question bank for a ${interview.level} ${interview.role} position.${cvSection}`,
          },
          {
            role: "user",
            content: `Generate 6-8 interview questions appropriate for a ${interview.level} ${interview.role}. Include a mix of technical, behavioral, and situational questions. Make them specific and challenging for the level.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "question_bank",
              description: "Return a structured interview question bank.",
              parameters: {
                type: "object",
                properties: {
                  opening: {
                    type: "string",
                    description: "A warm, professional opening statement the AI interviewer will say at the start. Include greeting and brief intro about the interview format.",
                  },
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "Unique question ID like q1, q2, etc." },
                        question: { type: "string", description: "The interview question to ask" },
                        followUps: {
                          type: "array",
                          items: { type: "string" },
                          description: "2 potential follow-up questions",
                        },
                        goodAnswerSignals: {
                          type: "array",
                          items: { type: "string" },
                          description: "Signals of a good answer",
                        },
                        redFlags: {
                          type: "array",
                          items: { type: "string" },
                          description: "Red flags to watch for",
                        },
                      },
                      required: ["id", "question", "followUps", "goodAnswerSignals", "redFlags"],
                      additionalProperties: false,
                    },
                  },
                  closing: {
                    type: "string",
                    description: "A warm closing statement the AI will say at the end of the interview.",
                  },
                },
                required: ["opening", "questions", "closing"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "question_bank" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured output");

    const questionBank = JSON.parse(toolCall.function.arguments);

    // Save question bank to interview
    const { error: updateErr } = await supabase
      .from("interviews")
      .update({ question_bank: questionBank })
      .eq("id", interviewId);

    if (updateErr) throw new Error(`Failed to save question bank: ${updateErr.message}`);

    return new Response(JSON.stringify({ success: true, questionBank }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Question bank error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
