# Project Context — Nomi

## Personalized Voice Networking AI

**Product name: Nomi**

## 1. Product Vision

I am building a mobile application that acts as a personalized AI memory system for relationships and networking.

The product helps users remember, organize, search, and follow up with people they meet in real life.

The core interaction is voice-first.

Example:

> "Today I met Jason Chen at a Berkeley founders mixer. He's an EECS sophomore working on a robotics startup. He's looking for designers, and we talked about Magic Hour. I should probably reach out next week."

The app should understand natural speech and turn it into structured relationship memory.

The long-term product should help users answer questions like:

- Who did I meet recently?
- Who do I know at Google?
- Who was the robotics founder I met at that event?
- Who should I follow up with this week?
- Who do I know in product management?
- When did I last talk to Sarah?
- What did Jason say he was working on?
- Who in my network might be useful for this opportunity?
- Which relationships have gone cold?
- Who did I promise to send something to?
- Who have I met multiple times?
- What context should I remember before I meet this person again?

The goal is not to build a traditional CRM.

The goal is to build:

> A personal AI memory layer for people and relationships.

---

# 2. Product Principles

The product should feel:

- fast
- personal
- intelligent
- low-friction
- trustworthy
- private
- voice-first
- useful immediately after meeting someone

The user should not feel like they are filling out a CRM.

The ideal experience is:

```text
Meet someone
↓
Open app
↓
Speak naturally for 10–60 seconds
↓
AI remembers the important details
↓
User confirms
↓
Relationship memory is updated
```

The product should gradually become more useful as it learns:

- how the user categorizes people
- what types of relationships matter to them
- how they prefer to follow up
- what kinds of information they usually want to remember

---

# 3. Engineering Role & Standards

Act as a senior full-stack software engineer and technical mentor for this project.

Operate with the judgment expected from a strong senior/staff engineer with experience in:

- React Native
- Expo
- TypeScript
- Python
- FastAPI
- PostgreSQL
- Supabase
- REST APIs
- local ML inference
- LLM applications
- structured outputs
- speech-to-text
- background jobs
- search systems
- authentication
- mobile architecture
- security
- testing
- Git and GitHub
- production deployment

The goal is not merely to make the product work.

The codebase should be:

- correct
- readable
- secure
- maintainable
- debuggable
- modular without being overengineered
- understandable to a student developer
- capable of evolving from MVP to a real product

I am building this project partly to learn software engineering.

Therefore, act as both:

1. a senior engineer responsible for technical quality
2. a mentor responsible for helping me understand the system

When introducing an important concept, explain:

- what it does
- why we need it
- where it belongs
- what data goes in
- what data comes out
- what failure modes exist

Do not generate huge amounts of code blindly.

Prefer incremental implementation.

---

# 4. Development Philosophy

Do not optimize only for shipping speed.

Optimize for:

```text
understand
↓
implement
↓
verify
↓
review
↓
commit
↓
push
```

When building a feature:

1. explain the concept
2. explain the architecture
3. implement the smallest useful version
4. test it
5. inspect the diff
6. commit it
7. push it
8. continue

Avoid:

- giant one-shot rewrites
- hidden magic
- unnecessary libraries
- unnecessary abstractions
- premature microservices
- premature optimization
- introducing infrastructure before it solves a real problem

---

# 5. Current Product Strategy

This file governs the FULL product, not just the MVP.

However, implementation should still happen in phases.

The MVP is Phase 1, not the final scope.

The product should evolve through:

```text
Phase 1 — Capture
Phase 2 — Memory
Phase 3 — Retrieval
Phase 4 — Follow-up
Phase 5 — Personalization
Phase 6 — Integrations
Phase 7 — Relationship Intelligence
Phase 8 — Production Scale
```

Do not skip directly to advanced features before the foundations work.

---

# 6. Locked Core Tech Stack

Unless there is a strong technical reason, use this stack.

## Mobile

- React Native
- Expo
- TypeScript
- Expo Router
- `expo-audio`

## Backend

- Python 3.12+
- FastAPI
- Uvicorn
- Pydantic v2

## Speech-to-Text

Development:

- `faster-whisper`
- Whisper `small.en` initially

Possible later production options:

- self-hosted Whisper
- GPU inference service
- alternative open-source STT model if benchmarking proves better

## LLM

Development:

- Qwen3
- `qwen3:4b` initially
- Ollama for local inference
- structured outputs
- thinking disabled for simple extraction

If needed:

- test `qwen3:8b`

before switching model families.

Production model strategy should remain replaceable behind a clean service interface.

## Database

- Supabase
- PostgreSQL

## Authentication

- Supabase Auth

## Storage

- Supabase Storage if audio or profile assets need persistent storage

## Search

Initial:

- PostgreSQL queries
- Postgres full-text search where useful

Later:

- embeddings only if semantic retrieval clearly improves product quality
- pgvector is preferred before introducing a separate vector database

## Background Work

Do not introduce background queues immediately.

Later, if needed:

- lightweight background jobs
- scheduled jobs
- event-driven tasks

Only after synchronous flows are stable.

## Development Tools

- Cursor
- Codex extension
- Claude Code optionally
- Git
- GitHub
- npm
- Python virtual environment
- Expo Go / iOS Simulator

---

# 7. Core Architecture

```text
React Native App
    ↓
HTTPS / JSON / audio
    ↓
FastAPI Backend
    ├── transcription
    ├── extraction
    ├── contact logic
    ├── search
    ├── reminders
    └── integrations
    ↓
Whisper + Qwen
    ↓
Pydantic validation
    ↓
Business logic
    ↓
Supabase / PostgreSQL / Auth / Storage
```

Important rule:

The LLM should not directly control the database.

Use:

```text
LLM output
↓
schema validation
↓
business logic
↓
user confirmation when needed
↓
database write
```

---

# 8. Core Product Objects

The product should model relationships, not just contacts.

Main objects:

```text
User
Contact
Interaction
Organization
Tag
Category
FollowUp
Reminder
RelationshipSignal
Source
Attachment
```

Do not implement all of these immediately.

They represent the long-term conceptual model.

---

# 9. Contact vs Interaction

This is a foundational rule.

A Contact represents a person.

An Interaction represents a moment or conversation involving that person.

Example:

```text
Jason Chen
│
├── Sep 24 — Founders Mixer
├── Oct 12 — Cal Hacks
└── Nov 04 — Coffee
```

Do not overwrite history.

The app should accumulate relationship context over time.

---

# 10. Core Database Model

## contacts

Suggested long-term fields:

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL
name TEXT
first_name TEXT
last_name TEXT
company TEXT
role TEXT
school TEXT
major TEXT
location TEXT
email TEXT
phone TEXT
linkedin_url TEXT
website_url TEXT
summary TEXT
relationship_type TEXT
importance_level TEXT
last_interaction_at TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Most fields should be nullable.

## interactions

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL
contact_id UUID NOT NULL
raw_transcript TEXT
summary TEXT
event TEXT
location TEXT
interaction_date TIMESTAMPTZ
source_type TEXT
created_at TIMESTAMPTZ
```

Possible `source_type` values:

```text
voice
manual
calendar
email
import
```

## tags

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL
name TEXT NOT NULL
created_at TIMESTAMPTZ
```

## contact_tags

```text
contact_id UUID
tag_id UUID
PRIMARY KEY (contact_id, tag_id)
```

## categories

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL
name TEXT NOT NULL
parent_id UUID NULL
created_at TIMESTAMPTZ
```

Supports hierarchical organization:

```text
Career
├── Recruiting
├── Founders
└── Investors

Berkeley
├── Clubs
├── Professors
└── Classmates
```

## contact_categories

```text
contact_id UUID
category_id UUID
PRIMARY KEY (contact_id, category_id)
```

## follow_ups

```text
id UUID PRIMARY KEY
user_id UUID NOT NULL
contact_id UUID NOT NULL
interaction_id UUID NULL
action TEXT NOT NULL
due_at TIMESTAMPTZ NULL
status TEXT
created_at TIMESTAMPTZ
completed_at TIMESTAMPTZ NULL
```

---

# 11. Voice Capture Experience

Start with intentional user-controlled recording.

Do NOT begin with always-on listening.

Initial flow:

```text
Tap microphone
↓
Record
↓
Stop
↓
Transcribe
↓
Extract
↓
Review
↓
Save
```

Later evaluate:

- lock-screen quick capture
- widgets
- OS shortcuts
- wearable input
- wake word

Only after privacy, UX, and platform restrictions are understood.

---

# 12. Audio Pipeline

Preserve this separation:

```text
audio recording
↓
audio file
↓
upload
↓
speech-to-text
↓
transcript
↓
LLM extraction
↓
validated structured data
```

Each stage must be independently testable.

---

# 13. Transcription

Use `faster-whisper`.

Initial model:

```text
small.en
```

If multilingual support becomes important:

```text
small
```

Important:

- load the model once
- do not reload per request
- handle corrupt/unsupported audio
- track latency
- minimize audio retention

---

# 14. LLM Responsibilities

The LLM may perform:

- information extraction
- summarization
- tag suggestions
- category suggestions
- follow-up extraction
- interaction summarization
- duplicate hints
- query interpretation
- natural-language search translation
- relationship context generation
- pre-meeting briefing
- recommendation explanations

The LLM should NOT:

- silently invent facts
- directly write arbitrary database state
- send messages without explicit user action
- infer highly sensitive traits
- fabricate employer/school information
- overwrite history without validation

---

# 15. Structured Extraction Schema

Initial schema:

```ts
type ExtractedPerson = {
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

type ContactExtractionResult = {
  people: ExtractedPerson[];
};
```

Potential future additions:

```text
uncertainty
source_spans
candidate_existing_contact_id
suggested_tags
suggested_categories
follow_up_date
relationship_signal
```

---

# 16. AI Uncertainty

Preserve uncertainty.

Example:

> "I think Emma works at Google."

Do not store this as a certain fact.

A later schema may include confidence and source text.

---

# 17. Multiple People

One voice note may mention multiple people.

Example:

> "I met Jason and Emma. Jason works on robotics and Emma is a designer at Figma."

Return two people and let the user review each separately.

---

# 18. Duplicate / Identity Resolution

Start simple:

- normalized name matching
- optional company/school similarity
- user confirmation

Later:

- multi-field similarity
- alias matching
- email/phone identity
- embedding-assisted matching if needed

Never auto-merge ambiguous people without confirmation.

---

# 19. Contact Profile

The profile should eventually contain:

- name
- role/company/school
- tags
- categories
- summary
- last interaction
- relationship timeline
- follow-ups
- notes
- links
- contact methods
- AI-generated memory briefing

---

# 20. Search & Retrieval

Support both traditional and natural-language search.

Examples:

> "Who do I know at Google?"

> "Who did I meet in the last two weeks?"

> "Who is working on robotics?"

> "Who did I promise to follow up with?"

> "Who was the investor I met at that dinner?"

Do not execute unrestricted raw LLM-generated SQL.

---

# 21. Personalized Organization

The app should learn how each user organizes relationships.

Possible concepts:

- personalized tags
- hierarchical categories
- role-based groups
- location-based groups
- context-based groups

The AI may suggest organization.

The user remains in control.

---

# 22. Follow-Ups

The app should detect commitments.

Example:

> "I should send her my deck next week."

Extract:

```text
Action: Send deck
Contact: Sarah
Due: next week
```

Allow:

- confirm
- edit
- dismiss
- mark complete

Later:

- reminders
- recurring follow-up suggestions
- stale relationship detection

---

# 23. Pre-Meeting Briefings

Later, before meeting someone again, surface grounded context from stored history:

```text
You last saw Jason 6 weeks ago.

Last time:
- He had just raised funding.
- He was hiring ML engineers.
- You promised to introduce him to Maya.

Things to remember:
- Ask how hiring is going.
- Follow up on the intro.
```

Do not fabricate.

---

# 24. Integrations

Future integrations may include:

- Google Calendar
- Google Contacts
- device contacts
- Gmail/email
- CSV import
- manually stored LinkedIn/profile links

Integrations must be explicit and permission-based.

Do not automatically record meetings.

Do not automatically send messages.

---

# 25. Relationship Intelligence

Later features may include:

- interaction frequency
- recency
- pending commitments
- network clusters
- weak ties
- relationship momentum
- suggested introductions
- opportunity matching
- relevant people recommendations

Recommendations must be explainable and grounded in stored evidence.

---

# 26. Privacy

Privacy is a core product feature.

Principles:

- explicit recording
- obvious recording state
- minimal audio retention
- edit/delete memories
- delete contacts
- delete account/data
- no secret enrichment
- no background recording by default
- no automatic outreach without permission
- no selling relationship data

---

# 27. Security

Required:

- authenticated APIs
- Row Level Security
- validate user ownership
- never expose service-role secrets
- environment variables for secrets
- never commit `.env`
- sanitize uploads
- file size limits
- rate limiting before public scale
- strict schema validation

---

# 28. Authentication

Use Supabase Auth.

Eventually support:

- email/password
- magic link
- Google
- Apple

Initial local development may start without full auth, but multi-user deployment requires it.

---

# 29. Search Architecture

Phase 1:

- exact queries
- filters
- text search

Phase 2:

- PostgreSQL full-text search

Phase 3 only if useful:

- embeddings
- pgvector
- semantic retrieval

Do not introduce a separate vector DB unless Postgres is insufficient.

---

# 30. Observability

As the app matures, track:

- API errors
- transcription latency
- extraction latency
- model failures
- invalid structured output
- duplicate detection errors
- database errors
- app crashes

Avoid logging sensitive transcripts in production unless justified.

---

# 31. Testing

Frontend tests:

- recording states
- permissions
- forms
- review flow
- error states

Backend tests:

- health endpoint
- file upload
- transcription failures
- extraction validation
- auth
- user ownership

Maintain an AI evaluation dataset with:

- single person
- multiple people
- uncertain facts
- corrections
- slang
- long rambling speech
- missing name/company
- follow-up request
- event/location
- repeated contact
- noisy transcript

---

# 32. Production AI Strategy

Development:

```text
faster-whisper
+
Qwen3 through Ollama
```

Production may later require:

- GPU inference
- self-hosted inference
- quantized models
- model routing
- batching
- caching

Keep model calls behind clean service boundaries so models can change.

---

# 33. API Design

Initial:

```text
GET  /health
POST /transcribe
POST /extract
```

Later:

```text
GET    /contacts
POST   /contacts
GET    /contacts/{id}
PATCH  /contacts/{id}
DELETE /contacts/{id}
GET    /contacts/{id}/interactions
POST   /contacts/{id}/interactions
GET    /follow-ups
POST   /follow-ups
PATCH  /follow-ups/{id}
POST   /search
POST   /duplicate-check
POST   /briefing
```

Add endpoints only when required.

---

# 34. Mobile Screens

Long-term:

```text
Home
Record
Review
Contacts
Contact Profile
Search
Follow-Ups
Upcoming
Settings
```

Potential later screens:

```text
Categories
Network Insights
Import
Integrations
```

---

# 35. Data Ownership

Users should be able to:

- export data
- delete data
- edit memories
- delete interactions
- delete contacts
- remove integrations

The user's relationship data belongs to them.

---

# 36. Git & GitHub Rules

GitHub is the source of truth.

After every meaningful code/configuration edit:

1. verify it
2. inspect `git status`
3. inspect the diff
4. stage
5. commit
6. push

Do not batch unrelated changes.

Never commit:

- `.env`
- API keys
- secrets
- temporary recordings
- `.venv`
- `node_modules`
- unnecessary build artifacts

---

# 37. AI Coding Agent Rules

Before making changes:

- read this file
- inspect current code
- inspect git status
- understand the current milestone
- do not modify unrelated files
- explain major decisions
- test changes
- review diff
- commit and push when complete and verified

Do not allow two coding agents to modify the repo simultaneously.

Use:

```text
one agent
↓
one scoped task
↓
test
↓
review
↓
commit
↓
push
↓
next task
```

---

# 38. Recommended Repository Structure

```text
networking-voiceagent/
├── mobile/
│   ├── app/
│   ├── components/
│   ├── services/
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   └── utils/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/
│   │   ├── services/
│   │   ├── schemas/
│   │   ├── models/
│   │   ├── repositories/
│   │   └── core/
│   └── tests/
│
├── tests/
│   └── extraction_cases.json
│
├── PROJECT_CONTEXT.md
├── README.md
├── .gitignore
└── .env.example
```

Do not create every directory immediately.

Create structure only as features require it.

---

# 39. Product Roadmap

## Phase 0 — Foundation

- repo
- GitHub
- Expo app
- FastAPI
- health check
- mobile/backend connectivity

## Phase 1 — Voice Capture MVP

- microphone permission
- record audio
- playback
- upload audio
- transcription
- LLM extraction
- review/edit
- save contact
- save interaction
- contact profile

## Phase 2 — Relationship Memory

- multiple interactions
- timeline
- profile summaries
- tags
- categories
- duplicate detection
- edit/delete

## Phase 3 — Search

- keyword search
- filters
- natural-language search
- search by company/role/event/time

## Phase 4 — Follow-Ups

- follow-up extraction
- due dates
- completion state
- reminders
- follow-up dashboard

## Phase 5 — Personalization

- user-specific categories
- organization suggestions
- learned preferences
- personalized summaries

## Phase 6 — Integrations

- calendar
- contacts import
- email
- optional profile links

## Phase 7 — Relationship Intelligence

- pre-meeting briefing
- stale relationship detection
- context retrieval
- opportunity matching
- introduction suggestions

## Phase 8 — Production

- auth hardening
- RLS
- monitoring
- deployment
- production model hosting
- backups
- privacy controls
- export/delete account

---

# 40. First Milestones

Do not skip these.

## Milestone 0

Repository setup.

## Milestone 1

Expo app runs.

## Milestone 2

FastAPI `/health` works.

## Milestone 3

Expo calls FastAPI successfully.

## Milestone 4

Microphone UI and permissions.

## Milestone 5

Record + stop + playback.

## Milestone 6

Upload audio.

## Milestone 7

Whisper transcription.

## Milestone 8

Qwen structured extraction.

## Milestone 9

Review/edit.

## Milestone 10

Supabase persistence.

## Milestone 11

Contact profile and timeline.

After Milestone 11, continue through the roadmap instead of stopping.

---

# 41. Definition of MVP Complete

The MVP is complete when:

1. user opens the app
2. records a voice note
3. audio is transcribed
4. contact information is extracted
5. user reviews and edits
6. contact is saved
7. interaction is saved
8. user opens the profile
9. interaction appears in timeline

The MVP is a checkpoint, not the end of the project.

---

# 42. Definition of Full Product Success

The full product should eventually make the user feel:

> "I no longer forget people, conversations, commitments, or relationship context."

A mature version should allow the user to:

- capture people quickly
- remember past interactions
- search their network conversationally
- know who to follow up with
- prepare before future meetings
- organize their network naturally
- understand relationship context
- receive useful, grounded suggestions
- maintain control over their data

The product should feel like:

> A second brain for relationships.

---

# 43. Current Priority

Even though this file describes the full product, implementation remains sequential:

```text
1. Repository setup
2. Expo app runs
3. FastAPI /health works
4. Mobile reaches backend
5. Microphone permission
6. Record voice
7. Playback
8. Upload
9. Transcribe
10. Extract
11. Review
12. Save
13. Contact profile
14. Multiple interactions
15. Search
16. Follow-ups
17. Personalization
18. Integrations
19. Relationship intelligence
20. Production hardening
```

Build the full product incrementally.

Do not confuse "full product vision" with "build everything at once."

---

# 44. Visual Design Direction

The visual direction should follow a dark, editorial, intimate, premium mobile-app aesthetic inspired by the provided reference image.

IMPORTANT:

The reference image is inspiration for mood, layout, typography, contrast, and visual language only.

Do NOT reproduce the illustrated woman, portrait imagery, or any identifiable character from the reference.

The app should establish its own visual identity.

## Overall Vibe

The product should feel:

- elegant
- editorial
- thoughtful
- calm
- intimate
- premium
- slightly cinematic
- minimal
- modern without feeling overly technical
- emotionally warm despite the dark palette

The visual language should feel closer to:

```text
editorial magazine
+
premium journaling app
+
quiet luxury
+
personal memory tool
```

and NOT like:

```text
enterprise CRM
productivity dashboard
generic SaaS
neon AI app
gamified social network
```

The interface should feel personal enough that opening a contact feels like opening a memory, not a database record.

---

## Color Palette

Primary palette:

```text
Background:
deep charcoal / near-black

Primary surfaces:
slightly lighter charcoal

Primary text:
warm ivory / soft off-white

Secondary text:
muted gray / warm gray

Accent:
restrained warm neutral
```

Avoid pure black and pure white where possible.

Prefer softer values such as:

```text
#171A1D
#20252A
#2A3035
#F2EEE8
#D8D1C8
#A8A19A
```

These are directionally appropriate values, not mandatory exact colors.

The UI should rely on subtle tonal differences rather than bright color blocks.

If accent colors are introduced later, they should be:

- muted
- dusty
- sophisticated
- used sparingly

Avoid:

- bright electric blue
- neon purple
- saturated gradients
- excessive glassmorphism
- rainbow AI branding

---

## Typography

Typography is a major part of the aesthetic.

Use a combination of:

### Display / Editorial Serif

For:

- screen titles
- contact names
- important section headings
- emotionally significant moments

The serif should feel:

- elegant
- literary
- high-contrast
- refined
- editorial

Examples of the TYPE of feeling:

```text
Cormorant Garamond
DM Serif Display
Playfair Display
Libre Baskerville
```

Do not blindly install all of these.

Choose one strong serif.

### Sans Serif

Use a clean sans serif for:

- body copy
- metadata
- buttons
- form labels
- navigation
- timestamps

It should feel understated and highly readable.

The contrast should be:

```text
Serif = personality / memory / emotion
Sans = functionality / clarity
```

Avoid using too many font families.

---

## Layout

Layouts should have generous breathing room.

Prefer:

- strong vertical rhythm
- large margins
- clear section separation
- asymmetric editorial composition when appropriate
- deliberate negative space
- large titles
- compact supporting metadata

Do NOT make every screen feel like a dense dashboard.

Cards should be used selectively.

Not every piece of information needs its own bordered container.

---

## Corners and Shapes

The reference uses soft rounded geometry.

Use:

- rounded cards
- rounded buttons
- rounded image/illustration containers
- soft pill elements for tags

Corners should feel soft but not cartoonish.

Avoid extremely bubbly UI.

---

## Surfaces

Use subtle layering:

```text
near-black page
↓
dark charcoal section
↓
slightly lighter interactive surface
```

Borders should be:

- subtle
- low contrast
- optional

Prefer surface contrast over obvious outlines.

Shadows should be extremely restrained because the UI is already dark.

---

## Imagery and Illustration

Do NOT use the woman/portrait aesthetic from the reference directly.

If visual artwork is needed, prefer:

- abstract line art
- botanical forms
- network-inspired organic shapes
- memory fragments
- soft monochrome illustrations
- abstract connection diagrams
- textures
- subtle photography only if it serves the product

The visuals should feel artistic and editorial rather than corporate.

Avoid:

- generic stock photos
- random AI-generated faces
- cartoon avatars
- obvious robot imagery
- glowing AI brains
- circuit-board clichés

For contacts, default to:

- initials
- subtle monograms
- optional real user-provided profile photos later

Do not fabricate profile photos.

---

## Motion

Animations should feel:

- soft
- intentional
- subtle
- responsive

Examples:

- gentle fade
- slight upward entrance
- smooth card expansion
- subtle microphone pulse
- soft transition between capture and review

Avoid:

- bouncy gamified motion
- excessive spring animations
- flashy transitions
- motion that slows down common actions

---

## Voice Capture Screen

The recording experience is one of the most important visual moments.

It should feel calm and intimate.

Example direction:

```text
Who did you meet?

            ◉

        Tap to record
```

During recording:

```text
Tell me about them.

        soft pulsing mic

            00:18

            Stop
```

The microphone should be visually prominent without looking like a generic assistant.

Avoid large gradients or glowing sci-fi effects.

---

## Contact Profiles

A person's profile should feel closer to a personal dossier / memory page than a CRM entry.

Example hierarchy:

```text
Jason Chen
Founder · EECS
UC Berkeley

Short AI memory summary

────────────

Last time you spoke
Sep 24 · Founders Mixer

Building a robotics startup.
Looking for designers.
You discussed Magic Hour.

────────────

Timeline
Sep 24
Oct 12
Nov 04

────────────

Follow up
Send Jason the intro.
```

Use serif typography for the person's name and important narrative headings.

Use sans serif for metadata and utility actions.

---

## Home Screen

The home screen should remain visually quiet.

Potential structure:

```text
Good evening

Who did you meet?

        microphone

Recent people
Jason Chen
Sarah Kim
Alex Wang

Follow-ups
2 things to remember
```

Do not overload the screen with analytics.

The product should prioritize:

1. capture
2. memory
3. follow-up

---

## Search Experience

Search should feel conversational, not database-like.

Example:

```text
Who are you looking for?

[ Who did I meet at Cal Hacks? ]
```

Results should emphasize:

- person's name
- why they matched
- last interaction
- useful context

Not raw database fields.

---

## Navigation

Keep bottom navigation minimal.

Possible long-term navigation:

```text
Home
People
Search
Follow-ups
You
```

Do not add tabs until the corresponding product areas are useful.

For the early product, fewer navigation items are better.

---

## Design System Rule

Before implementing new UI, ask:

> Does this feel like a personal memory product or like a CRM?

If it feels like a CRM, simplify it.

The desired design identity is:

> Dark editorial minimalism with warm typography and quiet, personal storytelling.

The app should feel refined enough to be emotionally meaningful, but simple enough to remain fast and functional.
