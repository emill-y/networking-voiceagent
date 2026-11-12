import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { ListRow } from "@/components/ListRow";
import { PageLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { SessionTitle } from "@/components/SessionTitle";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { sessionLength } from "@/lib/sessions";
import { makeStyles, radius, space } from "@/lib/theme";
import { deleteSession, getSession } from "@/services/nomi";
import type { AmbientSession } from "@/types/api";

// A saved session: when and where, and everyone you met there.
export default function SessionDetail() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<AmbientSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getSession(id)
        .then((found) => {
          if (!active) return;
          if (found.status === "ready") router.replace(`/sessions/${id}/review`);
          else if (found.status === "recording") router.replace("/session");
          else setSession(found);
        })
        .catch((e) => active && setError(e instanceof ApiError ? e.message : "Couldn’t open this session."));
      return () => {
        active = false;
      };
    }, [id, router]),
  );

  async function remove() {
    if (!(await confirm("Remove this session?", "The people you met stay in your network.", "Remove"))) return;
    try {
      await deleteSession(id);
      router.replace("/");
    } catch {
      toast.show("Couldn’t remove the session.", "danger");
    }
  }

  if (!session) {
    return (
      <Page tabBar={false} width="narrow" back={{ label: "Sessions", href: "/" }} scroll={!!error}>
        {error ? <Txt variant="bodySecondary">{error}</Txt> : <PageLoader />}
      </Page>
    );
  }

  const contacts = session.contacts ?? [];
  const when = new Date(session.startedAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <Page tabBar={false} width="narrow" back={{ label: "Sessions", href: "/" }}>
      <View style={s.intro}>
        <Txt variant="overline">{when} · {sessionLength(session)}</Txt>
        <SessionTitle session={session} onRenamed={(next) => setSession((c) => (c ? { ...c, title: next.title, titleAuto: next.titleAuto } : c))} />
        <Txt variant="bodySecondary">
          {contacts.length ? `You met ${contacts.length} ${contacts.length === 1 ? "person" : "people"}.` : "No one from this session is in your network anymore."}
        </Txt>
      </View>

      {contacts.length > 0 && (
        <View style={s.list}>
          {contacts.map((c) => (
            <ListRow key={c.id} title={c.name} chevron
              subtitle={[c.role && c.company ? `${c.role} at ${c.company}` : c.role || c.company, c.school].filter(Boolean).join(" · ") || null}
              leading={<Avatar name={c.name} size={36} />}
              onPress={() => router.push(`/contacts/${c.id}`)} />
          ))}
        </View>
      )}

      <Button title="Remove session" variant="ghost" size="sm" onPress={() => void remove()} style={s.center} />
    </Page>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    intro: { gap: space.xs },
    list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.xxs },
    center: { alignSelf: "center" },
  }),
);
