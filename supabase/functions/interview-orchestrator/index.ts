import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText } from "npm:unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  cvSummary: string | null
): string {
  const scoresStr = Object.keys(runningScores).length > 0
    ? `Current running scores: ${JSON.stringify(runningScores)}`
    : "No scores yet (first question).";

  const topicsStr = topicsCovered.length > 0
    ? `Topics already covered (do NOT repeat): ${topicsCovered.join(", ")}`
    : "No topics covered yet.";

  const cvSection = cvSummary
    ? `\n\nCANDIDATE CV SUMMARY:\n${cvSummary}\n\nUse this CV to ask personalized questions about their specific experience, projects, and skills mentioned. Reference specific items from their CV.`
    : "\nNo CV provided. Ask general questions appropriate for the role and level.";

  return `You are a professional, experienced interviewer conducting a mock interview for a ${level} ${role} position.

CURRENT STATE:
- Interview Phase: ${phase.toUpperCase()}
- Questions asked so far: ${questionCount}
- ${scoresStr}
- ${topicsStr}
${cvSection}

INTERVIEW METHODOLOGY:

PHASE DESCRIPTIONS:
1. OPENING (1-2 questions): Warm-up questions. "Tell me about yourself", motivation for this role, career goals. Be warm and encouraging.
2. TECHNICAL (4-6 questions): Role-specific technical/domain questions. For engineers: system design, coding concepts, architecture. For PMs: product sense, metrics, prioritization. For designers: design process, user research. Calibrate difficulty to ${level} level. If previous answer scored below 50, ask a simpler follow-up. If above 80, escalate difficulty.
3. BEHAVIORAL (2-3 questions): Use the STAR method framework. Ask about leadership, conflict resolution, teamwork, failure handling. Probe for specific examples with follow-ups like "What was the outcome?" or "What would you do differently?"
4. SITUATIONAL (1-2 questions): Present hypothetical scenarios relevant to the ${role} role at ${level} level. Test problem-solving and decision-making under ambiguity.
5. CLOSING (1 question): Wrap up warmly. Ask if the candidate has questions, provide brief encouragement.

ADAPTIVE RULES:
- If a candidate's answer is vague or weak (you'd score it below 50), ask a probing follow-up on the SAME topic before moving on.
- If an answer is strong (above 80), acknowledge it briefly and move to a harder topic.
- Never repeat a topic already covered.
- Keep questions concise and natural — like a real interviewer, not a quiz.
- Transition between phases naturally with brief connecting statements.

SCORING RUBRIC (score each answer 0-100):
- comm: Communication clarity, articulation, conciseness
- tech: Technical accuracy and depth (for non-technical phases, score based on domain knowledge)
- conf: Confidence, composure, professionalism
- struct: Answer structure (STAR method usage, logical flow)
- clarity: Clarity of thought and expression
- impact: Persuasiveness, concrete examples, measurable results

IMPORTANT: You are having a voice conversation. Keep your questions natural, conversational, and concise (2-3 sentences max). Do NOT use bullet points, markdown, or lists in your spoken question.`;
}

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

    const { interviewId, userMessage } = await req.json();
    if (!interviewId) throw new Error("interviewId is required");

    // 1. Load interview config
    const { data: interview, error: intErr } = await supabase
      .from("interviews")
      .select("role, level, cv_url")
      .eq("id", interviewId)
      .single();
    if (intErr || !interview) throw new Error("Interview not found");

    // 2. Load or create interview state
    let { data: state } = await supabase
      .from("interview_state")
      .select("*")
      .eq("interview_id", interviewId)
      .single();

    if (!state) {
      // First call — create state and parse CV if available
      let cvSummary: string | null = null;
      if (interview.cv_url) {
        try {
          const { data: fileData } = await supabase.storage
            .from("cvs")
            .download(interview.cv_url);
          if (fileData) {
            const buffer = await fileData.arrayBuffer();
            const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
            cvSummary = text || null;
            if (cvSummary && cvSummary.length > 4000) {
              cvSummary = cvSummary.substring(0, 4000) + "\n...[truncated]";
            }
          }
        } catch (e) {
          console.error("CV parse failed:", e);
        }
      }

      const { data: newState, error: createErr } = await supabase
        .from("interview_state")
        .insert({
          interview_id: interviewId,
          current_phase: "opening",
          question_count: 0,
          running_scores: {},
          topics_covered: [],
          cv_summary: cvSummary,
        })
        .select()
        .single();

      if (createErr) throw new Error(`Failed to create state: ${createErr.message}`);
      state = newState;
    }

    // 3. Save user message if provided
    if (userMessage && userMessage.trim()) {
      await supabase.from("messages").insert({
        interview_id: interviewId,
        role: "user",
        content: userMessage.trim(),
      });
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
      interview.role,
      interview.level,
      state.current_phase,
      state.question_count,
      state.running_scores as Record<string, number>,
      state.topics_covered as string[],
      state.cv_summary
    );

    // 6. Call Lovable AI with tool calling
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
    ];

    // If no user message (first call), add instruction to start
    if (!userMessage || !userMessage.trim()) {
      aiMessages.push({
        role: "user",
        content: "The interview is starting now. Please greet the candidate warmly and ask your first opening question.",
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        tools: [
          {
            type: "function",
            function: {
              name: "interview_turn",
              description: "Return the next interviewer question along with scoring and phase tracking data.",
              parameters: {
                type: "object",
                properties: {
                  next_question: {
                    type: "string",
                    description: "The interviewer's next spoken response/question. Keep it natural and conversational.",
                  },
                  phase: {
                    type: "string",
                    enum: PHASE_ORDER,
                    description: "The current or next interview phase.",
                  },
                  scores: {
                    type: "object",
                    properties: {
                      comm: { type: "integer", description: "Communication score 0-100" },
                      tech: { type: "integer", description: "Technical score 0-100" },
                      conf: { type: "integer", description: "Confidence score 0-100" },
                      struct: { type: "integer", description: "Structure score 0-100" },
                      clarity: { type: "integer", description: "Clarity score 0-100" },
                      impact: { type: "integer", description: "Impact score 0-100" },
                    },
                    description: "Scores for the candidate's last answer. Empty object if this is the first question.",
                  },
                  follow_up: {
                    type: "boolean",
                    description: "Whether this question is a follow-up probe on the same topic.",
                  },
                  topic: {
                    type: "string",
                    description: "The topic/subject of this question (e.g., 'system design', 'leadership', 'career goals').",
                  },
                },
                required: ["next_question", "phase", "scores", "follow_up", "topic"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "interview_turn" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured output");
    }

    const turnData = JSON.parse(toolCall.function.arguments);

    // 7. Save AI question to messages
    await supabase.from("messages").insert({
      interview_id: interviewId,
      role: "assistant",
      content: turnData.next_question,
    });

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

    // Determine phase transition
    let nextPhase = turnData.phase;
    const phaseConfig = PHASE_QUESTIONS[state.current_phase];
    const questionsInPhase = state.question_count - (
      PHASE_ORDER.slice(0, PHASE_ORDER.indexOf(state.current_phase))
        .reduce((sum, p) => sum + PHASE_QUESTIONS[p].max, 0)
    );

    if (questionsInPhase >= phaseConfig.max) {
      const currentIndex = PHASE_ORDER.indexOf(state.current_phase);
      if (currentIndex < PHASE_ORDER.length - 1) {
        nextPhase = PHASE_ORDER[currentIndex + 1];
      }
    }

    await supabase
      .from("interview_state")
      .update({
        current_phase: nextPhase,
        question_count: state.question_count + 1,
        running_scores: newScores,
        topics_covered: newTopics,
        updated_at: new Date().toISOString(),
      })
      .eq("interview_id", interviewId);

    return new Response(
      JSON.stringify({
        next_question: turnData.next_question,
        phase: nextPhase,
        question_count: state.question_count + 1,
        follow_up: turnData.follow_up,
        topic: turnData.topic,
      }),
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
