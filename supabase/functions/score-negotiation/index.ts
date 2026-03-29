import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const { transcript, role, level } = await req.json();
    if (!transcript) throw new Error("transcript is required");

    const prompt = `Analyze this salary negotiation transcript for a ${role} (${level} level) position. Score the candidate's performance.

Transcript:
${transcript}

Return a JSON object with:
- assertiveness_score: 0-100 (how well they advocated for themselves)
- professionalism_score: 0-100 (how professional and respectful they were)
- outcome: "excellent" | "good" | "fair" | "poor" (overall negotiation result)
- tips: array of 2-3 specific improvement tips as strings`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a negotiation coach. Return only valid JSON, no markdown." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "score_negotiation",
              description: "Score a salary negotiation performance",
              parameters: {
                type: "object",
                properties: {
                  assertiveness_score: { type: "number" },
                  professionalism_score: { type: "number" },
                  outcome: { type: "string", enum: ["excellent", "good", "fair", "poor"] },
                  tips: { type: "array", items: { type: "string" } },
                },
                required: ["assertiveness_score", "professionalism_score", "outcome", "tips"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "score_negotiation" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("Failed to score negotiation");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let scores;

    if (toolCall?.function?.arguments) {
      scores = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback
      scores = {
        assertiveness_score: 50,
        professionalism_score: 70,
        outcome: "fair",
        tips: ["Try to counter-offer with specific numbers", "Research market rates before negotiating", "Don't accept the first offer immediately"],
      };
    }

    return new Response(
      JSON.stringify(scores),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Score negotiation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
