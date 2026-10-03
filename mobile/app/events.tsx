import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Share, StyleSheet, View } from "react-native";
import { Image } from "expo-image";

import { Avatar } from "@/components/Avatar";
import { Button, IconButton } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip, ChipRow, Tag } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/Input";
import { OrbitLoader } from "@/components/OrbitLoader";
import { Page } from "@/components/Page";
import { Segmented } from "@/components/Segmented";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { useProfile } from "@/hooks/useProfile";
import { ApiError } from "@/lib/api";
import { eventDate } from "@/lib/calendar";
import { dateToDueAt } from "@/lib/dates";
import { copyText } from "@/lib/files";
import { goAction, inviteText, parseInterests, planWhen } from "@/lib/plans";
import { isDemo } from "@/lib/demo";
import { saveProfile } from "@/lib/profile";
import { makeStyles, radius, space } from "@/lib/theme";
import { addEventFeed, createFollowUp, getPlans, listEventFeeds, removeEventFeed } from "@/services/nomi";
import type { EventFeed, Plan, PlanPerson, PlansResponse, RealEvent } from "@/types/api";

type Days = "7" | "14" | "30" | "90";
type Radius = "10" | "25" | "50";
const DAY_OPTIONS: { value: Days; label: string }[] = [
  { value: "7", label: "This week" },
  { value: "14", label: "2 weeks" },
  { value: "30", label: "Month" },
  { value: "90", label: "3 months" },
];
const MILES: { value: Radius; label: string }[] = [
  { value: "10", label: "10 mi" },
  { value: "25", label: "25 mi" },
  { value: "50", label: "50 mi" },
];

const canLocate = Platform.OS === "web" && typeof navigator !== "undefined" && !!navigator.geolocation;

export default function PlanEvents() {
  const s = useStyles();
  const desktop = useDesktop();
  const toast = useToast();
  const profile = useProfile();
  const [city, setCity] = useState(profile?.city ?? (isDemo() ? "San Francisco, CA" : ""));
  const [interests, setInterests] = useState((profile?.interests ?? [profile?.major].filter(Boolean) as string[]).join(", "));
  const [near, setNear] = useState<{ lat: number; lon: number } | null>(null);
  const [miles, setMiles] = useState<Radius>("25");
  const [days, setDays] = useState<Days>("30");
  const [categories, setCategories] = useState<string[]>([]);
  const [data, setData] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planned, setPlanned] = useState<Record<string, "saving" | "done">>({});
  const [locating, setLocating] = useState(false);
  const [feedsOpen, setFeedsOpen] = useState(false);
  const request = useRef(0);

  const hasPlace = !!near || !!city.trim();

  async function load() {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getPlans({
        city: city.trim(),
        interests: parseInterests(interests),
        days: Number(days),
        categories,
        near: near ? { ...near, radiusKm: Math.round(Number(miles) * 1.609) } : null,
      });
      if (id === request.current) setData(result);
    } catch (e) {
      if (id === request.current) setError(e instanceof ApiError ? e.message : "Couldn’t find events right now.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  // Filters apply as soon as they change; typing waits for Enter or "Update".
  useEffect(() => {
    if (hasPlace || data) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, categories.join(","), near?.lat, near?.lon, miles]);

  function applyText() {
    const wanted = parseInterests(interests);
    void saveProfile({ ...(profile ?? { persona: "other" }), city: city.trim(), interests: wanted }).catch(() => undefined);
    void load();
  }

  function locate() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNear({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.show("Location is off. Type your city instead.", "danger");
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  async function plan(event: RealEvent, people: PlanPerson[]) {
    const key = `${event.id}:${people.map((p) => p.contactId).join(",")}`;
    setPlanned((p) => ({ ...p, [key]: "saving" }));
    try {
      const day = eventDate(event.start, event.allDay);
      for (const person of people) {
        await createFollowUp(person.contactId, goAction(person.name, event.title), day ? dateToDueAt(day) : null);
      }
      setPlanned((p) => ({ ...p, [key]: "done" }));
      toast.show("Added to Follow-ups", "success");
    } catch (e) {
      setPlanned((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
      toast.show(e instanceof ApiError ? e.message : "Couldn’t plan that.", "danger");
    }
  }

  async function invite(event: RealEvent, person: PlanPerson, shared: string) {
    const message = inviteText(person.name, event, shared);
    try {
      if (Platform.OS === "web") {
        if (typeof navigator.share === "function") await navigator.share({ text: message });
        else if (await copyText(message)) toast.show("Invite copied", "success");
      } else {
        await Share.share({ message });
      }
    } catch {
      // Closing the share sheet isn't an error.
    }
  }

  const plans = data?.plans ?? [];
  const planIds = new Set(plans.map((p) => p.event.id));
  const others = (data?.events ?? []).filter((e) => !planIds.has(e.id));

  return (
    <Page title="Plan Events" actions={<Button title="Follow a calendar" icon="calendarAdd" variant="ghost" onPress={() => setFeedsOpen(true)} />}>
      <Card style={s.filters}>
        <View style={[s.filterRow, !desktop && s.filterStack]}>
          <View style={s.where}>
            {near ? (
              <View style={s.nearRow}>
                <Icon name="locate" size={16} color={s.accent.color} />
                <Txt variant="label">Near you</Txt>
                <Segmented<Radius> value={miles} onChange={setMiles} options={MILES} />
                <IconButton icon="close" label="Use a city instead" onPress={() => setNear(null)} size={30} tone="plain" />
              </View>
            ) : (
              <View style={s.nearRow}>
                <Input icon="pin" value={city} onChangeText={setCity} placeholder="City, e.g. Berkeley, CA" accessibilityLabel="City"
                  containerStyle={s.flex} onSubmitEditing={applyText} />
                {canLocate && <Button title="Near me" icon="locate" loading={locating} onPress={locate} />}
              </View>
            )}
          </View>
          <Input icon="spark" value={interests} onChangeText={setInterests} placeholder="Into: music, startups, pottery…"
            accessibilityLabel="Your interests, separated by commas" containerStyle={s.interests} onSubmitEditing={applyText} />
          <Button title="Update" variant="primary" loading={loading} disabled={!hasPlace} onPress={applyText} />
        </View>
        <View style={[s.filterRow, s.wrap]}>
          <Segmented<Days> value={days} onChange={setDays} options={DAY_OPTIONS} />
        </View>
        {data && data.categories.length > 0 && (
          <ChipRow>
            {data.categories.map((c) => (
              <Chip key={c.key} label={c.label} count={c.count} selected={categories.includes(c.key)}
                onPress={() => setCategories((cur) => (cur.includes(c.key) ? cur.filter((x) => x !== c.key) : [...cur, c.key]))} />
            ))}
            {categories.length > 0 && <Button title="All categories" size="sm" variant="ghost" onPress={() => setCategories([])} />}
          </ChipRow>
        )}
      </Card>

      {!hasPlace && !data ? (
        <Card padding="none">
          <EmptyState icon="pin" title="Where are you?" body="Add your city or use your location to see what’s happening nearby."
            action={canLocate ? <Button title="Use my location" icon="locate" variant="primary" loading={locating} onPress={locate} /> : undefined} />
        </Card>
      ) : loading && !data ? (
        <View style={s.loading}><OrbitLoader label="Finding events near you" /></View>
      ) : error ? (
        <EmptyState icon="alert" title="Couldn’t load events" body={error} action={<Button title="Try again" onPress={() => void load()} />} />
      ) : data && data.events.length === 0 ? (
        <Card padding="none">
          <EmptyState icon="ticket" title="No events found" body="Try more dates, a wider distance, or a nearby city." />
        </Card>
      ) : data ? (
        <View style={[s.results, loading && s.dim]}>
          {plans.length > 0 && (
            <View style={s.section}>
              <Txt variant="heading">Go with your people</Txt>
              <View style={[s.grid, desktop && s.gridDesktop]}>
                {plans.map((p) => (
                  <PlanCard key={p.event.id} plan={p} desktop={desktop}
                    state={planned[`${p.event.id}:${p.people.map((x) => x.contactId).join(",")}`]}
                    onPlan={() => void plan(p.event, p.people)} onInvite={(person) => void invite(p.event, person, p.shared)} />
                ))}
              </View>
            </View>
          )}
          {others.length > 0 && (
            <View style={s.section}>
              <Txt variant="heading">{plans.length ? "More events" : "Events"}</Txt>
              <Card padding="none">
                {others.map((event, i) => {
                  const person = event.people[0];
                  const key = person ? `${event.id}:${person.contactId}` : event.id;
                  return (
                    <EventRow key={event.id} event={event} first={i === 0} state={planned[key]}
                      onPlan={person ? () => void plan(event, [person]) : undefined} />
                  );
                })}
              </Card>
            </View>
          )}
        </View>
      ) : null}

      <FeedsSheet visible={feedsOpen} onClose={() => setFeedsOpen(false)} onChanged={() => void load()} />
    </Page>
  );
}

function PlanCard({ plan, desktop, state, onPlan, onInvite }: {
  plan: Plan;
  desktop: boolean;
  state?: "saving" | "done";
  onPlan: () => void;
  onInvite: (p: PlanPerson) => void;
}) {
  const s = useStyles();
  const { event } = plan;
  const names = plan.people.map((p) => p.name.split(" ")[0]).join(" & ");
  return (
    <Card padding="none" style={[s.planCard, desktop && s.planCardDesktop]}>
      {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={s.image} contentFit="cover" /> : null}
      <View style={s.planBody}>
        <View style={s.planTop}>
          <Txt variant="caption" tone="accent" weight="600">{planWhen(event)}</Txt>
          <Tag label={categoryLabel(event.category)} />
        </View>
        <Pressable disabled={!event.url} onPress={() => event.url && void Linking.openURL(event.url)} accessibilityRole="link">
          <Txt variant="heading" numberOfLines={2}>{event.title}</Txt>
        </Pressable>
        <Txt variant="caption" numberOfLines={1}>{[event.venue, event.city].filter(Boolean).join(" · ") || (event.online ? "Online" : "")}</Txt>
        <View style={s.withRow}>
          <View style={s.faces}>{plan.people.map((p) => <Avatar key={p.contactId} name={p.name} size={26} />)}</View>
          <Txt variant="label" style={s.flex} numberOfLines={1}>Go with {names}</Txt>
        </View>
        <Txt variant="small" numberOfLines={3}>{plan.why}</Txt>
        <View style={s.planActions}>
          <Button title={state === "done" ? "Planned" : "Plan it"} icon={state === "done" ? "check" : "calendarAdd"} variant="primary" size="sm"
            loading={state === "saving"} disabled={state === "done"} onPress={onPlan} />
          {plan.people.slice(0, 1).map((p) => (
            <Button key={p.contactId} title={`Invite ${p.name.split(" ")[0]}`} icon="send" size="sm" onPress={() => onInvite(p)} />
          ))}
        </View>
      </View>
    </Card>
  );
}

function EventRow({ event, first, state, onPlan }: { event: RealEvent; first: boolean; state?: "saving" | "done"; onPlan?: () => void }) {
  const s = useStyles();
  const person = event.people[0];
  return (
    <View style={[s.row, !first && s.border]}>
      <View style={s.dateCol}><Txt variant="caption" tone="accent" weight="600">{planWhen(event)}</Txt></View>
      <View style={s.flex}>
        <Pressable disabled={!event.url} onPress={() => event.url && void Linking.openURL(event.url)} accessibilityRole="link">
          <Txt variant="label" numberOfLines={1}>{event.title}</Txt>
        </Pressable>
        <Txt variant="caption" numberOfLines={1}>
          {[categoryLabel(event.category), event.venue, event.city].filter(Boolean).join(" · ")}
        </Txt>
        {person ? <Txt variant="caption" tone="secondary" numberOfLines={1}>Bring {event.people.map((p) => p.name.split(" ")[0]).join(", ")}</Txt> : null}
      </View>
      {onPlan && (
        <Button title={state === "done" ? "Planned" : "Plan"} size="sm" icon={state === "done" ? "check" : "plus"}
          loading={state === "saving"} disabled={state === "done"} onPress={onPlan}
          accessibilityLabel={`Plan ${event.title} with ${person?.name}`} />
      )}
    </View>
  );
}

const LABELS: Record<string, string> = {
  music: "Music", arts: "Arts", food: "Food", sports: "Sports", outdoors: "Outdoors", learning: "Workshop",
  networking: "Networking", tech: "Tech", community: "Community", social: "Social", students: "Student", other: "Event",
};
const categoryLabel = (key: string) => LABELS[key] ?? "Event";

// Follow a public calendar (Luma, Meetup, a school or club): its events show up here.
function FeedsSheet({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const s = useStyles();
  const [feeds, setFeeds] = useState<EventFeed[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (visible) listEventFeeds().then(setFeeds).catch(() => undefined);
  }, [visible]);

  async function add() {
    setBusy(true);
    setNote(null);
    try {
      const { feed, upcoming } = await addEventFeed(url.trim());
      setFeeds((f) => [...f, feed]);
      setUrl("");
      setNote(`Following ${feed.label}: ${upcoming} upcoming`);
      onChanged();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : "Couldn’t add that calendar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Follow a calendar" onClose={onClose}>
      <Txt variant="small">Paste a public calendar link (webcal:// or .ics) from Luma, Meetup, your school or a club. Its events appear in Plan Events.</Txt>
      <View style={s.nearRow}>
        <Input value={url} onChangeText={setUrl} placeholder="webcal://…" autoCapitalize="none" autoCorrect={false}
          accessibilityLabel="Calendar link" containerStyle={s.flex} />
        <Button title="Follow" variant="primary" loading={busy} disabled={url.trim().length < 8} onPress={() => void add()} />
      </View>
      {note ? <Txt variant="small" tone="secondary">{note}</Txt> : null}
      {feeds.map((feed) => (
        <View key={feed.id} style={s.feedRow}>
          <Icon name="calendar" size={16} color={s.accent.color} />
          <View style={s.flex}>
            <Txt variant="label" numberOfLines={1}>{feed.label}</Txt>
            <Txt variant="caption" numberOfLines={1}>{feed.url}</Txt>
          </View>
          <IconButton icon="close" label={`Stop following ${feed.label}`} size={30} tone="plain"
            onPress={() => void removeEventFeed(feed.id).then(() => { setFeeds((f) => f.filter((x) => x.id !== feed.id)); onChanged(); })} />
        </View>
      ))}
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    accent: { color: colors.accentText },
    filters: { gap: space.sm },
    filterRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
    filterStack: { flexDirection: "column", alignItems: "stretch" },
    wrap: { flexWrap: "wrap" },
    where: { flex: 1.3, minWidth: 0 },
    nearRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
    interests: { flex: 1, minWidth: 0 },
    loading: { paddingVertical: space.xxl, alignItems: "center" },
    results: { gap: space.xl },
    dim: { opacity: 0.55 },
    section: { gap: space.sm },
    grid: { gap: space.md },
    gridDesktop: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", columnGap: 0 },
    planCard: {},
    planCardDesktop: { width: "49.2%" },
    image: { width: "100%", height: 132 },
    planBody: { padding: space.md, gap: space.xs, flex: 1 },
    planTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs },
    withRow: { flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: space.xxs },
    faces: { flexDirection: "row", gap: -6 },
    planActions: { flexDirection: "row", gap: space.xs, flexWrap: "wrap", marginTop: "auto", paddingTop: space.xs },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 60 },
    border: { borderTopWidth: 1, borderTopColor: colors.border },
    dateCol: { width: 92 },
    feedRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xxs, borderRadius: radius.sm },
  }),
);
