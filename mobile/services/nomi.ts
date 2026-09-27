// One function per backend endpoint. Screens call these instead of fetch.
import { File } from "expo-file-system";
import { Platform } from "react-native";

import type { ImportedPerson } from "@/lib/addressBook";
import { request } from "@/lib/api";
import { localToday } from "@/lib/dates";
import type {
  CapturedPerson,
  ContactDetail,
  ContactExtractionResult,
  ContactSummary,
  ContactUpdate,
  DuplicateCandidate,
  FollowUp,
  FollowUpStatus,
  NetworkResponse,
  SavedPerson,
  SearchResponse,
  Transcription,
} from "@/types/api";

export async function transcribe(audioUri: string): Promise<Transcription> {
  const form = new FormData();
  if (Platform.OS === "web") {
    // On web the recorder gives a blob: URL; upload the Blob itself.
    const blob = await (await fetch(audioUri)).blob();
    form.append("audio", blob, blob.type.includes("mp4") ? "note.m4a" : "note.webm");
  } else {
    // Expo's fetch (the global fetch since SDK 57) needs a real file object;
    // React Native's old { uri, name, type } shortcut isn't supported and
    // fails before anything is sent.
    form.append("audio", new File(audioUri) as unknown as Blob, "note.m4a");
  }
  // Whisper can take a while on a laptop CPU, especially on the first call.
  return request<Transcription>("/transcribe", { method: "POST", body: form, timeoutMs: 180_000 });
}

export function extract(transcript: string) {
  return request<ContactExtractionResult>("/extract", {
    method: "POST",
    body: { transcript, today: localToday() },
    timeoutMs: 180_000,
  });
}

export function duplicateCheck(people: { name: string | null; company: string | null; school: string | null }[]) {
  return request<{ matches: DuplicateCandidate[][] }>("/duplicate-check", {
    method: "POST",
    body: { people },
  });
}

export function saveCapture(
  transcript: string | null,
  people: CapturedPerson[],
  sourceType: "voice" | "manual" = "voice",
) {
  return request<{ saved: SavedPerson[] }>("/captures", {
    method: "POST",
    body: { transcript, people, sourceType },
  });
}

export function listContacts() {
  return request<ContactSummary[]>("/contacts");
}

export function getContact(id: string) {
  return request<ContactDetail>(`/contacts/${encodeURIComponent(id)}`);
}

export function updateContact(id: string, changes: ContactUpdate) {
  return request<ContactDetail>(`/contacts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: changes,
  });
}

export function deleteContact(id: string) {
  return request<void>(`/contacts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function deleteInteraction(id: string) {
  return request<void>(`/interactions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listFollowUps(status?: FollowUpStatus) {
  return request<FollowUp[]>(`/follow-ups${status ? `?status=${status}` : ""}`);
}

export function createFollowUp(contactId: string, action: string, dueAt: string | null = null) {
  return request<FollowUp>("/follow-ups", { method: "POST", body: { contactId, action, dueAt } });
}

export function updateFollowUp(
  id: string,
  changes: Partial<Pick<FollowUp, "action" | "dueAt" | "status">>,
) {
  return request<FollowUp>(`/follow-ups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: changes,
  });
}

export function search(query: string) {
  return request<SearchResponse>("/search", { method: "POST", body: { query, today: localToday() }, timeoutMs: 60_000 });
}

export function exportData() {
  return request<{ exportedAt: string; contacts: ContactDetail[] }>("/me/export", {
    timeoutMs: 60_000,
  });
}

export function deleteAllData() {
  return request<void>("/me/data", { method: "DELETE" });
}

export function deleteAccount() {
  return request<void>("/me", { method: "DELETE" });
}

export function importContacts(people: ImportedPerson[]) {
  return request<{ created: number; updated: number; unchanged: number }>("/contacts/import", {
    method: "POST",
    body: { people },
    timeoutMs: 60_000,
  });
}

export function getNetwork() {
  return request<NetworkResponse>("/network");
}
