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
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const agentId = "agent_9501kk894erbfhqsp9erm8qkpzxw";

    // Parse request body for interviewId
    let interviewId: string | null = null;
    try {
      const body = await req.json();
      interviewId = body.interviewId || null;
    } catch {
      // No body or invalid JSON — proceed without CV context
    }

    let conversationConfigOverride: Record<string, any> | undefined;

    if (interviewId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Fetch interview record
      const { data: interview, error: intErr } = await supabase
        .from("interviews")
        .select("role, level, cv_url")
        .eq("id", interviewId)
        .single();

      if (intErr) {
        console.error("Failed to fetch interview:", intErr);
      }

      let cvText = "";

      if (interview?.cv_url) {
        // cv_url is the storage path inside the 'cvs' bucket
        const { data: fileData, error: dlErr } = await supabase.storage
          .from("cvs")
          .download(interview.cv_url);

        if (dlErr) {
          console.error("Failed to download CV:", dlErr);
        } else if (fileData) {
          cvText = await fileData.text();
          // Truncate to ~4000 chars to stay within prompt limits
          if (cvText.length > 4000) {
            cvText = cvText.substring(0, 4000) + "\n...[truncated]";
          }
        }
      }

      const role = interview?.role || "Unknown";
      const level = interview?.level || "Unknown";

      const contextPrompt = [
        `The candidate is interviewing for the role of ${role} at ${level} level.`,
        cvText
          ? `Here is the candidate's CV/resume content:\n\n${cvText}\n\nUse this CV to ask relevant, personalized questions about their experience, projects, and skills.`
          : "No CV was provided for this candidate.",
      ].join("\n\n");

      conversationConfigOverride = {
        agent: {
          prompt: {
            prompt: contextPrompt,
          },
        },
      };
    }

    // Request conversation token from ElevenLabs
    const elBody: Record<string, any> = { agent_id: agentId };
    if (conversationConfigOverride) {
      elBody.conversation_config_override = conversationConfigOverride;
    }

    const response = await fetch(
      "https://api.elevenlabs.io/v1/convai/conversation/get_signed_url",
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(elBody),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("ElevenLabs token error:", response.status, text);
      throw new Error(`Failed to get token: ${response.status}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Token error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
