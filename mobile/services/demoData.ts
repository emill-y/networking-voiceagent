// The demo network behind /app/demo: made-up people and the sessions where
// they were met, answering the same API calls the real backend does.
// Deterministic (dates are relative to today), kept in memory, and never
// sent anywhere. Changes made during a demo last until the page reloads.
import type { RequestOptions } from "@/lib/api";
import type {
  AmbientSession,
  CapturedPerson,
  ContactDetail,
  ContactSummary,
  FollowUp,
  Interaction,
  NetworkResponse,
  SearchResponse,
} from "@/types/api";

type Person = {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  school: string | null;
  major: string | null;
  location: string | null;
  email: string | null;
  summary: string;
  event: string;
  metDaysAgo: number;
  interests: string[];
  projects: string[];
  needs: string[];
  topics: string[];
  notes: string[];
  said: string;
};

const PEOPLE: Person[] = [
  { id: "p-maya", name: "Maya Singh", role: "Product designer", company: "Figma", school: null, major: null, location: "San Francisco",
    email: "maya@figma.demo", summary: "Designs collaboration tools at Figma; mentors student designers.", event: "SF Design Week", metDaysAgo: 3,
    interests: ["design", "ceramics", "climbing"], projects: ["a design systems course"], needs: ["student designers to mentor"],
    topics: ["design collaboration", "portfolio reviews"], notes: ["Offered to review my portfolio"], said: "Met Maya at SF Design Week. She designs at Figma and offered to review my portfolio. We talked about a design collaboration on the club app." },
  { id: "p-jason", name: "Jason Chen", role: "Founder", company: "Lumen Robotics", school: "UC Berkeley", major: "EECS", location: "Berkeley",
    email: "jason@lumen.demo", summary: "Building a warehouse robotics startup; raising a seed round.", event: "Cal Hacks", metDaysAgo: 6,
    interests: ["robotics", "startups", "ai"], projects: ["a robotics startup"], needs: ["designers", "a seed investor"],
    topics: ["fundraising", "hardware"], notes: ["Sophomore", "Might be at Google next summer"], said: "Jason is building Lumen Robotics out of Berkeley. Looking for designers and talking to seed investors." },
  { id: "p-sarah", name: "Sarah Kim", role: "Research assistant", company: null, school: "UC Berkeley", major: "Bioengineering", location: "Berkeley",
    email: "sarah.kim@berkeley.demo", summary: "Bioengineering researcher interviewing for a biotech lab.", event: "Berkeley research symposium", metDaysAgo: 9,
    interests: ["biotech", "ai", "running"], projects: ["protein folding research"], needs: ["advice on lab interviews"],
    topics: ["her research interview at Genentech"], notes: ["Interview is next week"], said: "Sarah has a research interview at Genentech next week. She's into biotech and machine learning." },
  { id: "p-annie", name: "Annie Park", role: "Chemistry major", company: null, school: "UC Berkeley", major: "Chemistry", location: "Berkeley",
    email: "annie@berkeley.demo", summary: "Runs the chemistry club; into materials science.", event: "Chem club mixer", metDaysAgo: 12,
    interests: ["chemistry", "materials", "music"], projects: ["battery materials research"], needs: ["a summer lab position"],
    topics: ["battery materials"], notes: ["Plays in a jazz band"], said: "Annie runs the chem club and works on battery materials. She plays jazz piano." },
  { id: "p-diego", name: "Diego Alvarez", role: "PhD student", company: null, school: "Stanford", major: "Chemical engineering", location: "Palo Alto",
    email: "diego@stanford.demo", summary: "Chemical engineering PhD working on batteries.", event: "Chem club mixer", metDaysAgo: 12,
    interests: ["chemistry", "climate", "hiking"], projects: ["solid-state batteries"], needs: ["co-founder for a climate startup"],
    topics: ["climate tech"], notes: [], said: "Diego is a Stanford chem-e PhD on solid-state batteries, thinking about a climate startup." },
  { id: "p-priya", name: "Priya Shah", role: "Software engineer intern", company: "Stripe", school: "UC Berkeley", major: "Computer science", location: "San Francisco",
    email: "priya@stripe.demo", summary: "CS senior interning at Stripe; offered a referral.", event: "Career fair", metDaysAgo: 15,
    interests: ["fintech", "ai", "climbing"], projects: ["payments infrastructure"], needs: [],
    topics: ["Stripe internships"], notes: ["Offered to refer me"], said: "Priya is a CS senior interning at Stripe and offered to refer me. Send her my resume." },
  { id: "p-noah", name: "Noah Kim", role: "Engineer", company: "Stripe", school: null, major: null, location: "San Francisco",
    email: "noah@stripe.demo", summary: "Backend engineer at Stripe, runs a climbing group.", event: "Climbing night", metDaysAgo: 20,
    interests: ["climbing", "fintech", "music"], projects: [], needs: [], topics: ["climbing gyms"], notes: [], said: "Noah works on payments at Stripe and organizes a Thursday climbing night." },
  { id: "p-eli", name: "Eli Brooks", role: "Partner", company: "Northside Ventures", school: null, major: null, location: "San Francisco",
    email: "eli@northside.demo", summary: "Seed investor focused on AI and robotics.", event: "Founders dinner", metDaysAgo: 24,
    interests: ["ai", "robotics", "startups"], projects: [], needs: ["robotics founders"], topics: ["seed rounds"], notes: [], said: "Eli invests at the seed stage in AI and robotics. Wants intros to robotics founders." },
  { id: "p-lena", name: "Lena Ortiz", role: "Ceramicist", company: "Clay Studio SF", school: null, major: null, location: "San Francisco",
    email: "lena@clay.demo", summary: "Teaches wheel-throwing classes.", event: "Pottery class", metDaysAgo: 30,
    interests: ["ceramics", "art", "design"], projects: ["a spring pottery show"], needs: [], topics: ["pottery classes"], notes: [], said: "Lena teaches the Saturday wheel class and is putting together a spring show." },
  { id: "p-omar", name: "Omar Haddad", role: "PM", company: "Notion", school: "UC Berkeley", major: "Cognitive science", location: "San Francisco",
    email: "omar@notion.demo", summary: "Product manager; Berkeley alum who hires interns.", event: "SF Design Week", metDaysAgo: 35,
    interests: ["design", "productivity", "music"], projects: ["Notion calendar"], needs: ["design interns"], topics: ["PM recruiting"], notes: [], said: "Omar is a PM at Notion, Berkeley alum, hiring design interns this spring." },
  { id: "p-hana", name: "Hana Ito", role: "Organizer", company: "Bay Area Volunteers", school: null, major: null, location: "Oakland",
    email: "hana@bav.demo", summary: "Runs weekend volunteer events.", event: "Beach cleanup", metDaysAgo: 41,
    interests: ["volunteering", "outdoors", "food"], projects: ["a food bank drive"], needs: ["volunteers"], topics: ["community events"], notes: [], said: "Hana organizes beach cleanups and a monthly food bank drive." },
  { id: "p-ravi", name: "Ravi Patel", role: "ML researcher", company: "OpenLab", school: "Stanford", major: "Computer science", location: "Palo Alto",
    email: "ravi@openlab.demo", summary: "Works on language models for biology.", event: "Berkeley research symposium", metDaysAgo: 55,
    interests: ["ai", "biotech"], projects: ["protein language models"], needs: [], topics: ["AI for biology"], notes: [], said: "Ravi does machine learning for biology at OpenLab. Good person to ask about biotech." },
];

const DAY = 86_400_000;
const now = () => Date.now();
const iso = (daysFromNow: number, hour = 12) => {
  const d = new Date(now() + daysFromNow * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

let people = PEOPLE.map((p) => ({ ...p }));
let followUps: FollowUp[] = [
  fu("f1", "p-sarah", "Ask Sarah how her Genentech research interview went", 2),
  fu("f2", "p-maya", "Follow up with Maya about the design collaboration", 1),
  fu("f3", "p-priya", "Send Priya my resume for the Stripe referral", -1),
  fu("f4", "p-jason", "Intro Jason to Eli for his seed round", 4),
  fu("f5", "p-annie", "Ask Annie about summer lab positions", 9, true),
  fu("f6", "p-omar", "Apply to Omar's design internship", 16),
  fu("f7", "p-lena", "Sign up for Lena's spring pottery show", null),
];
followUps.push({ ...fu("f8", "p-noah", "Join Noah's Thursday climbing night", -6), status: "done", completedAt: iso(-5) });

function fu(id: string, contactId: string, action: string, dueIn: number | null, onCalendar = false): FollowUp {
  const p = PEOPLE.find((x) => x.id === contactId)!;
  return {
    id, contactId, contactName: p.name, interactionId: `i-${contactId}`, action,
    dueAt: dueIn === null ? null : iso(dueIn), status: "open", createdAt: iso(-p.metDaysAgo), completedAt: null,
    context: contextFor(p), onCalendar, calendarLink: onCalendar ? "https://calendar.google.com" : null,
  };
}

function contextFor(p: Person): string {
  const who = p.role && p.company ? `${p.role} at ${p.company}` : p.role || p.company || p.school || "";
  const what = p.needs[0] ? `Looking for ${p.needs[0]}` : p.projects[0] ? `Working on ${p.projects[0]}` : p.topics[0] ? `Talked about ${p.topics[0]}` : "";
  return [who, `Met at ${p.event}`, what].filter(Boolean).join(" · ");
}

function summary(p: Person): ContactSummary {
  return {
    id: p.id, name: p.name, company: p.company, role: p.role, school: p.school, major: p.major, location: p.location,
    email: p.email, phone: null, lastInteractionAt: iso(-p.metDaysAgo), createdAt: iso(-p.metDaysAgo), firstMetAt: iso(-p.metDaysAgo),
    lastEvent: p.event, openFollowUps: followUps.filter((f) => f.contactId === p.id && f.status === "open").length,
    moments: p.metDaysAgo < 10 ? 2 : 1, interests: p.interests, events: [p.event],
  };
}

function detail(p: Person): ContactDetail {
  const moment: Interaction = {
    id: `i-${p.id}`, contactId: p.id, event: p.event, location: p.location, summary: p.summary, rawTranscript: p.said,
    interests: p.interests, projects: p.projects, needs: p.needs, topicsDiscussed: p.topics, notes: p.notes,
    interactionDate: iso(-p.metDaysAgo), sourceType: "voice",
  } as Interaction;
  return {
    id: p.id, name: p.name, company: p.company, role: p.role, school: p.school, major: p.major, location: p.location,
    email: p.email, phone: null, linkedinUrl: null, websiteUrl: null, summary: p.summary,
    lastInteractionAt: iso(-p.metDaysAgo), createdAt: iso(-p.metDaysAgo), interactions: [moment],
    followUps: followUps.filter((f) => f.contactId === p.id),
  };
}

function network(): NetworkResponse {
  const edges: NetworkResponse["edges"] = [];
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      if (a.company && a.company === b.company) edges.push({ source: a.id, target: b.id, kind: "organization", reasons: [`Both at ${a.company}`] });
      else if (a.school && a.school === b.school) edges.push({ source: a.id, target: b.id, kind: "organization", reasons: [`Both at ${a.school}`] });
      if (a.event === b.event) edges.push({ source: a.id, target: b.id, kind: "event", reasons: [`Both at ${a.event}`] });
      const shared = a.interests.filter((x) => b.interests.includes(x));
      if (shared.length && a.company !== b.company && a.event !== b.event) {
        edges.push({ source: a.id, target: b.id, kind: "interests", reasons: [`Both into ${shared.slice(0, 2).join(", ")}`] });
      }
    }
  }
  return {
    people: people.map((p) => ({
      id: p.id, kind: "person", name: p.name, subtitle: [p.role, p.company ?? p.school].filter(Boolean).join(" · ") || null,
      moments: p.metDaysAgo < 10 ? 2 : 1, lastInteractionAt: iso(-p.metDaysAgo),
      openFollowUps: followUps.filter((f) => f.contactId === p.id && f.status === "open").length,
    })),
    groups: [],
    edges,
  };
}

// Meaning-aware search over the demo notes: synonyms stand in for the model.
const SYNONYMS: Record<string, string[]> = {
  ai: ["ai", "machine learning", "language models", "ml"],
  design: ["design", "designer", "figma", "portfolio"],
  biotech: ["biotech", "biology", "protein", "genentech", "bioengineering"],
  berkeley: ["berkeley"],
  startup: ["startup", "founder", "seed", "investor", "co-founder"],
  company: ["startup", "founder", "co-founder", "seed"],
  invest: ["investor", "seed", "ventures"],
  chemistry: ["chemistry", "chemical", "chem", "materials", "batteries"],
  climbing: ["climbing"],
  recent: [],
};

function searchDemo(query: string): SearchResponse {
  const q = query.toLowerCase();
  const wanted = Object.entries(SYNONYMS).filter(([k]) => q.includes(k)).flatMap(([, v]) => v);
  const recentOnly = /recent|lately|this (week|month)|last (week|month)/.test(q);
  // "Who did I meet today / this week / at Cal Hacks?": answer by when and where.
  const window = /today|tonight/.test(q) ? 0 : /this week|last week/.test(q) ? 7 : null;
  const event = people.find((p) => p.event && q.includes(p.event.toLowerCase()))?.event ?? null;
  if (window !== null || event) {
    const found = people.filter((p) => (window === null || p.metDaysAgo <= window) && (!event || p.event === event)).slice(0, 8);
    return {
      interpreted: true,
      results: found.map((p) => ({ contact: summary(p), reasons: [`Met at ${p.event}${p.metDaysAgo === 0 ? " today" : ""}`] })),
    };
  }
  const stop = new Set(["who", "what", "did", "meet", "know", "about", "else", "works", "with", "that", "does", "should", "could"]);
  const terms = wanted.length ? wanted : q.split(/\W+/).filter((w) => w.length > 2 && !stop.has(w));
  const scored = people
    .map((p) => {
      const text = [p.name, p.role, p.company, p.school, p.major, p.summary, p.said, ...p.interests, ...p.projects, ...p.needs, ...p.topics]
        .join(" ").toLowerCase();
      const hits = terms.filter((t) => text.includes(t));
      const needsBoth = q.includes("berkeley") && wanted.length > 1;
      const ok = hits.length > 0 && (!needsBoth || (text.includes("berkeley") && hits.some((h) => h !== "berkeley")));
      return { p, hits, ok };
    })
    .filter((r) => r.ok && (!recentOnly || r.p.metDaysAgo <= 21))
    .sort((a, b) => b.hits.length - a.hits.length || a.p.metDaysAgo - b.p.metDaysAgo)
    .slice(0, 6);
  return {
    interpreted: true,
    results: scored.map(({ p, hits }) => ({
      contact: summary(p),
      reasons: [reasonFor(p, hits)],
    })),
  };
}

function reasonFor(p: Person, hits: string[]): string {
  const about = p.needs[0] ? `looking for ${p.needs[0]}` : p.projects[0] ? `working on ${p.projects[0]}` : p.summary.toLowerCase();
  const where = p.company ?? p.school;
  return `${p.role ?? "Contact"}${where ? ` at ${where}` : ""}, ${about}${hits[0] ? ` · notes mention “${hits[0]}”` : ""}`;
}

const CSV_HEADER = ["Name", "Email", "Company", "Role", "School", "Major", "Location", "Interests", "Working on", "Looking for", "Where you met", "Notes"];

function exportDemo(ids: string[] | null, format: string): string {
  const sep = format === "tsv" ? "\t" : ",";
  const cell = (v: string) => (format === "tsv" ? v : `"${v.replace(/"/g, '""')}"`);
  const rows = people
    .filter((p) => !ids || ids.includes(p.id))
    .map((p) => [p.name, p.email ?? "", p.company ?? "", p.role ?? "", p.school ?? "", p.major ?? "", p.location ?? "",
      p.interests.join("; "), p.projects.join("; "), p.needs.join("; "), p.event, p.notes.join("; ")].map(cell).join(sep));
  return [CSV_HEADER.map(cell).join(sep), ...rows].join("\n");
}

// A scripted session: people "join" as chunks arrive, details filling in.
const SESSION_PEOPLE = [
  { at: 1, person: { name: "Leo Tran", role: "Founder", company: "Ramen Lab", school: null, major: null, metAt: null, location: "San Francisco",
    interests: ["food"], projects: ["a ramen pop-up"], needs: [], topicsDiscussed: [], notes: [], followUp: null, followUpDue: null } },
  { at: 2, person: { name: "Leo Tran", role: "Founder", company: "Ramen Lab", school: null, major: null, metAt: null, location: "San Francisco",
    interests: ["food", "design"], projects: ["a ramen pop-up"], needs: ["branding help"], topicsDiscussed: ["menu design"], notes: [],
    followUp: "Send Leo branding ideas by Friday", followUpDue: null } },
  { at: 3, person: { name: "Ines Moreau", role: "PhD student", company: null, school: "Stanford", major: "Materials science", metAt: null,
    location: null, interests: ["climate"], projects: ["solar coatings"], needs: ["a design partner"], topicsDiscussed: [], notes: [],
    followUp: null, followUpDue: null } },
  { at: 5, person: { name: "Kai Johnson", role: "Product designer", company: "Airbnb", school: null, major: null, metAt: null, location: null,
    interests: ["design", "music"], projects: [], needs: [], topicsDiscussed: ["portfolio reviews"], notes: ["Offered a portfolio review"],
    followUp: "Book a portfolio review with Kai next week", followUpDue: null } },
];
let demoSession: { id: string; title: string | null; status: "recording" | "ready" | "saved"; chunks: number; startedAt: string; endedAt: string | null; contactIds: string[] } | null = null;
// Sessions saved during this demo, newest first.
let savedSessions: AmbientSession[] = [];

function sessionPeople(chunks: number, title: string | null) {
  const latest = new Map<string, (typeof SESSION_PEOPLE)[number]["person"]>();
  for (const { at, person } of SESSION_PEOPLE) if (chunks >= at) latest.set(person.name, person);
  return [...latest.values()].map((p) => ({ ...p, metAt: p.metAt ?? title }));
}

const contactOf = (p: Person) => ({ id: p.id, name: p.name, role: p.role, company: p.company, school: p.school });

function sessionOut(extra: Record<string, unknown> = {}): AmbientSession {
  const sess = demoSession!;
  const saved = sess.status === "saved";
  return {
    id: sess.id, title: sess.title, status: sess.status, chunks: sess.chunks, startedAt: sess.startedAt, endedAt: sess.endedAt,
    audioSeconds: sess.chunks * 20, words: sess.chunks * 50,
    people: saved ? [] : sessionPeople(sess.chunks, sess.title),
    contacts: saved ? people.filter((p) => sess.contactIds.includes(p.id)).map(contactOf) : [],
    ...extra,
  };
}

// Past sessions: everyone in the demo network, grouped by the event where you met.
function history(): AmbientSession[] {
  const byEvent = new Map<string, Person[]>();
  for (const p of people) {
    const key = `${p.event}|${p.metDaysAgo}`;
    byEvent.set(key, [...(byEvent.get(key) ?? []), p]);
  }
  const past = [...byEvent.entries()].map(([key, group]) => {
    const days = group[0].metDaysAgo;
    return {
      id: `s-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`, title: group[0].event, status: "saved" as const,
      chunks: 30 + group.length * 12, audioSeconds: (30 + group.length * 12) * 20, words: 1500 + group.length * 400, people: [],
      startedAt: iso(-days, 18), endedAt: new Date(Date.parse(iso(-days, 18)) + (50 + group.length * 15) * 60_000).toISOString(),
      contacts: group.map(contactOf),
    };
  });
  const current = demoSession && demoSession.status !== "saved" ? [sessionOut()] : [];
  return [...current, ...savedSessions, ...past.sort((a, b) => b.startedAt.localeCompare(a.startedAt))];
}

function saveDemoSession(captured: CapturedPerson[]): AmbientSession {
  const sess = demoSession!;
  const added: Person[] = [];
  const ids = captured.map((c, i) => {
    if (c.contactId) return c.contactId;
    const id = `p-new-${Date.now()}-${i}`;
    added.push({ ...PEOPLE[0], id, name: c.contact.name, role: c.contact.role, company: c.contact.company, school: c.contact.school,
      major: c.contact.major, location: c.contact.location, email: null, interests: c.interaction.interests, projects: c.interaction.projects,
      needs: c.interaction.needs, topics: c.interaction.topicsDiscussed, notes: c.interaction.notes, event: sess.title ?? "Session",
      metDaysAgo: 0, summary: "", said: "" });
    return id;
  });
  people = [...added, ...people];
  sess.status = "saved";
  sess.contactIds = ids;
  const out = sessionOut();
  savedSessions = [out, ...savedSessions];
  return out;
}

export async function demoRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const body = (options.body ?? {}) as Record<string, unknown>;
  const [route, queryString] = path.split("?");
  const params = new URLSearchParams(queryString ?? "");
  const parts = route.split("/").filter(Boolean);
  // A short, steady delay so loading states look real on screen recordings.
  await new Promise((resolve) => setTimeout(resolve, route === "/search" ? 650 : 180));

  const reply = (value: unknown) => value as T;
  const findPerson = (id: string) => people.find((p) => p.id === id);

  if (route === "/health") return reply({ ok: true });
  if (route === "/contacts" && method === "GET") return reply(people.map(summary));
  if (route === "/contacts/export") return reply(exportDemo((body.ids as string[] | null) ?? null, String(body.format)));
  if (parts[0] === "contacts" && parts[1] && method === "GET") {
    const p = findPerson(parts[1]);
    if (!p) throw new Error("Not found");
    return reply(detail(p));
  }
  if (parts[0] === "contacts" && parts[1] && method === "PATCH") {
    const p = findPerson(parts[1]);
    if (p) Object.assign(p, body);
    return reply(p ? detail(p) : null);
  }
  if (parts[0] === "contacts" && parts[1] && method === "DELETE") {
    people = people.filter((p) => p.id !== parts[1]);
    followUps = followUps.filter((f) => f.contactId !== parts[1]);
    return reply(undefined);
  }
  if (route === "/follow-ups" && method === "GET") {
    const status = params.get("status");
    return reply(followUps.filter((f) => !status || f.status === status));
  }
  if (route === "/follow-ups" && method === "POST") {
    const p = findPerson(String(body.contactId));
    const created: FollowUp = {
      id: `f${followUps.length + 10}`, contactId: String(body.contactId), contactName: p?.name ?? "", interactionId: null,
      action: String(body.action), dueAt: (body.dueAt as string | null) ?? null, status: "open", createdAt: new Date().toISOString(),
      completedAt: null, context: p ? contextFor(p) : null, onCalendar: false, calendarLink: null,
    };
    followUps = [...followUps, created];
    return reply(created);
  }
  if (parts[0] === "follow-ups" && parts[1] && method === "PATCH") {
    const item = followUps.find((f) => f.id === parts[1]);
    if (item) {
      Object.assign(item, body);
      if (body.status) item.completedAt = body.status === "done" ? new Date().toISOString() : null;
    }
    return reply({ ...item });
  }
  if (route === "/search") return reply(searchDemo(String(body.query ?? "")));
  if (route === "/network") return reply(network());
  if (route === "/me/profile") {
    return reply({ displayName: "Eisha Yadav", avatarUrl: null, inviteCode: "eisha123", inviteLink: "https://nomi-connect.vercel.app/?invite=eisha123", invitedCount: 2 });
  }
  if (route === "/invites/redeem") return reply({ redeemed: false });
  if (route === "/duplicate-check") return reply({ matches: ((body.people as unknown[]) ?? []).map(() => []) });
  if (route === "/sessions" && method === "GET") return reply(history());
  if (route === "/sessions" && method === "POST") {
    demoSession = { id: `demo-session-${Date.now()}`, title: (body.title as string | null) || null, status: "recording", chunks: 0,
      startedAt: new Date().toISOString(), endedAt: null, contactIds: [] };
    return reply(sessionOut({ uploadToken: "demo" }));
  }
  if (route === "/sessions/active") return reply(demoSession?.status === "recording" ? sessionOut() : null);
  if (parts[0] === "sessions" && demoSession && parts[1] === demoSession.id) {
    if (parts[2] === "chunks") demoSession.chunks += 1;
    if (parts[2] === "finish") {
      demoSession.status = "ready";
      demoSession.endedAt = new Date().toISOString();
    }
    if (parts[2] === "save") return reply(saveDemoSession((body.people as CapturedPerson[]) ?? []));
    if (method === "DELETE") {
      demoSession = null;
      return reply(undefined);
    }
    return reply(sessionOut(parts[2] === "finish" ? { transcript: "" } : {}));
  }
  if (parts[0] === "sessions" && parts[1]) {
    const found = history().find((x) => x.id === parts[1]);
    if (method === "DELETE") return reply(undefined);
    if (!found) throw new Error("Not found");
    return reply(found);
  }
  if (route === "/me/export") return reply({ exportedAt: new Date().toISOString(), contacts: people.map(detail) });
  return reply(method === "GET" ? [] : undefined);
}
