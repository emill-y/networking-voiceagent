// Shapes of the backend's JSON. Keep in sync with backend/app/schemas.

export type Transcription = {
  text: string;
  language: string | null;
  audioSeconds: number;
  latencyMs: number;
};

export type ExtractedPerson = {
  name: string | null;
  company: string | null;
  role: string | null;
  school: string | null;
  major: string | null;
  metAt: string | null;
  location: string | null;
  interests: string[];
  projects: string[];
  needs: string[];
  topicsDiscussed: string[];
  notes: string[];
  followUp: string | null;
};

export type ContactExtractionResult = {
  people: ExtractedPerson[];
};

export type DuplicateCandidate = {
  contactId: string;
  name: string;
  company: string | null;
  role: string | null;
  school: string | null;
  lastInteractionAt: string | null;
  strength: "strong" | "possible";
  reason: string;
};

export type CapturedPerson = {
  contactId: string | null;
  contact: {
    name: string;
    company: string | null;
    role: string | null;
    school: string | null;
    major: string | null;
    location: string | null;
  };
  interaction: {
    event: string | null;
    location: string | null;
    interests: string[];
    projects: string[];
    needs: string[];
    topicsDiscussed: string[];
    notes: string[];
  };
  followUp: { action: string; dueAt?: string | null } | null;
};

export type SavedPerson = {
  contactId: string;
  interactionId: string;
  followUpId: string | null;
  created: boolean;
};

export type ContactSummary = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  school: string | null;
  lastInteractionAt: string | null;
  lastEvent: string | null;
  openFollowUps: number;
};

export type Interaction = {
  id: string;
  contactId: string;
  event: string | null;
  location: string | null;
  summary: string | null;
  rawTranscript: string | null;
  interests: string[];
  projects: string[];
  needs: string[];
  topicsDiscussed: string[];
  notes: string[];
  interactionDate: string;
  sourceType: string;
};

export type FollowUpStatus = "open" | "done" | "dismissed";

export type FollowUp = {
  id: string;
  contactId: string;
  contactName: string;
  interactionId: string | null;
  action: string;
  dueAt: string | null;
  status: FollowUpStatus;
  createdAt: string;
  completedAt: string | null;
};

export type ContactDetail = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  school: string | null;
  major: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  summary: string | null;
  lastInteractionAt: string | null;
  createdAt: string;
  interactions: Interaction[];
  followUps: FollowUp[];
};

export type ContactUpdate = Partial<
  Pick<
    ContactDetail,
    | "name"
    | "company"
    | "role"
    | "school"
    | "major"
    | "location"
    | "email"
    | "phone"
    | "linkedinUrl"
    | "websiteUrl"
    | "summary"
  >
>;
