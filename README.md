# networking-voiceagent

Voice agent for networking conversations: mobile client plus backend services.

## Layout

```
networking-voiceagent/
├── mobile/              # Mobile client
├── backend/             # API, voice, and agent services
├── PROJECT_CONTEXT.md   # Product and architecture context
├── README.md
└── .gitignore
```

## Getting started

### Mobile (Milestone 1)

```bash
cd mobile
npm install
npx expo start
```

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for goals, constraints, and how the pieces are expected to fit together.
