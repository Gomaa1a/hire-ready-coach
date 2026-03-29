import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText } from "npm:unpdf@0.12.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const bodySchema = z.object({
  interviewId: z.string().uuid(),
  userMessage: z.string().optional(),
});

const PHASE_ORDER = ["opening", "technical", "behavioral", "situational", "closing"];
const PHASE_QUESTIONS: Record<string, { min: number; max: number }> = {
  opening: { min: 1, max: 2 },
  technical: { min: 4, max: 6 },
  behavioral: { min: 2, max: 3 },
  situational: { min: 1, max: 2 },
  closing: { min: 1, max: 1 },
};

function buildSystemPrompt(
  role: string,
  level: string,
  phase: string,
  questionCount: number,
  runningScores: Record<string, number>,
  topicsCovered: string[],
  cvSummary: string | null,
  candidateName: string | null
): string {
  const scoresStr = Object.keys(runningScores).length > 0
    ? `Current running scores: ${JSON.stringify(runningScores)}`
    : "No scores yet (first question).";

  const topicsStr = topicsCovered.length > 0
    ? `Topics already covered (do NOT repeat): ${topicsCovered.join(", ")}`
    : "No topics covered yet.";

  const nameRef = candidateName ? candidateName : "the candidate";
  const greeting = candidateName
    ? `Address the candidate by their first name "${candidateName.split(" ")[0]}" naturally during the interview.`
    : "";

  const cvSection = cvSummary
    ? `\n\nCANDIDATE CV SUMMARY:\n${cvSummary}\n\nUse this CV to ask personalized questions about their specific experience, projects, and skills mentioned. Reference specific items from their CV naturally.`
    : "\nNo CV provided. Ask general questions appropriate for the role and level.";

  const arabicKeywords = [
    "arabic", "عربي", "middle east", "mena", "gcc", "saudi", "uae", "dubai", "qatar", "kuwait", "bahrain", "oman",
    "jordan", "egypt", "lebanon", "morocco", "customer service", "support", "sales", "marketing", "content",
    "copywriter", "translator", "teacher", "recruiter", "hr", "public relations", "communications",
  ];
  const roleLower = role.toLowerCase();
  const cvLower = (cvSummary || "").toLowerCase();
  const mightInvolveArabic = arabicKeywords.some(kw => roleLower.includes(kw) || cvLower.includes(kw));

  const arabicSection = mightInvolveArabic
    ? `\n\nARABIC LANGUAGE TESTING:\nThis role may involve Arabic language skills. During the interview, occasionally ask 1-2 questions where you request the candidate to answer in Arabic. Frame it naturally. YOU should always speak in English, but request Arabic responses for those specific questions.`
    : "";

  let toneGuidance = "";
  const roleL = role.toLowerCase();
  if (roleL.includes("startup") || roleL.includes("creative") || roleL.includes("design")) {
    toneGuidance = `\nTONE: Keep the conversation casual and energetic. Think startup culture.`;
  } else if (roleL.includes("finance") || roleL.includes("banking") || roleL.includes("legal") || roleL.includes("consulting")) {
    toneGuidance = `\nTONE: Maintain a professional, structured tone. Think top-tier consulting interviews.`;
  } else {
    toneGuidance = `\nTONE: Be professional yet warm. Make it feel like a real human conversation.`;
  }

  return `You are a professional, experienced interviewer conducting a mock interview for a ${level} ${role} position.
${greeting}
${toneGuidance}

PERSONALITY GUIDELINES:
- React naturally to answers: acknowledge good points, probe weak ones
- Use brief transition phrases between topics
- Refer to ${nameRef}'s specific experiences when moving between subjects
- Vary your energy: be warmer in opening/closing, more focused in technical/behavioral

CURRENT STATE:
- Interview Phase: ${phase.toUpperCase()}
- Questions asked so far: ${questionCount}
- ${scoresStr}
- ${topicsStr}
${cvSection}
${arabicSection}

INTERVIEW METHODOLOGY:

PHASE DESCRIPTIONS:
1. OPENING (1-2 questions): Warm-up questions. Be warm and encouraging.
2. TECHNICAL (4-6 questions): Role-specific technical/domain questions. Calibrate difficulty to ${level} level.
3. BEHAVIORAL (2-3 questions): Use the STAR method framework. Probe for specific examples.
4. SITUATIONAL (1-2 questions): Present hypothetical scenarios relevant to the ${role} role.
5. CLOSING (1 question): Wrap up warmly.

ADAPTIVE RULES:
- If a candidate's answer is weak (below 50), ask a probing follow-up before moving on.
- If strong (above 80), acknowledge briefly and move to a harder topic.
- Never repeat a topic already covered.
- Keep questions concise and natural.

SCORING RUBRIC (score each answer 0-100):
- comm: Communication clarity
- tech: Technical accuracy and depth
- conf: Confidence and composure
- struct: Answer structure
- clarity: Clarity of thought
- impact: Persuasiveness and concrete examples

IMPORTANT: You are having a voice conversation. Keep your questions natural and concise (2-3 sentences max).`;
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
    const tokenStr = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(tokenStr);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerUserId = claims.claims.sub as string;

    // Input validation
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { interviewId, userMessage } = parsed.data;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Load interview config
    const { data: interview, error: intErr } = await supabase
      .from("interviews")
      .select("role, level, cv_url, user_id")
      .eq("id", interviewId)
      .single();
    if (intErr || !interview) throw new Error("Interview not found");

    // Ownership check
    if (interview.user_id !== callerUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Load candidate name + state in parallel
    const [profileResult, stateResult] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", interview.user_id).single(),
      supabase.from("interview_state").select("*").eq("interview_id", interviewId).single(),
    ]);

    const candidateName = profileResult.data?.full_name || null;
    let state = stateResult.data;

    if (!state) {
      let cvSummary: string | null = null;
      if (interview.cv_url) {
        try {
          const { data: fileData } = await supabase.storage.from("cvs").download(interview.cv_url);
          if (fileData) {
            const buffer = await fileData.arrayBuffer();
            const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
            cvSummary = text || null;
            if (cvSummary && cvSummary.length > 4000) cvSummary = cvSummary.substring(0, 4000) + "\n...[truncated]";
          }
        } catch (e) {
          console.error("CV parse failed:", e);
        }
      }

      const { data: newState, error: createErr } = await supabase
        .from("interview_state")
        .insert({ interview_id: interviewId, current_phase: "opening", question_count: 0, running_scores: {}, topics_covered: [], cv_summary: cvSummary })
        .select()
        .single();
      if (createErr) throw new Error(`Failed to create state: ${createErr.message}`);
      state = newState;
    }

    // 3. Save user message if provided
    if (userMessage && userMessage.trim()) {
      await supabase.from("messages").insert({ interview_id: interviewId, role: "user", content: userMessage.trim() });
    }

    // 4. Load conversation history
    const { data: messages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("interview_id", interviewId)
      .order("created_at", { ascending: true });

    const conversationHistory = (messages || []).map((m) => ({
      role: m.role === "assistant" ? "assistant" as const : "user" as const,
      content: m.content,
    }));

    // 5. Build system prompt
    const systemPrompt = buildSystemPrompt(
      interview.role, interview.level, state.current_phase, state.question_count,
      state.running_scores as Record<string, number>, state.topics_covered as string[],
      state.cv_summary, candidateName
    );

    // 6. Call Lovable AI
    const aiMessages = [{ role: "system", content: systemPrompt }, ...conversationHistory];
    if (!userMessage || !userMessage.trim()) {
      aiMessages.push({ role: "user", content: `The interview is starting now. Please greet ${candidateName ? candidateName.split(" ")[0] : "the candidate"} warmly and ask your first opening question.` });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        tools: [{
          type: "function",
          function: {
            name: "interview_turn",
            description: "Return the next interviewer question along with scoring and phase tracking data.",
            parameters: {
              type: "object",
              properties: {
                next_question: { type: "string" },
                phase: { type: "string", enum: PHASE_ORDER },
                scores: {
                  type: "object",
                  properties: {
                    comm: { type: "integer" }, tech: { type: "integer" }, conf: { type: "integer" },
                    struct: { type: "integer" }, clarity: { type: "integer" }, impact: { type: "integer" },
                  },
                },
                follow_up: { type: "boolean" },
                topic: { type: "string" },
              },
              required: ["next_question", "phase", "scores", "follow_up", "topic"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "interview_turn" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Usage limit reached" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured output");

    const turnData = JSON.parse(toolCall.function.arguments);

    // 7. Save AI question
    await supabase.from("messages").insert({ interview_id: interviewId, role: "assistant", content: turnData.next_question });

    // 8. Update interview state
    const currentScores = (state.running_scores || {}) as Record<string, number[]>;
    const newScores = { ...currentScores };
    if (turnData.scores && Object.keys(turnData.scores).length > 0) {
      for (const [key, val] of Object.entries(turnData.scores)) {
        if (!newScores[key]) newScores[key] = [];
        (newScores[key] as number[]).push(val as number);
      }
    }

    const currentTopics = (state.topics_covered || []) as string[];
    const newTopics = turnData.topic && !turnData.follow_up && !currentTopics.includes(turnData.topic)
      ? [...currentTopics, turnData.topic]
      : currentTopics;

    let nextPhase = turnData.phase;
    const phaseConfig = PHASE_QUESTIONS[state.current_phase];
    const questionsInPhase = state.question_count - (
      PHASE_ORDER.slice(0, PHASE_ORDER.indexOf(state.current_phase))
        .reduce((sum, p) => sum + PHASE_QUESTIONS[p].max, 0)
    );
    if (questionsInPhase >= phaseConfig.max) {
      const currentIndex = PHASE_ORDER.indexOf(state.current_phase);
      if (currentIndex < PHASE_ORDER.length - 1) nextPhase = PHASE_ORDER[currentIndex + 1];
    }

    await supabase.from("interview_state").update({
      current_phase: nextPhase, question_count: state.question_count + 1,
      running_scores: newScores, topics_covered: newTopics, updated_at: new Date().toISOString(),
    }).eq("interview_id", interviewId);

    return new Response(
      JSON.stringify({ next_question: turnData.next_question, phase: nextPhase, question_count: state.question_count + 1, follow_up: turnData.follow_up, topic: turnData.topic }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Orchestrator error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
