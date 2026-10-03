import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/Input";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { ApiError } from "@/lib/api";
import { copyText } from "@/lib/files";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { shareContacts } from "@/services/nomi";
import type { ShareCreated } from "@/types/api";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Share contacts with someone by email. They see them after signing in to
// Nomi with that email (or from the link) and choose to add them.
export function ShareContactsSheet({ visible, contactIds, label, onClose }: {
  visible: boolean;
  contactIds: string[];
  label: string;
  onClose: () => void;
}) {
  const s = useStyles();
  const toast = useToast();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<ShareCreated | null>(null);

  useEffect(() => {
    if (visible) {
      setSent(null);
      setError(null);
    }
  }, [visible]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const result = await shareContacts(contactIds, email.trim(), message.trim());
      setSent(result);
      if (result.emailed) toast.show(`Shared with ${email.trim()}`, "success");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t share those contacts.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet visible={visible} title={sent ? "Shared" : `Share ${label}`} onClose={onClose}
      footer={sent ? <Button title="Done" variant="primary" onPress={onClose} /> : (
        <>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button title={`Share ${contactIds.length}`} icon="send" variant="primary" loading={sending}
            disabled={!EMAIL.test(email.trim()) || !contactIds.length} onPress={() => void send()} />
        </>
      )}>
      {sent ? (
        <View style={s.done}>
          <View style={s.doneIcon}><Icon name="checkCircle" size={22} color={colors.success} /></View>
          <Txt variant="body">
            {sent.emailed
              ? `We emailed ${email.trim()}. They’ll see ${sent.count} contact${sent.count === 1 ? "" : "s"} when they sign in to Nomi with that email.`
              : `${sent.count} contact${sent.count === 1 ? " is" : "s are"} waiting for ${email.trim()} in Nomi. Send them this link so they know:`}
          </Txt>
          {!sent.emailed && (
            <View style={s.link}>
              <Txt variant="small" numberOfLines={1} style={s.flex} selectable>{sent.link}</Txt>
              <Button title="Copy" size="sm" icon="copy" onPress={() => void copyText(sent.link).then((ok) => ok && toast.show("Link copied", "success"))} />
            </View>
          )}
        </View>
      ) : (
        <>
          <Txt variant="small">They’ll get each contact’s name, role, company, school and links. Your private notes stay with you.</Txt>
          <Input label="Their email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
            autoCorrect={false} placeholder="friend@school.edu" />
          <Input label="Message (optional)" value={message} onChangeText={setMessage} placeholder="You should meet these people"
            maxLength={500} />
          {error ? <Txt variant="small" tone="danger">{error}</Txt> : null}
        </>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    done: { gap: space.md },
    doneIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.successSoft },
    link: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.xs,
      paddingLeft: space.sm,
      paddingRight: space.xxs,
      paddingVertical: space.xxs,
      borderRadius: radius.md,
      backgroundColor: colors.sunken,
    },
  }),
);
