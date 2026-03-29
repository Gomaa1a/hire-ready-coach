export interface InterviewerPersona {
  name: string;
  title: string;
  company: string;
  initials: string;
}

const FIRST_NAMES = [
  "Sarah", "James", "Priya", "Michael", "Aisha", "David", "Elena", "Kevin",
  "Fatima", "Alex", "Maya", "Daniel", "Yuki", "Omar", "Rachel", "Carlos",
  "Lina", "Thomas", "Sophia", "Andre",
];

const LAST_NAMES = [
  "Chen", "Williams", "Patel", "O'Brien", "Ahmed", "Kim", "Rodriguez",
  "Nakamura", "Thompson", "Garcia", "Singh", "Park", "Martinez", "Johansson",
  "Das", "Moore", "Tanaka", "Fischer", "Ali", "Bennett",
];

const TITLE_MAP: Record<string, string[]> = {
  default: [
    "Senior Hiring Manager",
    "Director of Talent Acquisition",
    "VP of People Operations",
    "Head of Recruitment",
  ],
  engineering: [
    "Engineering Manager",
    "VP of Engineering",
    "Principal Engineer",
    "Director of Engineering",
    "Staff Engineer",
  ],
  product: [
    "VP of Product",
    "Senior Product Director",
    "Head of Product Strategy",
    "Group Product Manager",
  ],
  design: [
    "Design Director",
    "Head of UX",
    "VP of Design",
    "Senior Design Manager",
  ],
  data: [
    "Head of Data Science",
    "Director of Analytics",
    "VP of Data Engineering",
    "Principal Data Scientist",
  ],
  marketing: [
    "VP of Marketing",
    "Director of Growth",
    "Head of Brand Strategy",
    "CMO",
  ],
  hr: [
    "HR Director",
    "VP of People",
    "Compensation Manager",
    "Head of Talent",
    "Senior HR Business Partner",
  ],
};

const COMPANIES = [
  "Meridian Technologies",
  "Vertex Solutions",
  "NovaBridge Inc.",
  "Horizon Digital",
  "Catalyst Labs",
  "Apex Innovations",
  "Skyline Systems",
  "Forge Analytics",
  "Prisma Ventures",
  "Atlas Group",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTitleCategory(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("engineer") || r.includes("developer") || r.includes("software") || r.includes("backend") || r.includes("frontend") || r.includes("fullstack") || r.includes("devops") || r.includes("sre"))
    return "engineering";
  if (r.includes("product") || r.includes("pm")) return "product";
  if (r.includes("design") || r.includes("ux") || r.includes("ui")) return "design";
  if (r.includes("data") || r.includes("ml") || r.includes("machine learning") || r.includes("analyst")) return "data";
  if (r.includes("marketing") || r.includes("growth") || r.includes("brand")) return "marketing";
  return "default";
}

export function generatePersona(role?: string): InterviewerPersona {
  const firstName = pickRandom(FIRST_NAMES);
  const lastName = pickRandom(LAST_NAMES);
  const name = `${firstName} ${lastName}`;
  const initials = `${firstName[0]}${lastName[0]}`;

  const category = getTitleCategory(role || "");
  const titles = TITLE_MAP[category] || TITLE_MAP.default;
  const title = pickRandom(titles);
  const company = pickRandom(COMPANIES);

  return { name, title, company, initials };
}
