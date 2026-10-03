import { useRouter } from "expo-router";

import { Button } from "@/components/Button";

// The way out of a flow (recording, review): a clear red "Close".
export function CloseButton({ label = "Close", onPress }: { label?: string; onPress?: () => void }) {
  const router = useRouter();
  const close = onPress ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  return <Button title={label} icon="close" variant="danger" size="sm" onPress={close} />;
}
