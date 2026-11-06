import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon, type IconName } from "@/components/Icon";
import { Input } from "@/components/Input";
import { Page } from "@/components/Page";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { useAccount } from "@/hooks/useAccount";
import { ApiError } from "@/lib/api";
import { canPickPhoto, pickPhoto } from "@/lib/avatar";
import { confirm } from "@/lib/confirm";
import { localToday } from "@/lib/dates";
import { exitDemo, isDemo } from "@/lib/demo";
import { saveText } from "@/lib/files";
import { supabase } from "@/lib/supabase";
import { makeStyles, space, useTheme } from "@/lib/theme";
import { deleteAccount, deleteAllData, exportContacts, updateMyProfile } from "@/services/nomi";

export default function Profile() {
  const desktop = useDesktop();
  const s = useStyles();
  const router = useRouter();
  const toast = useToast();
  const account = useAccount();
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

  const deleteEverything = async () => {
    const ok = await confirm("Delete all your data?", "Every session, person and note will be permanently deleted.", "Delete everything");
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

  return (
    <Page title="Profile" width="narrow" back={desktop ? undefined : { label: "Sessions", href: "/" }} tabBar={false}>
      <Card padding="lg" style={s.identity}>
        <Avatar name={account.name} uri={account.avatarUrl} size={72} />
        <View style={s.identityText}>
          {name === null ? (
            <>
              <Txt variant="title" numberOfLines={1}>{account.name}</Txt>
              {account.email ? <Txt variant="small">{account.email}</Txt> : null}
              <Txt variant="caption">Sessions use your name so Nomi never adds you as someone you met.</Txt>
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
          </View>
        </View>
      </Card>

      <Group title="Your data">
        <Row icon="download" title="Export everyone you’ve met" detail="A spreadsheet (CSV) for Google Sheets or Excel"
          trailing={<Button title="Export" size="sm" loading={busy === "export"} onPress={() => void exportAll()} />} />
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
  }),
);
