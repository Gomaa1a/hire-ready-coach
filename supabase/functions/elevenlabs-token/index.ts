import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText } from "npm:unpdf@0.12.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const agentId = "agent_9501kk894erbfhqsp9erm8qkpzxw";

const bodySchema = z.object({
  interviewId: z.string().uuid().optional(),
}).optional();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

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

    let interviewId: string | null = null;
    try {
      const body = await req.json();
      interviewId = body.interviewId || null;
    } catch {
      // No body
    }

    let cvContext = "";

    if (interviewId) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(interviewId)) {
        return new Response(JSON.stringify({ error: "Invalid interviewId format" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data: interview, error: intErr } = await supabase
        .from("interviews")
        .select("role, level, cv_url, user_id")
        .eq("id", interviewId)
        .single();

      if (intErr) {
        console.error("Failed to fetch interview:", intErr);
      }

      // Ownership check
      if (interview && interview.user_id !== callerUserId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let cvText = "";

      if (interview?.cv_url) {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from("cvs")
          .download(interview.cv_url);

        if (dlErr) {
          console.error("Failed to download CV:", dlErr);
        } else if (fileData) {
          try {
            const buffer = await fileData.arrayBuffer();
            const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
            cvText = text || "";
          } catch (parseErr) {
            console.error("PDF parse failed:", parseErr);
          }
          if (cvText.length > 4000) cvText = cvText.substring(0, 4000) + "\n...[truncated]";
        }
      }

      const role = interview?.role || "Unknown";
      const level = interview?.level || "Unknown";

      cvContext = [
        `The candidate is interviewing for the role of ${role} at ${level} level.`,
        cvText
          ? `Here is the candidate's CV/resume content:\n\n${cvText}\n\nUse this CV to ask relevant, personalized questions.`
          : "No CV was provided for this candidate.",
      ].join("\n\n");
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
      { headers: { "xi-api-key": ELEVENLABS_API_KEY } }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("ElevenLabs token error:", response.status, text);
      throw new Error(`Failed to get token: ${response.status}`);
    }

    const { token: elToken } = await response.json();

    return new Response(JSON.stringify({ token: elToken, cvContext }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Token error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
