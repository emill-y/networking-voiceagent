-- Voice differentiation: the voices heard so far in a session that's still
-- recording, as [{"id": 1, "print": [256 numbers], "seconds": 42.5}], so the
-- same person keeps the same "Speaker N" label from chunk to chunk.
-- Voiceprints are biometric data: emptied as soon as the session ends.
alter table public.ambient_sessions add column if not exists voices jsonb not null default '[]';
