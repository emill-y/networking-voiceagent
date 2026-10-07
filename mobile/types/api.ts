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
  followUpDue: string | null; // "YYYY-MM-DD", resolved by the backend
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
  major?: string | null;
  location?: string | null;
  email: string | null;
  phone: string | null;
  lastInteractionAt: string | null;
  createdAt?: string | null;
  firstMetAt?: string | null;
  lastEvent: string | null;
  openFollowUps: number;
  moments?: number;
  interests?: string[];
  events?: string[];
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
  // "Founder at Lumen · Met at Cal Hacks · Looking for designers" (stored facts only)
  context?: string | null;
  onCalendar?: boolean;
  calendarLink?: string | null;
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

export type SearchResult = {
  contact: ContactSummary;
  reasons: string[];
};

export type SearchResponse = {
  interpreted: boolean;
  results: SearchResult[];
};

export type EdgeKind = "organization" | "event" | "interests";

export type NetworkPerson = {
  id: string;
  kind: "person";
  name: string;
  subtitle: string | null;
  moments: number;
  lastInteractionAt: string | null;
  openFollowUps: number;
};

export type NetworkGroup = {
  id: string;
  kind: "group";
  label: string;
  edgeKind: EdgeKind;
  members: number;
};

export type NetworkEdge = {
  source: string;
  target: string;
  kind: EdgeKind;
  reasons: string[];
};

export type NetworkResponse = {
  people: NetworkPerson[];
  groups: NetworkGroup[];
  edges: NetworkEdge[];
};

export type CalendarState = "connected" | "disconnected" | "needs_reauth" | "unavailable";

export type CalendarStatus = {
  available: boolean;
  state: CalendarState;
  connected: boolean;
  email: string | null;
  pushFollowUps: boolean;
};

export type UpcomingEvent = {
  id: string | null;
  title: string;
  start: string | null;
  allDay: boolean;
  location: string | null;
  link: string | null;
  people: { contactId: string; name: string; why: string }[];
};

// ---------- Go together (real events) ----------

export type EventWhere = "local" | "nearby" | "online" | "travel" | "anywhere";

export type PlanPerson = { contactId: string; name: string; why: string | null };

export type RealEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  city: string | null;
  country: string | null;
  online: boolean;
  url: string | null;
  venue: string | null;
  imageUrl: string | null;
  category: string;
  source: string;
  sourceLabel: string;
  topics: string[];
  where: EventWhere;
  people: PlanPerson[];
};

export type Plan = { event: RealEvent; people: PlanPerson[]; shared: string; why: string };

export type EventSource = { label: string; kind: string; url: string | null; events: number };

export type EventCategory = { key: string; label: string; count: number };

export type PlansResponse = { plans: Plan[]; events: RealEvent[]; categories: EventCategory[]; sources: EventSource[] };

// ---------- Profile, invites, sharing ----------

export type MyProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  inviteCode: string;
  inviteLink: string;
  invitedCount: number;
};

export type ShareCreated = { id: string; link: string; emailed: boolean; count: number };

export type IncomingShare = {
  id: string;
  senderName: string;
  message: string | null;
  count: number;
  names: string[];
  createdAt: string;
};

export type EventFeed = { id: string; url: string; label: string; createdAt: string };

// ---------- Ambient sessions ----------

export type AmbientSession = {
  id: string;
  title: string | null;
  status: "recording" | "ready";
  chunks: number;
  audioSeconds: number;
  words: number;
  people: ExtractedPerson[];
  startedAt: string;
  endedAt: string | null;
  uploadToken?: string;
  transcript?: string;
};
