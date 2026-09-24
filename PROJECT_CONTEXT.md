# Project Context — Voice Networking AI MVP

## 1. Project Overview

I am building a mobile app that acts as a personalized, voice-activated networking assistant.

The core problem:

People meet many new contacts at school, events, conferences, hackathons, coffee chats, recruiting events, etc., but often forget:

- who the person was
- where they met
- what they talked about
- what that person is working on
- why the relationship matters
- when they should follow up

The app should let the user quickly speak after meeting someone, for example:

> "Today I met Jason Chen at a Berkeley founders mixer. He's an EECS sophomore working on a robotics startup. He's looking for designers, and we talked about Magic Hour. I should probably reach out next week."

The app should:

1. Record the user's voice.
2. Transcribe the audio.
3. Extract structured information about the person.
4. Show the extracted information to the user for confirmation.
5. Save the contact.
6. Save the interaction separately from the contact.
7. Display a profile/portfolio for that person.

The long-term product vision is a personalized AI relationship memory system.

However, this repository is currently focused ONLY on the MVP.

---

# 2. Engineering Role & Technical Standards

Act as a senior full-stack software engineer and technical mentor for this project.

Operate with the engineering judgment and standards expected from an exceptional senior/staff-level engineer with strong experience in:

- React
- React Native
- Expo
- TypeScript
- Python
- FastAPI
- REST APIs
- PostgreSQL
- Supabase
- mobile application architecture
- backend architecture
- local ML inference
- LLM applications
- speech-to-text systems
- structured outputs
- API security
- debugging
- testing
- Git and GitHub

Your responsibility is NOT merely to make the code work.

Your responsibility is to help build a system that is:

- correct
- simple
- readable
- secure
- maintainable
- easy to debug
- appropriately architected
- easy for a student developer to understand

I am using this project partly to learn software engineering.

Therefore, act as both:

1. a senior engineer responsible for technical quality
2. a technical mentor responsible for helping me understand the system

Do not blindly generate huge amounts of code.

When introducing an important concept, explain:

- what it does
- why we need it
- where it belongs in the architecture
- what data goes into it
- what data comes out of it

Prefer the simplest production-reasonable solution.

Do not overengineer.

Do not introduce abstractions until they solve an actual problem.

Do not introduce a dependency when the standard library or an existing dependency solves the problem clearly.

When debugging, identify the root cause instead of repeatedly patching symptoms.

When there is a meaningful architectural decision, explain the tradeoff.

---

# 3. Learning Philosophy

I am using this project to LEARN how to code.

When implementing a feature:

- Prefer simple implementations over clever abstractions.
- Keep files small and understandable.
- Explain important concepts when introducing them.
- Do not introduce unnecessary libraries.
- Do not overengineer.
- Avoid creating architecture for hypothetical future features.
- Prefer readable TypeScript and Python.
- Add comments only where they clarify non-obvious logic.
- When making major architectural decisions, explain why.
- If there are multiple valid approaches, prefer the easiest one for a beginner to understand.
- Do not silently rewrite large portions of working code.
- Make incremental changes.
- Preserve existing working functionality.

When I ask questions, prioritize teaching me WHY the code works.

If I ask for a feature, break it into understandable steps where appropriate.

When useful, follow this structure:

1. Explain the concept.
2. Explain the data flow.
3. Show the smallest useful implementation.
4. Explain the important code.
5. Verify it works.
6. Review the diff.
7. Commit and push.

Do not turn the project into code that I cannot understand.

---

# 4. Locked MVP Tech Stack

Unless there is a compelling technical reason, DO NOT change this stack.

## Mobile Frontend

Use:

- React Native
- Expo
- TypeScript
- Expo Router
- `expo-audio`

## Backend

Use:

- Python 3.12+
- FastAPI
- Uvicorn
- Pydantic v2

## Speech-to-Text

Use:

- `faster-whisper`
- Whisper `small.en` model initially

## LLM

Use:

- Qwen3
- `qwen3:4b` initially
- Ollama for local inference
- structured JSON output using a Pydantic JSON schema
- thinking disabled for extraction requests

If Qwen3 4B struggles with extraction quality, test:

- `qwen3:8b`

before changing model families.

## Database

Use:

- Supabase
- PostgreSQL
- Supabase Auth later
- Row Level Security before multi-user production use

## Development Tools

Use:

- Cursor as the main IDE
- Claude Code optionally as a terminal coding agent
- Git
- GitHub
- Python virtual environment
- npm
- Expo Go and/or iOS Simulator

## Do NOT Use for MVP

Do not use:

- OpenAI API
- Anthropic API
- Gemini API
- paid transcription APIs
- Firebase
- MongoDB
- Redux
- LangChain
- vector databases
- microservices

unless I explicitly decide later that they are needed.

---

# 5. Why This Stack Was Chosen

This project is intentionally designed to teach full-stack engineering.

The architecture exposes several important layers:

```text
React Native
     ↓
HTTP
     ↓
FastAPI
     ↓
AI inference
     ↓
structured data
     ↓
PostgreSQL
```

Each layer has a clear responsibility.

React Native teaches:

- UI development
- components
- React state
- hooks
- TypeScript
- mobile APIs
- navigation
- asynchronous programming

FastAPI teaches:

- backend development
- REST APIs
- HTTP
- request/response cycles
- validation
- server-side code
- file uploads
- error handling

Whisper teaches:

- local ML inference
- audio processing
- model loading
- latency
- CPU/GPU computation

Qwen teaches:

- LLM inference
- prompting
- structured outputs
- hallucination handling
- schema validation
- AI application design

PostgreSQL/Supabase teaches:

- relational databases
- SQL
- tables
- primary keys
- foreign keys
- authorization
- data modeling

Do not hide these concepts behind unnecessary abstractions.

---

# 6. MVP Goal

The MVP should accomplish this full flow:

```text
Open app
    ↓
Tap record
    ↓
Speak naturally about someone I met
    ↓
Stop recording
    ↓
Audio is transcribed
    ↓
Transcript is passed to an LLM
    ↓
LLM extracts structured contact information
    ↓
User sees a review/edit screen
    ↓
User confirms
    ↓
Contact + interaction are stored
    ↓
Contact appears in network
    ↓
User can open person's profile
```

Example:

User says:

> "I met Sarah Kim today at a Berkeley AI event. She's a product manager at an early-stage startup building education software. She used to study CS at Berkeley. We talked about AI agents and she said I should send her my project next week."

The app might extract:

```json
{
  "people": [
    {
      "name": "Sarah Kim",
      "company": null,
      "role": "Product Manager",
      "school": "UC Berkeley",
      "major": "Computer Science",
      "metAt": "Berkeley AI event",
      "interests": ["AI agents", "education technology"],
      "projects": ["education software startup"],
      "notes": [
        "User discussed AI agents with Sarah"
      ],
      "followUp": "Send Sarah the project next week"
    }
  ]
}
```

---

# 7. MVP Scope

## Required

The MVP MUST support:

- Mobile app
- Microphone permissions
- Start recording
- Stop recording
- Audio file handling
- Speech-to-text transcription
- Displaying the transcript
- Sending transcript to an LLM
- Structured JSON extraction
- Review/edit screen
- Saving contact
- Saving interaction
- Contact list
- Contact profile
- Interaction history

## Nice to Have

Only implement these after the main flow works:

- Tags
- Search
- Basic duplicate-contact detection
- Follow-up date
- AI-generated contact summary

## Not Part of MVP

Do NOT build these yet:

- Always-listening microphone
- "Hey [assistant]" wake word
- Background voice listening
- LinkedIn integration
- Gmail integration
- Calendar integration
- Automatic messaging
- Complex recommendation systems
- Embeddings
- Vector databases
- Knowledge graphs
- Autonomous agents
- Automatic outreach
- Social graph visualization
- Complex CRM analytics

The priority is making the core capture flow excellent.

---

# 8. High-Level Architecture

```text
┌─────────────────────────────┐
│      React Native App       │
│                             │
│ Expo + TypeScript           │
│                             │
│ - Record voice              │
│ - Show transcript           │
│ - Review contact            │
│ - Edit fields               │
│ - Display contacts          │
└──────────────┬──────────────┘
               │
               │ HTTP
               │ audio / JSON
               ▼
┌─────────────────────────────┐
│       FastAPI Server        │
│                             │
│ Python                      │
│                             │
│ GET  /health                │
│ POST /transcribe            │
│ POST /extract               │
└───────┬───────────┬─────────┘
        │           │
        │           │
        ▼           ▼
┌────────────┐  ┌───────────────┐
│  Whisper   │  │    Ollama     │
│            │  │               │
│ Speech →   │  │ Qwen3:4b      │
│ Text       │  │               │
└────────────┘  │ Text → JSON   │
                └───────┬───────┘
                        │
                        ▼
                Pydantic validation
                        │
                        ▼
                 Review Screen
                        │
                   User confirms
                        │
                        ▼
                ┌───────────────┐
                │   Supabase    │
                │               │
                │  PostgreSQL   │
                └───────────────┘
```

The app should NOT allow the LLM to directly write arbitrary data into the database.

The expected pattern is:

```text
LLM generates structured data
        ↓
Application validates data
        ↓
User reviews data
        ↓
Application writes approved data
```

---

# 9. Mobile Application

Use React Native with Expo and TypeScript.

Use Expo Router for navigation.

Expected screens:

```text
app/
    index.tsx
    record.tsx
    review.tsx
    contacts/
        index.tsx
        [id].tsx
```

Responsibilities:

## `index.tsx`

Home screen.

Contains:

- "Who did you meet?" prompt
- microphone button
- recent contacts

## `record.tsx`

Responsible for:

- microphone permission
- recording state
- starting recording
- stopping recording
- showing recording duration
- getting audio URI
- sending audio to backend

## `review.tsx`

Responsible for:

- displaying AI extraction
- allowing edits
- confirming information
- saving information

## `contacts/index.tsx`

Shows saved contacts.

## `contacts/[id].tsx`

Shows one person's profile and interaction history.

---

# 10. Audio Recording

Use:

- `expo-audio`

Do NOT implement:

- background microphone recording
- wake words
- always-on listening

The user must explicitly tap the microphone button.

Build audio recording incrementally:

1. Make the record button change state visually.
2. Request microphone permission.
3. Start actual recording.
4. Stop recording.
5. Get the audio URI.
6. Play the recording back for debugging.
7. Upload the file to FastAPI.
8. Transcribe with Whisper.

Do not jump straight to transcription before recording is verified.

Recommended state model:

```ts
type CaptureState =
  | "idle"
  | "recording"
  | "uploading"
  | "transcribing"
  | "extracting"
  | "review"
  | "error";
```

Avoid scattering many unrelated booleans around the UI.

---

# 11. Backend

Use Python FastAPI.

Recommended backend directory:

```text
backend/
    app/
        main.py

        routes/
            transcription.py
            extraction.py

        services/
            whisper_service.py
            llm_service.py

        schemas/
            extraction.py

        core/
            config.py

    requirements.txt
```

Do not create more backend layers until needed.

---

# 12. Backend Dependencies

Initial dependencies should approximately be:

```text
fastapi
uvicorn
python-multipart
pydantic
pydantic-settings
faster-whisper
ollama
```

Do not add LangChain.

Calling Ollama directly is easier to understand and gives us more control.

---

# 13. Backend Endpoints

Start with THREE endpoints.

## GET `/health`

Purpose:

Verify that the mobile app can reach the backend.

Output:

```json
{
  "status": "ok"
}
```

Build this before microphone or AI functionality.

---

## POST `/transcribe`

Input:

audio file

Output:

```json
{
  "transcript": "Today I met Jason..."
}
```

Responsibilities:

1. receive audio
2. temporarily save/read audio
3. send audio through Whisper
4. return transcript
5. clean up temporary audio

It should NOT run the LLM.

---

## POST `/extract`

Input:

```json
{
  "transcript": "Today I met Jason..."
}
```

Output:

```json
{
  "people": [...]
}
```

Responsibilities:

1. receive transcript
2. send transcript to Qwen
3. require structured output
4. validate result with Pydantic
5. return validated JSON

Keeping transcription and extraction separate initially is intentional.

It makes the architecture easier to understand and debug.

Later we may optionally create:

```text
POST /process-interaction
```

which chains both steps.

Do not start with that abstraction.

---

# 14. Speech-to-Text Model

Use:

- `faster-whisper`

Initial model:

```text
small.en
```

Use `small.en` because the initial MVP is English-first.

If multilingual transcription becomes important later, switch to:

```text
small
```

Do NOT start with the largest Whisper model.

The voice notes should normally be short, for example:

```text
10–60 seconds
```

Accuracy needs to be good, but fast iteration matters more than squeezing out the final few percent of transcription accuracy.

Load the Whisper model ONCE when the backend starts.

Do NOT reload the model on every HTTP request.

Conceptually:

```python
model = WhisperModel(...)

@app.post("/transcribe")
async def transcribe(...):
    # reuse model
```

Model initialization is expensive.

---

# 15. LLM Choice

Use:

```text
Qwen3
```

Run it locally using:

```text
Ollama
```

Initial model:

```text
qwen3:4b
```

The model's task is primarily:

```text
unstructured transcript
        ↓
structured information extraction
```

Example:

```text
"I met Jason at the Berkeley founders event.
He's EECS and building a robotics startup."

↓

{
  "name": "Jason",
  "school": "UC Berkeley",
  "major": "EECS",
  "projects": ["robotics startup"]
}
```

If `qwen3:4b` consistently struggles with messy transcripts or multiple people, test:

```text
qwen3:8b
```

before changing model families.

Do not prematurely use a 30B+ model.

---

# 16. Qwen Runtime

Ollama runs locally as the model server.

Architecture:

```text
FastAPI
   ↓
http://localhost:11434
   ↓
Ollama
   ↓
Qwen3
```

FastAPI communicates with Ollama.

The mobile app should NEVER directly communicate with Ollama.

---

# 17. Structured LLM Output

Do NOT ask the model to "please respond with JSON" and blindly parse the response.

Use structured outputs.

Define the expected structure using Pydantic.

Example:

```python
from pydantic import BaseModel


class ExtractedPerson(BaseModel):
    name: str | None = None
    company: str | None = None
    role: str | None = None
    school: str | None = None
    major: str | None = None

    met_at: str | None = None
    location: str | None = None

    interests: list[str] = []
    projects: list[str] = []
    needs: list[str] = []
    topics_discussed: list[str] = []
    notes: list[str] = []

    follow_up: str | None = None


class ExtractionResult(BaseModel):
    people: list[ExtractedPerson]
```

Conceptually call Ollama with:

```python
response = chat(
    model="qwen3:4b",
    messages=messages,
    format=ExtractionResult.model_json_schema(),
    think=False
)
```

Then validate:

```python
result = ExtractionResult.model_validate_json(
    response.message.content
)
```

The exact implementation may vary based on the installed Ollama version.

The important architectural rule is:

```text
LLM output
    ↓
Pydantic validation
    ↓
application
```

Never trust unvalidated LLM output.

---

# 18. LLM Thinking Mode

For contact extraction:

```text
think = false
```

The extraction task does not require lengthy reasoning.

We want:

- lower latency
- cleaner output
- predictable structure

If we later add more complex reasoning, thinking mode can be evaluated separately.

---

# 19. LLM Prompt

The extraction system prompt should be concise.

Example:

```text
You are the information extraction component of a personal networking application.

The user will provide a transcript describing one or more people they met.

Extract only information supported by the transcript.

Do not invent facts.

If a value is unknown, return null or an empty list.

The user may speak casually, correct themselves, or express uncertainty.

Preserve uncertainty instead of converting uncertain claims into facts.

If multiple people are discussed, return each person separately.

Return output matching the supplied schema.
```

Do not write giant prompts unless testing demonstrates they improve performance.

---

# 20. AI Evaluation

Create a small manual evaluation dataset.

Example:

```text
tests/extraction_cases.json
```

Include roughly 20 examples covering:

1. simple contact
2. missing name
3. missing company
4. two people
5. three people
6. uncertain company
7. casual speech
8. self-correction
9. follow-up request
10. event/location
11. school information
12. project information
13. long rambling input
14. almost no useful information

Whenever the prompt or model changes, test these examples again.

Do not judge the AI only from one happy-path prompt.

---

# 21. Core Data Model

IMPORTANT:

A person and an interaction are NOT the same thing.

A contact represents the person.

An interaction represents a specific time the user interacted with that person.

Example:

```text
Jason Chen
    |
    ├── Sept 24 — Founders Mixer
    |
    ├── Oct 12 — Cal Hacks
    |
    └── Nov 4 — Coffee
```

Do not overwrite a person's entire profile every time the user mentions them.

---

# 22. Initial Database Schema

Use:

- Supabase
- PostgreSQL

The database should NOT store the contact as one giant AI-generated JSON object.

Use relational data.

## `contacts`

Recommended fields:

```text
id UUID PRIMARY KEY
user_id UUID
name TEXT
company TEXT
role TEXT
school TEXT
major TEXT
summary TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Possible TypeScript representation:

```ts
type Contact = {
  id: string;
  userId: string;
  name: string;
  company: string | null;
  role: string | null;
  school: string | null;
  major: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};
```

---

## `interactions`

Recommended fields:

```text
id UUID PRIMARY KEY
user_id UUID
contact_id UUID
raw_transcript TEXT
summary TEXT
event TEXT
location TEXT
interaction_date TIMESTAMPTZ
created_at TIMESTAMPTZ
```

Possible TypeScript representation:

```ts
type Interaction = {
  id: string;
  userId: string;
  contactId: string;
  rawTranscript: string;
  summary: string | null;
  event: string | null;
  location: string | null;
  interactionDate: string | null;
  createdAt: string;
};
```

Relationship:

```text
contacts
    1
    │
    │
    ∞
interactions
```

One person can have many interactions.

---

# 23. Tags

Tags can be added later.

Possible structure:

```text
id
contact_id
name
```

Examples:

```text
Founder
AI
Berkeley
Recruiter
Investor
Designer
Product
Engineering
```

Do not overcomplicate tagging yet.

---

# 24. Contact Extraction Schema

Start with something similar to:

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

The schema may evolve.

Keep it simple at first.

---

# 25. Important AI Edge Cases

The system should eventually handle:

## Missing information

User:

> "I met Jason today. He's working on a startup."

Do not invent:

- last name
- company
- school
- role

## Multiple people

User:

> "I met Jason and Emma today. Jason works on robotics and Emma is a designer at Figma."

Return two people.

## Uncertainty

User:

> "I think Emma works at Google."

Represent uncertainty instead of stating the information as definite.

For the earliest MVP, it is acceptable to include this in notes.

## Casual speech

User may say:

> "Okay so like today I met this guy Jason and I think he's EECS? Anyway he's working on some robotics thing and we met at this founders event."

The extractor should still attempt to produce useful structured information.

---

# 26. User Experience

The MVP should feel:

- minimal
- fast
- modern
- personal
- conversational

Avoid spending excessive time on visual polish before the core flow works.

Functionality > animation.

## Main Screen

Something like:

```text
Who did you meet?

        🎙

     Tap to Record
```

Below that:

```text
Recent Contacts

Jason Chen
Sarah Kim
Alex Wang
```

## Recording Screen

Example:

```text
🎙 Recording...

00:13

[ Stop ]
```

## Review Screen

Example:

```text
New Contact

Name
Jason Chen

Company
—

Role
Founder

School
UC Berkeley

Major
EECS

Met at
AI Founders Mixer

Topics
Robotics
Startups

Notes
Building a robotics startup.

Follow up
Message next week

[ Edit ]

[ Save Contact ]
```

Every extracted field should eventually be editable.

## Contact List

Example:

```text
Your Network

Search...

Jason Chen
EECS · UC Berkeley

Sarah Kim
Product Manager

Alex Wang
Designer
```

## Contact Profile

Example:

```text
Jason Chen

Founder
EECS @ UC Berkeley

Tags
Berkeley
Founder
Robotics

About

Jason is an EECS student working on a
robotics startup.

Interactions

September 24
Berkeley Founders Mixer

- First met Jason
- Working on robotics startup
- Looking for designers

October 12
Cal Hacks

- Company raised funding
- Looking for ML engineers
```

Interactions should be ordered consistently.

---

# 27. Duplicate Contact Handling

Do not build complex entity resolution yet.

Initially, when saving someone with a similar name:

```text
You may already know this person.

Jason Chen
EECS @ UC Berkeley

Is this the same person?

[ Add interaction ]

[ Create new contact ]
```

For MVP matching, basic name matching is enough.

Do not use embeddings yet.

---

# 28. Suggested Project Structure

Keep this understandable.

```text
networking-voiceagent/
    mobile/
        app/
            index.tsx
            record.tsx
            review.tsx
            contacts/
                index.tsx
                [id].tsx

        components/
            RecordButton.tsx
            ContactCard.tsx
            ContactForm.tsx
            InteractionCard.tsx

        services/
            transcription.ts
            extraction.ts
            contacts.ts

        lib/
            supabase.ts

        types/
            contact.ts
            interaction.ts
            extraction.ts

    backend/
        app/
            main.py

            routes/
                transcription.py
                extraction.py

            services/
                whisper_service.py
                llm_service.py

            schemas/
                extraction.py

            core/
                config.py

        requirements.txt

    PROJECT_CONTEXT.md
    README.md
    .gitignore
```

This structure is a guideline, not a strict requirement.

Do not create unnecessary abstractions just to follow the structure.

---

# 29. Local Development Architecture

For the MVP, AI models run on the developer laptop.

Example:

```text
iPhone / Expo Go
       │
       │ Wi-Fi
       ▼
MacBook
       │
       ├── FastAPI :8000
       │
       ├── Ollama :11434
       │
       └── faster-whisper
```

Important:

When running the React Native app on a physical phone:

```text
localhost
```

means the PHONE itself.

Therefore the app cannot call:

```text
http://localhost:8000
```

to reach FastAPI running on the laptop.

Instead, during local testing, use the laptop's local network IP.

Example:

```text
http://192.168.x.x:8000
```

Both devices must normally be on the same local network.

Do not hardcode this throughout the application.

Use an environment/config variable such as:

```text
EXPO_PUBLIC_API_URL
```

---

# 30. Environment Variables

Mobile app:

```text
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Backend:

```text
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
```

Do not commit local `.env` files.

Provide:

```text
.env.example
```

containing variable names but no secrets.

---

# 31. Security

Important rules:

- Never expose secret API keys in the frontend.
- Store secrets in server-side environment variables.
- Never commit `.env` files.
- Validate API responses.
- Validate LLM output.
- Treat transcripts as potentially sensitive user data.
- Do not log sensitive information unnecessarily.
- Never expose the Supabase service-role key inside the mobile app.

When authentication is introduced:

- every contact belongs to a user
- every interaction belongs to a user
- enable Row Level Security
- users must only access their own records

---

# 32. Privacy Principles

The app deals with information about real people.

For the MVP:

- recording should only happen after an explicit user action
- do not continuously listen
- make recording status visually obvious
- allow users to edit or delete saved information
- do not secretly enrich profiles with external data
- do not automatically message anyone
- do not upload information unnecessarily

Always prefer clear user control.

---

# 33. No Paid AI APIs

For the MVP, do not use paid AI APIs.

Speech:

```text
faster-whisper
```

LLM:

```text
Qwen3 through Ollama
```

Both run locally.

This means development inference cost is effectively:

```text
$0 per request
```

aside from the developer's own hardware/electricity.

Supabase should initially use its free plan.

Important limitation:

"Free" refers to development and MVP testing.

For a public production application, local AI models still require compute somewhere.

Do NOT solve production-scale AI hosting yet.

The laptop is the inference server for the MVP.

---

# 34. Authentication

Do NOT prioritize authentication before the AI pipeline works.

Development order:

```text
voice
↓
transcription
↓
extraction
↓
review
↓
database
↓
authentication
```

Once database functionality works, implement Supabase Auth.

---

# 35. Git & GitHub Rules

GitHub is the source of truth for this project.

After every meaningful code or configuration change:

1. verify the change works
2. review `git status`
3. review the diff
4. stage the change
5. commit with a small descriptive message
6. push to GitHub

Do not batch unrelated changes into one commit.

Good commit examples:

```text
Initialize Expo mobile app
Add FastAPI health endpoint
Connect mobile app to backend
Add microphone permission handling
Implement audio recording
Add audio playback for debugging
Upload recordings to FastAPI
Add faster-whisper transcription
Add Qwen contact extraction
Add contact review screen
Set up Supabase contacts table
Save interactions to database
```

Avoid vague commit messages like:

```text
update stuff
worked on app
fixes
changes
```

Never commit:

- `.env`
- API keys
- secrets
- local temporary audio files
- generated build artifacts that should be ignored
- virtual environments
- `node_modules`

Before every commit, inspect the diff.

Do not let Cursor and Claude Code edit the same repo at the same time.

Use this workflow:

```text
one agent/task
↓
review
↓
test
↓
commit
↓
push
↓
next agent/task
```

---

# 36. Cursor Rules

Cursor is the main IDE.

Before making architectural changes:

- read this file
- inspect existing code
- explain the proposed change
- keep the implementation scoped
- do not rewrite unrelated code

Use Ask/Plan modes when appropriate before Agent mode.

When I ask for implementation, prefer small milestones.

Do not implement multiple future features unless explicitly requested.

---

# 37. Claude Code Rules

Claude Code may be used as a terminal coding agent.

Before making changes:

- read `PROJECT_CONTEXT.md`
- inspect the relevant files
- explain or plan the change when appropriate
- do not make unrelated edits
- verify the change
- review the diff
- commit and push after a meaningful completed change

Do not make changes simultaneously with Cursor Agent.

---

# 38. Development Milestones

Build the app incrementally.

## Milestone 0 — Repository Setup

Goal:

Create the repo structure and confirm GitHub works.

Build:

```text
mobile/
backend/
PROJECT_CONTEXT.md
README.md
.gitignore
```

Learn:

- Git repository basics
- `pwd`
- `ls`
- `cd`
- `git status`
- commits
- pushes

---

## Milestone 1 — Basic Expo App

Goal:

App runs.

Build:

- basic screen
- microphone button
- simple UI

Learn:

- React Native components
- JSX
- TypeScript
- state
- event handlers

---

## Milestone 2 — FastAPI Health Check

Goal:

Backend runs.

Build:

```text
GET /health
```

Expected:

```json
{
  "status": "ok"
}
```

Then connect the mobile app to the backend and display:

```text
Backend connected
```

Learn:

- frontend vs backend
- HTTP
- GET requests
- IP addresses
- client/server architecture

---

## Milestone 3 — Audio Recording

Goal:

User can record audio.

Build incrementally:

1. button state
2. microphone permission
3. start recording
4. stop recording
5. audio URI
6. playback for debugging

Learn:

- permissions
- async/await
- device APIs
- file URIs
- React state

---

## Milestone 4 — Audio Upload

Goal:

Send the audio file to FastAPI.

Build:

```text
recording.m4a
↓
FormData
↓
POST /transcribe
↓
FastAPI receives file
```

Learn:

- HTTP POST
- multipart form data
- file uploads
- client/server debugging

---

## Milestone 5 — Transcription

Goal:

Audio becomes text.

Build:

```text
Audio
↓
FastAPI
↓
faster-whisper
↓
Transcript
```

Display transcript on screen.

Learn:

- local ML inference
- model loading
- server-side processing
- latency

---

## Milestone 6 — AI Extraction

Goal:

Transcript becomes structured contact data.

Build:

```text
Transcript
↓
Qwen3 via Ollama
↓
Pydantic validated JSON
```

Learn:

- LLM inference
- system prompts
- structured outputs
- JSON schemas
- validation

---

## Milestone 7 — Review Screen

Goal:

Display extracted information.

Allow the user to edit incorrect information.

Learn:

- forms
- state management
- controlled inputs
- passing data between screens

---

## Milestone 8 — Supabase

Goal:

Save contact and interaction.

Learn:

- databases
- tables
- rows
- SQL
- primary keys
- foreign keys
- inserts
- queries

---

## Milestone 9 — Contact Profiles

Goal:

See saved contacts and their history.

Learn:

- dynamic routes
- querying related data
- database relationships
- reusable components

---

## Milestone 10 — Multiple Interactions

Goal:

Record another interaction with an existing person.

Learn:

- relational data
- updating vs inserting
- basic entity matching

---

# 39. Error Handling

Do not ignore errors.

Handle cases like:

- microphone permission denied
- recording failure
- network request fails
- FastAPI unreachable
- transcription fails
- LLM output invalid
- database insert fails
- no person detected
- empty transcript

Display simple user-facing messages.

Also log useful development information during development.

Avoid swallowing errors silently.

---

# 40. Definition of a Successful MVP

The MVP is successful when I can:

1. Open the app.
2. Press record.
3. Say:

> "Today I met Alex at the Berkeley startup mixer. She's a designer building a social app and we talked about collaborating."

4. Stop recording.
5. See the transcript.
6. See extracted information about Alex.
7. Correct the information if needed.
8. Save Alex.
9. Open Alex's profile.
10. See the interaction I just recorded.

That is the MVP.

Everything else comes later.

---

# 41. Long-Term Vision

Do not build these yet, but keep the architecture flexible enough that the product could eventually support:

- personalized contact categories
- AI relationship memory
- natural-language search

Examples:

> "Who do I know at Google?"

> "Who did I meet recently who's working on robotics?"

> "Who should I follow up with?"

> "Who was the founder I met at that Berkeley AI event?"

Potential future features:

- reminders
- email integration
- calendar integration
- LinkedIn enrichment
- networking insights
- personalized categorization
- contact relationship strength
- voice-based retrieval
- agentic follow-ups

The long-term concept is:

> A personal AI memory system for relationships and networking.

But the current priority remains the simple voice → contact workflow.

---

# 42. Current Priority

If unsure what to work on next, prioritize this sequence:

```text
1. Repository setup
2. Expo app runs
3. FastAPI /health works
4. Mobile app reaches FastAPI
5. Record voice
6. Verify audio playback
7. Upload audio
8. Get transcript
9. Extract structured data
10. Show review screen
11. Save contact + interaction
12. Display contact profile
```

Do not skip ahead until the previous stage works reliably.
