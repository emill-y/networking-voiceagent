import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { CalendarBanner } from "@/components/CalendarBanner";
import { Card } from "@/components/Card";
import { Icon, type IconName } from "@/components/Icon";
import { Input } from "@/components/Input";
import { Page } from "@/components/Page";
import { Segmented } from "@/components/Segmented";
import { Tag } from "@/components/Chip";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useAccount } from "@/hooks/useAccount";
import { useCalendar } from "@/hooks/useCalendar";
import { useProfile } from "@/hooks/useProfile";
import { profileLine } from "@/lib/account";
import { ApiError } from "@/lib/api";
import { canPickPhoto, pickPhoto } from "@/lib/avatar";
import { confirm } from "@/lib/confirm";
import { localToday } from "@/lib/dates";
import { exitDemo, isDemo } from "@/lib/demo";
import { contactsSupported } from "@/lib/deviceContacts";
import { saveText } from "@/lib/files";
import { supabase } from "@/lib/supabase";
import { makeStyles, radius, space, useTheme, type ThemeMode } from "@/lib/theme";
import { deleteAccount, deleteAllData, exportContacts, updateMyProfile } from "@/services/nomi";

export default function Profile() {
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const { colors, mode, setMode } = useTheme();
  const account = useAccount();
  const profile = useProfile();
  const calendar = useCalendar("/profile");
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<void>, failure: string) {
    setBusy(key);
    try {
      await action();
    } catch (e) {
      toast.show(e instanceof ApiError || e instanceof Error ? e.message : failure, "danger");
    } finally {
      setBusy(null);
    }
  }

  const changePhoto = () =>
    run("photo", async () => {
      const avatar = await pickPhoto();
      if (!avatar) return;
      await updateMyProfile({ avatar });
      account.refresh();
      toast.show("Photo updated", "success");
    }, "Couldn’t update your photo.");

  const removePhoto = () =>
    run("photo", async () => {
      await updateMyProfile({ avatar: null });
      account.refresh();
    }, "Couldn’t remove your photo.");

  const saveName = () =>
    run("name", async () => {
      await updateMyProfile({ displayName: (name ?? "").trim() || null });
      account.refresh();
      setName(null);
      toast.show("Name saved", "success");
    }, "Couldn’t save your name.");

  const exportAll = () =>
    run("export", async () => {
      const csv = await exportContacts(null, "csv");
      await saveText(`nomi-contacts-${localToday()}.csv`, csv, "text/csv");
    }, "Export didn’t work.");

  const disconnect = async () => {
    const ok = await confirm("Disconnect Google Calendar?", "Nomi stops reading your calendar and adding follow-ups to it. Events already added stay.", "Disconnect");
    if (ok) await calendar.disconnect();
  };

  const deleteEverything = async () => {
    const ok = await confirm("Delete all your data?", "Every contact, note and follow-up will be permanently deleted.", "Delete everything");
    if (ok) await run("delete", async () => {
      await deleteAllData();
      router.replace("/");
    }, "Couldn’t delete your data.");
  };

  const removeAccount = async () => {
    const ok = await confirm("Delete your account?", "Your account and everything in it will be permanently deleted.", "Delete account");
    if (ok) await run("account", async () => {
      await deleteAccount();
      await supabase?.auth.signOut();
    }, "Couldn’t delete your account.");
  };

  const calendarTag =
    calendar.state === "connected" ? <Tag label="Connected" tone="success" />
    : calendar.state === "needs_reauth" ? <Tag label="Needs reconnect" tone="warning" />
    : calendar.state === "disconnected" ? <Tag label="Not connected" />
    : calendar.state === "unavailable" ? <Tag label="Unavailable" />
    : null;

  return (
    <Page title="Profile" width="narrow">
      <Card padding="lg" style={s.identity}>
        <Avatar name={account.name} uri={account.avatarUrl} size={72} />
        <View style={s.identityText}>
          {name === null ? (
            <>
              <Txt variant="title" numberOfLines={1}>{account.name}</Txt>
              {account.email ? <Txt variant="small">{account.email}</Txt> : null}
              <Txt variant="small" tone="tertiary">{profileLine(profile)}</Txt>
            </>
          ) : (
            <View style={s.nameEdit}>
              <Input value={name} onChangeText={setName} placeholder="Your name" accessibilityLabel="Your name"
                containerStyle={s.flex} autoFocus onSubmitEditing={() => void saveName()} />
              <Button title="Save" variant="primary" loading={busy === "name"} onPress={() => void saveName()} />
              <Button title="Cancel" variant="ghost" onPress={() => setName(null)} />
            </View>
          )}
          <View style={s.identityActions}>
            {name === null && <Button title="Edit name" size="sm" onPress={() => setName(account.name)} />}
            {canPickPhoto && <Button title={account.avatarUrl ? "Change photo" : "Add photo"} icon="camera" size="sm" loading={busy === "photo"} onPress={() => void changePhoto()} />}
            {canPickPhoto && account.avatarUrl && <Button title="Remove photo" size="sm" variant="ghost" onPress={() => void removePhoto()} />}
            <Button title="Edit details" size="sm" variant="ghost" onPress={() => router.push({ pathname: "/edit-profile", params: { edit: "1" } })} />
          </View>
        </View>
      </Card>

      <Group title="Integrations">
        <Row icon="calendar" title="Google Calendar"
          detail={calendar.status?.email && calendar.state !== "disconnected" ? calendar.status.email
            : calendar.state === "unavailable" ? "Not set up on this server yet"
            : "Add dated follow-ups to your calendar and see meetings on Home"}
          trailing={calendarTag} />
        {calendar.state === "needs_reauth" && (
          <View style={s.inset}><CalendarBanner calendar={calendar} prompt="" /></View>
        )}
        {(calendar.state === "connected" || calendar.state === "needs_reauth" || calendar.state === "disconnected") && (
          <View style={[s.inset, s.actionsRow]}>
            {calendar.state === "disconnected" && (
              <Button title="Connect Google Calendar" icon="calendar" variant="primary" size="sm" loading={calendar.busy === "connect"} onPress={() => void calendar.connect()} />
            )}
            {calendar.state === "needs_reauth" && (
              <Button title="Reconnect" variant="primary" size="sm" loading={calendar.busy === "connect"} onPress={() => void calendar.connect()} />
            )}
            {calendar.state !== "disconnected" && (
              <Button title="Disconnect" variant="secondary" size="sm" loading={calendar.busy === "disconnect"} onPress={() => void disconnect()} />
            )}
          </View>
        )}
        {calendar.state === "connected" && (
          <Row title="Add dated follow-ups automatically" detail="Off: add them one at a time from Follow-ups"
            trailing={<Switch value={!!calendar.status?.pushFollowUps} onValueChange={(v) => void calendar.setPush(v)}
              trackColor={{ true: colors.accent, false: colors.borderStrong }} thumbColor="#FFFFFF"
              {...({ activeThumbColor: "#FFFFFF" } as object)} />} />
        )}
        {calendar.error ? <Txt variant="small" tone="danger" style={s.inset}>{calendar.error}</Txt> : null}
      </Group>

      <Group title="Appearance">
        <Row icon={mode === "dark" ? "moon" : "sun"} title="Theme"
          trailing={<Segmented<ThemeMode> value={mode} onChange={setMode}
            options={[{ value: "dark", label: "Dark", icon: "moon" }, { value: "light", label: "Light", icon: "sun" }]} />} />
      </Group>

      <Group title="Invite friends">
        <Row icon="gift" title="Share Nomi" detail="Send your invite link or card" onPress={() => router.push("/invite")} chevron />
      </Group>

      <Group title="Your data">
        <Row icon="download" title="Export all contacts" detail="A spreadsheet (CSV) for Google Sheets or Excel"
          trailing={<Button title="Export" size="sm" loading={busy === "export"} onPress={() => void exportAll()} />} />
        {contactsSupported && (
          <Row icon="userPlus" title="Import from your phone" onPress={() => router.push("/import-contacts")} chevron />
        )}
      </Group>

      <Group title="Account">
        {isDemo() ? (
          <Row icon="logout" title="Exit demo" onPress={() => { exitDemo(); router.replace("/"); }} chevron />
        ) : (
          <Row icon="logout" title="Sign out" onPress={() => void supabase?.auth.signOut()} chevron />
        )}
        <Row icon="trash" title="Delete all data" danger onPress={() => void deleteEverything()} />
        <Row icon="trash" title="Delete account" danger onPress={() => void removeAccount()} />
      </Group>
    </Page>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.group}>
      <Txt variant="overline" style={s.groupTitle}>{title}</Txt>
      <Card padding="none" style={s.groupCard}>{children}</Card>
    </View>
  );
}

function Row({ icon, title, detail, trailing, onPress, chevron, danger }: {
  icon?: IconName;
  title: string;
  detail?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const content = (
    <>
      {icon && <Icon name={icon} size={17} color={danger ? colors.danger : colors.textSecondary} />}
      <View style={s.flex}>
        <Txt variant="label" tone={danger ? "danger" : "default"}>{title}</Txt>
        {detail ? <Txt variant="caption">{detail}</Txt> : null}
      </View>
      {trailing}
      {chevron && <Icon name="chevron" size={16} color={colors.textTertiary} />}
    </>
  );
  if (!onPress) return <View style={s.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ hovered }: { hovered?: boolean }) => [s.row, hovered && s.rowHover]}>
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    identity: { flexDirection: "row", alignItems: "center", gap: space.lg, flexWrap: "wrap" },
    identityText: { flex: 1, minWidth: 220, gap: 2 },
    identityActions: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.sm },
    nameEdit: { flexDirection: "row", alignItems: "center", gap: space.xs },
    group: { gap: space.xs },
    groupTitle: { paddingHorizontal: space.xxs },
    groupCard: { paddingVertical: space.xxs },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 56, paddingHorizontal: space.md, paddingVertical: space.xs },
    rowHover: { backgroundColor: colors.surfaceHover },
    inset: { paddingHorizontal: space.md, paddingBottom: space.sm },
    actionsRow: { flexDirection: "row", gap: space.xs, flexWrap: "wrap", paddingLeft: space.md + 17 + space.sm },
    badge: { borderRadius: radius.pill },
  }),
);
