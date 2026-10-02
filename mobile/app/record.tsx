import { AudioCapture } from "@/components/AudioCapture";
import { LiveCapture } from "@/components/LiveCapture";
import { liveTranscriptionAvailable } from "@/lib/speech";

// Live on-device transcription in real builds; record-and-upload where the
// native speech module isn't available (Expo Go, web).
export default function Record() {
  return liveTranscriptionAvailable() ? <LiveCapture /> : <AudioCapture />;
}
