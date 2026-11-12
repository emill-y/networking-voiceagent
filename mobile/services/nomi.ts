// One function per backend endpoint. Screens call these instead of fetch.
import { File } from "expo-file-system";
import { Platform } from "react-native";

import { request } from "@/lib/api";
import { localToday } from "@/lib/dates";
import type {
  AmbientSession,
  CapturedPerson,
  ContactDetail,
  ContactSummary,
  ContactUpdate,
  DuplicateCandidate,
  FollowUp,
  MyProfile,
  NetworkResponse,
  SavedPerson,
  SearchResponse,
} from "@/types/api";

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

export function getNetwork() {
  return request<NetworkResponse>("/network");
}

// ---------- Contacts: export and sharing ----------

// The contacts in the current view as CSV (download) or TSV (paste into Google Sheets).
export function exportContacts(ids: string[] | null, format: "csv" | "tsv") {
  return request<string>("/contacts/export", { method: "POST", body: { ids, format }, text: true, timeoutMs: 60_000 });
}

// ---------- Profile and invites ----------

export function getMyProfile() {
  return request<MyProfile>("/me/profile");
}

export function updateMyProfile(changes: { displayName?: string | null; avatar?: string | null }) {
  return request<MyProfile>("/me/profile", { method: "PATCH", body: changes, timeoutMs: 30_000 });
}

export function redeemInvite(code: string) {
  return request<{ redeemed: boolean }>("/invites/redeem", { method: "POST", body: { code } });
}

// ---------- Ambient sessions ----------

export function startSession(title: string | null, you: string | null = null) {
  return request<AmbientSession>("/sessions", { method: "POST", body: { title, you } });
}

// Past sessions, newest first.
export function listSessions() {
  return request<AmbientSession[]>("/sessions");
}

// Keep the people you confirmed; the session stays in your history.
export function saveSession(id: string, people: CapturedPerson[]) {
  return request<AmbientSession>(`/sessions/${encodeURIComponent(id)}/save`, { method: "POST", body: { people }, timeoutMs: 60_000 });
}

export function activeSession() {
  return request<AmbientSession | null>("/sessions/active");
}

export function getSession(id: string) {
  return request<AmbientSession>(`/sessions/${encodeURIComponent(id)}`);
}

// One chunk of audio: a blob: URL on the web, a file URI on phones.
export async function uploadSessionChunk(id: string, seq: number, audio: string | Blob) {
  const form = new FormData();
  form.append("seq", String(seq));
  form.append("today", localToday());
  if (typeof audio !== "string") {
    form.append("audio", audio, audio.type.includes("mp4") ? `chunk-${seq}.m4a` : `chunk-${seq}.webm`);
  } else if (Platform.OS === "web") {
    const blob = await (await fetch(audio)).blob();
    form.append("audio", blob, blob.type.includes("mp4") ? `chunk-${seq}.m4a` : `chunk-${seq}.webm`);
  } else {
    form.append("audio", new File(audio) as unknown as Blob, `chunk-${seq}.m4a`);
  }
  return request<AmbientSession>(`/sessions/${encodeURIComponent(id)}/chunks`, { method: "POST", body: form, timeoutMs: 90_000 });
}

export function finishSession(id: string) {
  return request<AmbientSession>(`/sessions/${encodeURIComponent(id)}/finish`, { method: "POST", timeoutMs: 120_000 });
}

// Name a session (or rename it after it ended). null clears the name.
export function renameSession(id: string, title: string | null) {
  return request<AmbientSession>(`/sessions/${encodeURIComponent(id)}`, { method: "PATCH", body: { title } });
}

export function deleteSession(id: string) {
  return request<void>(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function createFollowUp(contactId: string, action: string, dueAt: string | null = null) {
  return request<FollowUp>("/follow-ups", { method: "POST", body: { contactId, action, dueAt } });
}

export function updateFollowUp(id: string, changes: Partial<Pick<FollowUp, "action" | "dueAt" | "status">>) {
  return request<FollowUp>(`/follow-ups/${encodeURIComponent(id)}`, { method: "PATCH", body: changes });
}
