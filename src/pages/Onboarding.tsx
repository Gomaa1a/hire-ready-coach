import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 8; // 7 questions + 1 welcome

interface OnboardingData {
  current_role: string | null;
  target_role: string | null;
  experience_level: string | null;
  primary_goal: string | null;
  biggest_challenge: string | null;
  interview_frequency: string | null;
  heard_from: string | null;
}

const OptionCard = ({
  emoji,
  title,
  subtitle,
  selected,
  onClick,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full text-left rounded-2xl p-5 border transition-all duration-200",
      selected
        ? "border-primary bg-primary/10"
        : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.07)]"
    )}
  >
    <div className="flex items-center gap-3">
      <span className="text-xl">{emoji}</span>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  </button>
);

const Chip = ({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "px-4 py-2 rounded-full text-sm border transition-all duration-200",
      selected
        ? "border-primary bg-primary/10 text-primary"
        : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-muted-foreground hover:border-[rgba(255,255,255,0.2)]"
    )}
  >
    {label}
  </button>
);

const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"left" | "right">("left");
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState<OnboardingData>({
    current_role: null,
    target_role: null,
    experience_level: null,
    primary_goal: null,
    biggest_challenge: null,
    interview_frequency: null,
    heard_from: null,
  });

  const [targetRoleInput, setTargetRoleInput] = useState("");
  const [heardFromSelections, setHeardFromSelections] = useState<string[]>([]);

  const update = (key: keyof OnboardingData, value: string | null) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const canContinue = useCallback(() => {
    switch (step) {
      case 1: return !!data.current_role;
      case 2: return !!targetRoleInput.trim();
      case 3: return !!data.experience_level;
      case 4: return !!data.primary_goal;
      case 5: return !!data.biggest_challenge;
      case 6: return !!data.interview_frequency;
      case 7: return heardFromSelections.length > 0;
      default: return true;
    }
  }, [step, data, targetRoleInput, heardFromSelections]);

  const goNext = () => {
    if (step === 2) update("target_role", targetRoleInput.trim());
    if (step === 7) update("heard_from", heardFromSelections.join(", "));
    setDirection("left");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const skip = () => {
    if (step === 2) setTargetRoleInput("");
    if (step === 7) setHeardFromSelections([]);
    const key = [null, "current_role", "target_role", "experience_level", "primary_goal", "biggest_challenge", "interview_frequency", "heard_from"][step] as keyof OnboardingData;
    if (key) update(key, null);
    setDirection("left");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    setDirection("right");
    setStep((s) => Math.max(s - 1, 1));
  };

  const finish = async () => {
    if (!user) return;
    setSaving(true);
    const finalData = {
      ...data,
      target_role: targetRoleInput.trim() || null,
      heard_from: heardFromSelections.length > 0 ? heardFromSelections.join(", ") : null,
      onboarding_completed: true,
    };
    const { error } = await supabase
      .from("profiles")
      .update(finalData as any)
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Something went wrong. Please try again.");
      return;
    }
    toast.success("Welcome aboard! 🚀");
    navigate("/dashboard");
  };

  const toggleHeardFrom = (val: string) => {
    setHeardFromSelections((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  };

  const quickRoles = [
    "Software Engineer", "Product Manager", "Data Analyst",
    "UX Designer", "Marketing Manager", "Sales Executive", "Business Analyst",
  ];
  const heardFromOptions = ["Instagram", "TikTok", "LinkedIn", "Friend", "Google", "YouTube", "Other"];

  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  const progressPercent = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[560px] pt-10 md:pt-20">
          {/* Back button */}
          {step > 1 && step < TOTAL_STEPS && (
            <button
              onClick={goBack}
              className="mb-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          )}

          <div
            key={step}
            className="animate-fade-in"
          >
            {/* STEP 1 */}
            {step === 1 && (
              <div className="space-y-8">
                <div>
                  <h1 className="text-3xl font-bold text-foreground">Let's personalize your experience</h1>
                  <p className="text-muted-foreground mt-2">Takes 60 seconds. Helps us make your practice more relevant.</p>
                </div>
                <p className="text-lg font-semibold text-foreground">What's your current situation?</p>
                <div className="space-y-3">
                  <OptionCard emoji="🎓" title="Fresh Graduate" subtitle="Just finished university" selected={data.current_role === "fresh_graduate"} onClick={() => update("current_role", "fresh_graduate")} />
                  <OptionCard emoji="💼" title="Employed, Looking to Switch" subtitle="Want a better opportunity" selected={data.current_role === "employed_switching"} onClick={() => update("current_role", "employed_switching")} />
                  <OptionCard emoji="🔍" title="Currently Job Hunting" subtitle="Actively applying right now" selected={data.current_role === "job_hunting"} onClick={() => update("current_role", "job_hunting")} />
                  <OptionCard emoji="🚀" title="Career Switcher" subtitle="Moving to a different field" selected={data.current_role === "career_switcher"} onClick={() => update("current_role", "career_switcher")} />
                </div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <div className="space-y-8">
                <div>
                  <h1 className="text-3xl font-bold text-foreground">What role are you practicing for?</h1>
                </div>
                <Input
                  value={targetRoleInput}
                  onChange={(e) => setTargetRoleInput(e.target.value)}
                  placeholder="e.g. Product Manager, Software Engineer, Data Analyst"
                  className="h-12 border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] text-base"
                />
                <div className="flex flex-wrap gap-2">
                  {quickRoles.map((role) => (
                    <Chip
                      key={role}
                      label={role}
                      selected={targetRoleInput === role}
                      onClick={() => setTargetRoleInput(role)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <div className="space-y-8">
                <h1 className="text-3xl font-bold text-foreground">How much experience do you have?</h1>
                <div className="space-y-3">
                  <OptionCard emoji="🌱" title="Entry Level" subtitle="0–2 years" selected={data.experience_level === "entry"} onClick={() => update("experience_level", "entry")} />
                  <OptionCard emoji="📊" title="Mid Level" subtitle="3–6 years" selected={data.experience_level === "mid"} onClick={() => update("experience_level", "mid")} />
                  <OptionCard emoji="⭐" title="Senior Level" subtitle="7+ years" selected={data.experience_level === "senior"} onClick={() => update("experience_level", "senior")} />
                </div>
              </div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <div className="space-y-8">
                <h1 className="text-3xl font-bold text-foreground">What do you want to get out of HireReady?</h1>
                <div className="space-y-3">
                  <OptionCard emoji="💪" title="Build Confidence" subtitle="I get nervous in interviews" selected={data.primary_goal === "build_confidence"} onClick={() => update("primary_goal", "build_confidence")} />
                  <OptionCard emoji="🎯" title="Get Specific Feedback" subtitle="I want to know what to improve" selected={data.primary_goal === "get_feedback"} onClick={() => update("primary_goal", "get_feedback")} />
                  <OptionCard emoji="🗣️" title="Practice Answers" subtitle="I want to refine my responses" selected={data.primary_goal === "practice_answers"} onClick={() => update("primary_goal", "practice_answers")} />
                  <OptionCard emoji="📋" title="Prepare for a Specific Interview" subtitle="I have one coming up" selected={data.primary_goal === "prepare_specific"} onClick={() => update("primary_goal", "prepare_specific")} />
                </div>
              </div>
            )}

            {/* STEP 5 */}
            {step === 5 && (
              <div className="space-y-8">
                <h1 className="text-3xl font-bold text-foreground">Where do you struggle most?</h1>
                <div className="space-y-3">
                  <OptionCard emoji="😰" title="Nervousness & Anxiety" subtitle="" selected={data.biggest_challenge === "nervousness"} onClick={() => update("biggest_challenge", "nervousness")} />
                  <OptionCard emoji="🤔" title="Structuring My Answers" subtitle="" selected={data.biggest_challenge === "structuring"} onClick={() => update("biggest_challenge", "structuring")} />
                  <OptionCard emoji="📚" title="Lack of Preparation" subtitle="" selected={data.biggest_challenge === "preparation"} onClick={() => update("biggest_challenge", "preparation")} />
                  <OptionCard emoji="💬" title="Technical Questions" subtitle="" selected={data.biggest_challenge === "technical"} onClick={() => update("biggest_challenge", "technical")} />
                </div>
              </div>
            )}

            {/* STEP 6 */}
            {step === 6 && (
              <div className="space-y-8">
                <h1 className="text-3xl font-bold text-foreground">Set yourself a practice goal</h1>
                <div className="space-y-3">
                  <OptionCard emoji="🔥" title="Daily" subtitle="I'm fully committed" selected={data.interview_frequency === "daily"} onClick={() => update("interview_frequency", "daily")} />
                  <OptionCard emoji="📅" title="A Few Times a Week" subtitle="Steady progress" selected={data.interview_frequency === "few_times_week"} onClick={() => update("interview_frequency", "few_times_week")} />
                  <OptionCard emoji="🎯" title="When I Have Interviews Coming" subtitle="As needed" selected={data.interview_frequency === "as_needed"} onClick={() => update("interview_frequency", "as_needed")} />
                </div>
              </div>
            )}

            {/* STEP 7 */}
            {step === 7 && (
              <div className="space-y-8">
                <h1 className="text-3xl font-bold text-foreground">How did you hear about HireReady?</h1>
                <div className="flex flex-wrap gap-2">
                  {heardFromOptions.map((opt) => (
                    <Chip
                      key={opt}
                      label={opt}
                      selected={heardFromSelections.includes(opt)}
                      onClick={() => toggleHeardFrom(opt)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* FINAL SCREEN */}
            {step === TOTAL_STEPS && (
              <div className="text-center space-y-6 py-10">
                <div className="text-6xl">🚀</div>
                <h1 className="text-4xl font-bold text-foreground">You're all set, {firstName}!</h1>
                <p className="text-lg text-muted-foreground max-w-md mx-auto">
                  {data.target_role
                    ? `We'll help you land that ${data.target_role} role. Your first practice interview is ready.`
                    : "Your first practice interview is ready. Let's get started!"}
                </p>
                <button
                  onClick={finish}
                  disabled={saving}
                  className="mt-4 inline-flex items-center justify-center rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Setting up..." : "Start My First Interview →"}
                </button>
              </div>
            )}
          </div>

          {/* Navigation buttons (not on final screen) */}
          {step < TOTAL_STEPS && (
            <div className="flex items-center justify-between mt-10">
              <button
                onClick={skip}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
              <button
                onClick={goNext}
                disabled={!canContinue()}
                className="rounded-xl bg-primary px-8 py-3 font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
