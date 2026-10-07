import { useEffect, useState } from "react";
import { Platform, Share, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, RadialGradient, Rect, Stop } from "react-native-svg";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { QrCode } from "@/components/QrCode";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useAccount } from "@/hooks/useAccount";
import { useDesktop } from "@/hooks/useDesktop";
import { copyText } from "@/lib/files";
import { firstName } from "@/lib/suggest";
import { font, makeStyles, orb, radius, space } from "@/lib/theme";
import { getMyProfile } from "@/services/nomi";
import type { MyProfile } from "@/types/api";

const CARD_WIDTH = 340;

// Invite friends: a share card (QR + link) that looks good in a text or a story.
export default function Invite() {
  const s = useStyles();
  const toast = useToast();
  const desktop = useDesktop();
  const account = useAccount();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => undefined);
  }, []);

  if (!profile) return <Page title="Invite friends" width="narrow" back={desktop ? undefined : { label: "Profile", href: "/profile" }}><PageLoader /></Page>;

  const name = account.name.includes("@") ? "" : firstName(account.name);
  const message = `${name ? `${name} invited you to Nomi` : "Join me on Nomi"}: a second brain for the people you meet. ${profile.inviteLink}`;

  async function share() {
    if (Platform.OS === "web") {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: "Nomi", text: message, url: profile!.inviteLink });
        } catch {
          // Closing the share sheet isn't an error.
        }
        return;
      }
      if (await copyText(message)) toast.show("Invite copied", "success");
      return;
    }
    await Share.share({ message });
  }

  return (
    <Page title="Invite friends" width="narrow" back={desktop ? undefined : { label: "Profile", href: "/profile" }}>
      <View style={[s.layout, desktop && s.layoutWide]}>
        <View style={s.cardWrap}>
          <InviteCard name={name} link={profile.inviteLink} />
        </View>
        <View style={s.side}>
          <Txt variant="heading">Bring your people</Txt>
          <Txt variant="bodySecondary">Nomi is better when the people you meet use it too: share contacts with each other and plan events together.</Txt>
          <View style={s.actions}>
            <Button title="Share invite" icon="share" variant="primary" onPress={() => void share()} />
            <Button title="Copy link" icon="link" onPress={() => void copyText(profile.inviteLink).then((ok) => ok && toast.show("Link copied", "success"))} />
          </View>
          <Card style={s.stat}>
            <Txt variant="stat">{profile.invitedCount}</Txt>
            <Txt variant="small">{profile.invitedCount === 1 ? "friend joined" : "friends joined"} with your link</Txt>
          </Card>
        </View>
      </View>
    </Page>
  );
}

// Always the dark, cosmic card (it's an image people share, not app chrome).
function InviteCard({ name, link }: { name: string; link: string }) {
  const s = useStyles();
  return (
    <View style={s.card} accessibilityLabel="Your Nomi invite card">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="inv-glow" cx="85%" cy="0%" r="80%">
            <Stop offset="0" stopColor={orb.mid} stopOpacity={0.45} />
            <Stop offset="1" stopColor={orb.mid} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="inv-planet" cx="38%" cy="32%" r="72%">
            <Stop offset="0" stopColor={orb.light} />
            <Stop offset="0.5" stopColor={orb.mid} />
            <Stop offset="1" stopColor={orb.deep} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="#121419" />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#inv-glow)" />
        <Ellipse cx={CARD_WIDTH - 40} cy={70} rx={110} ry={38} stroke="rgba(255,255,255,0.18)" strokeWidth={1} fill="none" transform={`rotate(-18 ${CARD_WIDTH - 40} 70)`} />
        <Circle cx={CARD_WIDTH - 40} cy={70} r={26} fill="url(#inv-planet)" />
        <Circle cx={CARD_WIDTH - 140} cy={98} r={3} fill="#F3EFE9" />
      </Svg>
      <View style={s.cardContent}>
        <Txt variant="overline" style={s.cardBrand}>Nomi</Txt>
        <View style={s.cardText}>
          <Txt variant="title" style={s.cardTitle}>{name ? `${name} invited you to Nomi` : "You’re invited to Nomi"}</Txt>
          <Txt variant="small" style={s.cardSub}>A second brain for the people you meet.</Txt>
        </View>
        <View style={s.qrRow}>
          <View style={s.qr}><QrCode value={link} size={112} /></View>
          <View style={s.cardText}>
            <Txt variant="caption" style={s.cardSub}>Scan or visit</Txt>
            <Txt variant="small" style={s.cardLink} numberOfLines={1}>{new URL(link).host}</Txt>
            <Txt variant="caption" style={s.cardSub}>Invite code {new URL(link).searchParams.get("invite")}</Txt>
          </View>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    layout: { gap: space.xl },
    layoutWide: { flexDirection: "row", alignItems: "flex-start" },
    cardWrap: { alignItems: "center" },
    side: { flex: 1, gap: space.sm, minWidth: 260 },
    actions: { flexDirection: "row", gap: space.xs, flexWrap: "wrap", marginTop: space.xs },
    stat: { marginTop: space.md, gap: 2 },
    card: { width: CARD_WIDTH, height: 440, borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
    cardContent: { flex: 1, padding: space.lg, justifyContent: "space-between" },
    cardBrand: { color: "#F5A06C", letterSpacing: 2 },
    cardText: { gap: space.xxs, flexShrink: 1 },
    cardTitle: { color: "#F3EFE9", fontSize: 26, lineHeight: 31, fontFamily: font.heading },
    cardSub: { color: "#A9A49C" },
    cardLink: { color: "#F3EFE9", fontWeight: "600" },
    qrRow: { flexDirection: "row", alignItems: "center", gap: space.md },
    qr: { padding: 6, borderRadius: radius.md, backgroundColor: "#FFFFFF" },
  }),
);
