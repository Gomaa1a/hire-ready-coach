import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import { ArrowLeft, ArrowRight, Check, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const roles = [
  { id: "software-engineer", label: "Software Engineer", emoji: "💻" },
  { id: "frontend-developer", label: "Frontend Developer", emoji: "🎨" },
  { id: "data-scientist", label: "Data Scientist", emoji: "📊" },
  { id: "product-manager", label: "Product Manager", emoji: "📋" },
  { id: "ux-designer", label: "UX Designer", emoji: "🎯" },
  { id: "marketing-manager", label: "Marketing Manager", emoji: "📣" },
  { id: "finance-analyst", label: "Finance Analyst", emoji: "💰" },
  { id: "devops-engineer", label: "DevOps Engineer", emoji: "☁️" },
  { id: "ai-ml-engineer", label: "AI/ML Engineer", emoji: "🤖" },
  { id: "business-analyst", label: "Business Analyst", emoji: "🏢" },
];

const levels = [
  { id: "intern", label: "Internship / Student", desc: "First professional experience" },
  { id: "junior", label: "Junior (0–2 yrs)", desc: "Early career professional" },
  { id: "mid", label: "Mid-level (2–5 yrs)", desc: "Experienced professional" },
  { id: "senior", label: "Senior (5+ yrs)", desc: "Leadership and expertise" },
];

// Mock credits - will be replaced with Supabase
const mockCredits = 3;

const NewInterview = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [cvUploaded, setCvUploaded] = useState(false);

  const handleStartInterview = () => {
    if (mockCredits === 0) {
      toast.error("You're out of credits! Buy more to continue.");
      return;
    }
    // TODO: Create interview in Supabase, deduct credit
    toast.success("Starting your interview...");
    navigate("/interview/demo");
  };

  const roleLabel = roles.find((r) => r.id === selectedRole)?.label;
  const levelLabel = levels.find((l) => l.id === selectedLevel)?.label;

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b-2 border-ink bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/dashboard">
            <Logo />
          </Link>
          <div className={`neo-badge ${mockCredits === 0 ? "bg-coral text-coral-foreground" : "bg-primary text-primary-foreground"}`}>
            {mockCredits} credits
          </div>
        </div>
      </nav>

      <main className="container mx-auto max-w-3xl px-4 py-8">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="mb-2 flex justify-between text-sm font-semibold">
            <span className={step >= 1 ? "text-primary" : "text-muted-foreground"}>1. Role</span>
            <span className={step >= 2 ? "text-primary" : "text-muted-foreground"}>2. Level</span>
            <span className={step >= 3 ? "text-primary" : "text-muted-foreground"}>3. CV</span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  s <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Pick role */}
        {step === 1 && (
          <div className="animate-fadeUp">
            <h1 className="mb-2 font-heading text-3xl font-extrabold">Pick your role</h1>
            <p className="mb-8 text-muted-foreground">Which position are you interviewing for?</p>
            <div className="mb-8 grid grid-cols-2 gap-4">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  className={`neo-card flex items-center gap-3 p-4 text-left transition-all hover:-translate-y-1 ${
                    selectedRole === role.id
                      ? "border-primary bg-primary/10 ring-2 ring-primary"
                      : "bg-card hover:bg-muted"
                  }`}
                  style={{
                    boxShadow:
                      selectedRole === role.id
                        ? "5px 5px 0 hsl(var(--primary))"
                        : "5px 5px 0 hsl(var(--ink))",
                  }}
                >
                  <span className="text-2xl">{role.emoji}</span>
                  <span className={`font-heading font-bold ${selectedRole === role.id ? "text-primary" : ""}`}>
                    {role.label}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!selectedRole}
              className="neo-btn bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Step 2: Pick level */}
        {step === 2 && (
          <div className="animate-fadeUp">
            <h1 className="mb-2 font-heading text-3xl font-extrabold">Pick your level</h1>
            <p className="mb-8 text-muted-foreground">How much experience do you have?</p>
            <div className="mb-8 space-y-3">
              {levels.map((level) => (
                <button
                  key={level.id}
                  onClick={() => setSelectedLevel(level.id)}
                  className={`neo-card flex w-full items-center justify-between p-5 text-left transition-all ${
                    selectedLevel === level.id
                      ? "border-primary bg-primary/10 ring-2 ring-primary"
                      : "bg-card hover:bg-muted"
                  }`}
                  style={{
                    boxShadow:
                      selectedLevel === level.id
                        ? "5px 5px 0 hsl(var(--primary))"
                        : "5px 5px 0 hsl(var(--ink))",
                  }}
                >
                  <div>
                    <div className={`font-heading font-bold ${selectedLevel === level.id ? "text-primary" : ""}`}>
                      {level.label}
                    </div>
                    <div className="text-sm text-muted-foreground">{level.desc}</div>
                  </div>
                  {selectedLevel === level.id && <Check className="h-6 w-6 text-primary" />}
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="neo-btn bg-background text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!selectedLevel}
                className="neo-btn bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Upload CV */}
        {step === 3 && (
          <div className="animate-fadeUp">
            <h1 className="mb-2 font-heading text-3xl font-extrabold">Upload your CV</h1>
            <p className="mb-6 text-muted-foreground">Optional, but helps us tailor questions to your experience.</p>

            {/* Summary */}
            <div className="mb-6 flex flex-wrap gap-2">
              <span className="neo-badge bg-primary text-primary-foreground">{roleLabel}</span>
              <span className="neo-badge bg-muted text-muted-foreground">{levelLabel}</span>
            </div>

            {/* Upload zone */}
            <button
              onClick={() => setCvUploaded(!cvUploaded)}
              className={`neo-card mb-6 flex w-full flex-col items-center justify-center border-2 border-dashed p-12 transition-colors ${
                cvUploaded ? "border-success bg-success/10" : "border-ink bg-card hover:bg-muted"
              }`}
            >
              {cvUploaded ? (
                <>
                  <Check className="mb-2 h-10 w-10 text-success" />
                  <span className="font-heading font-bold text-success">CV uploaded!</span>
                  <span className="text-sm text-muted-foreground">Click to remove</span>
                </>
              ) : (
                <>
                  <Upload className="mb-2 h-10 w-10 text-muted-foreground" />
                  <span className="font-heading font-bold">Click to upload your CV</span>
                  <span className="text-sm text-muted-foreground">PDF, DOC, or DOCX (max 5MB)</span>
                </>
              )}
            </button>

            {mockCredits === 0 && (
              <div className="mb-6 flex items-center gap-3 rounded-xl bg-coral/10 p-4 text-coral">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-semibold">You're out of credits! Buy more to start an interview.</span>
              </div>
            )}

            <div className="flex gap-4">
              <button onClick={() => setStep(2)} className="neo-btn bg-background text-foreground">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button
                onClick={handleStartInterview}
                disabled={mockCredits === 0}
                className="neo-btn flex-1 bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start Interview (1 credit)
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default NewInterview;
