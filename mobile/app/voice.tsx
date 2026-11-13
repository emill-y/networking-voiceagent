import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Card } from "@/components/Card";
import { Page } from "@/components/Page";
import { Txt } from "@/components/Txt";
import { VoiceSetup } from "@/components/VoiceSetup";
import { makeStyles, space } from "@/lib/theme";

// "Teach Nomi your voice": where the home screen's prompt leads after sign-in.
export default function Voice() {
  const s = useStyles();
  const router = useRouter();
  return (
    <Page tabBar={false} width="narrow" back={{ label: "Sessions", href: "/" }}>
      <View style={s.intro}>
        <Txt variant="display" accessibilityRole="header">Teach Nomi your voice</Txt>
        <Txt variant="bodySecondary">
          Sessions record everyone around you. Once Nomi knows your voice, it can tell you apart from the people you meet,
          so it only remembers them.
        </Txt>
      </View>
      <Card padding="lg">
        <VoiceSetup onSaved={() => setTimeout(() => router.replace("/"), 1200)} />
      </Card>
      <Txt variant="caption">You can record it again or delete it any time from your profile.</Txt>
    </Page>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    intro: { gap: space.xs },
  }),
);
