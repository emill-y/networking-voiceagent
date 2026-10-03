import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { PageLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { ApiError } from "@/lib/api";
import { makeStyles, space } from "@/lib/theme";
import { acceptShare, declineShare, shareFromLink } from "@/services/nomi";
import type { IncomingShare } from "@/types/api";

// Opened from a share link: review the contacts, then add them (or not).
export default function Shared() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [share, setShare] = useState<IncomingShare | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  useEffect(() => {
    shareFromLink(token)
      .then(setShare)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t open this share."));
  }, [token]);

  async function respond(accept: boolean) {
    if (!share) return;
    setBusy(accept ? "accept" : "decline");
    try {
      if (accept) {
        const result = await acceptShare(share.id, token);
        toast.show(`Added ${result.added} contact${result.added === 1 ? "" : "s"}`, "success");
      } else {
        await declineShare(share.id, token);
      }
      router.replace("/contacts");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "That didn’t work.", "danger");
      setBusy(null);
    }
  }

  if (error) {
    return (
      <Page width="narrow">
        <EmptyState icon="inbox" title="This share isn’t available" body={error}
          action={<Button title="Go to Contacts" onPress={() => router.replace("/contacts")} />} />
      </Page>
    );
  }
  if (!share) return <Page width="narrow"><PageLoader /></Page>;

  return (
    <Page title={`${share.senderName} shared ${share.count} contact${share.count === 1 ? "" : "s"}`} width="narrow">
      {share.message ? <Txt variant="bodySecondary">“{share.message}”</Txt> : null}
      <Card padding="none">
        {share.names.map((name, i) => (
          <View key={`${name}-${i}`} style={[s.row, i > 0 && s.border]}>
            <Avatar name={name} size={32} />
            <Txt variant="label">{name}</Txt>
          </View>
        ))}
        {share.count > share.names.length && (
          <View style={[s.row, s.border]}><Txt variant="small">and {share.count - share.names.length} more</Txt></View>
        )}
      </Card>
      <View style={s.actions}>
        <Button title="Add to my contacts" variant="primary" loading={busy === "accept"} disabled={!!busy} onPress={() => void respond(true)} />
        <Button title="Decline" variant="ghost" loading={busy === "decline"} disabled={!!busy} onPress={() => void respond(false)} />
      </View>
    </Page>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, minHeight: 52 },
    border: { borderTopWidth: 1, borderTopColor: colors.border },
    actions: { flexDirection: "row", gap: space.xs },
  }),
);
