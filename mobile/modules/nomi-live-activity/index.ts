// The recording session on the lock screen and in the Dynamic Island (iPhone).
// The view itself is in targets/widget; this only starts, updates and ends it.
// Does nothing on the web, on Android, or where Live Activities are off.
import { requireOptionalNativeModule } from "expo";

type Native = {
  isSupported(): boolean;
  start(title: string, startedAtMs: number, people: number, latest: string | null): Promise<void>;
  update(people: number, latest: string | null, listening: boolean): Promise<void>;
  end(): Promise<void>;
};

const native = requireOptionalNativeModule<Native>("NomiLiveActivity");

export const liveActivitySupported = (): boolean => {
  try {
    return !!native?.isSupported();
  } catch {
    return false;
  }
};

export function startLiveActivity(title: string | null, startedAt: string, people: number, latest: string | null) {
  if (!liveActivitySupported()) return;
  void native!.start(title ?? "Session", Date.parse(startedAt) || Date.now(), people, latest).catch(() => undefined);
}

export function updateLiveActivity(people: number, latest: string | null, listening = true) {
  if (!native) return;
  void native.update(people, latest, listening).catch(() => undefined);
}

export function endLiveActivity() {
  if (!native) return;
  void native.end().catch(() => undefined);
}
