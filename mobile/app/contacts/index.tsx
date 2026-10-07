import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip, ChipRow, Tag } from "@/components/Chip";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/Input";
import { Page } from "@/components/Page";
import { Sheet } from "@/components/Sheet";
import { ShareContactsSheet } from "@/components/ShareContactsSheet";
import { SkeletonRows } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { useDesktop } from "@/hooks/useDesktop";
import { ApiError } from "@/lib/api";
import {
  activeFilterCount,
  applyFilters,
  emptyFilters,
  FACET_LABELS,
  facetOptions,
  MET_LABELS,
  SORT_LABELS,
  toggleFacet,
  type FacetKey,
  type Filters,
  type MetWithin,
  type Sort,
} from "@/lib/contactFilters";
import { localToday } from "@/lib/dates";
import { contactsSupported } from "@/lib/deviceContacts";
import { copyText, saveText } from "@/lib/files";
import { formatRelative } from "@/lib/format";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";
import { acceptShare, declineShare, exportContacts, incomingShares, listContacts } from "@/services/nomi";
import type { ContactSummary, IncomingShare } from "@/types/api";

const FACETS: FacetKey[] = ["school", "company", "location", "interest", "event"];

export default function Contacts() {
  const s = useStyles();
  const router = useRouter();
  const desktop = useDesktop();
  const toast = useToast();
  const [people, setPeople] = useState<ContactSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [shares, setShares] = useState<IncomingShare[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listContacts()
      .then((list) => {
        setPeople(list);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load contacts."));
    incomingShares().then(setShares).catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const visible = useMemo(() => (people ? applyFilters(people, filters) : null), [people, filters]);
  const filterCount = activeFilterCount(filters);
  const inView = visible ?? [];
  // Export and share act on the selection, or else on everything in view.
  const targetIds = selected.size ? [...selected] : inView.map((p) => p.id);
  const everyone = !selected.size && filterCount === 0 && !filters.query.trim();

  function toggleSelect(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doExport(format: "csv" | "tsv") {
    setBusy(format);
    try {
      const text = await exportContacts(everyone ? null : targetIds, format);
      if (format === "csv") {
        await saveText(`nomi-contacts-${localToday()}.csv`, text, "text/csv");
        toast.show(`Exported ${targetIds.length} contact${targetIds.length === 1 ? "" : "s"}`, "success");
      } else {
        const copied = await copyText(text);
        if (copied) toast.show("Copied. Paste into cell A1 of a Google Sheet.", "success");
      }
      setExportOpen(false);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Export didn’t work.", "danger");
    } finally {
      setBusy(null);
    }
  }

  async function respond(share: IncomingShare, accept: boolean) {
    setBusy(share.id);
    try {
      if (accept) {
        const result = await acceptShare(share.id);
        toast.show(`Added ${result.added} contact${result.added === 1 ? "" : "s"}${result.skipped ? ` (${result.skipped} already saved)` : ""}`, "success");
      } else {
        await declineShare(share.id);
      }
      load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "That didn’t work.", "danger");
    } finally {
      setBusy(null);
    }
  }

  const filterPanel = (
    <FilterPanel people={people ?? []} filters={filters} onChange={setFilters} />
  );

  const scopeLabel = selected.size ? `${selected.size} selected` : everyone ? "all contacts" : `${inView.length} in view`;

  return (
    <Page
      title="Contacts"
      subtitle={people ? `${people.length} ${people.length === 1 ? "contact" : "contacts"}` : undefined}
      actions={
        <>
          {contactsSupported && <Button title="Import" icon="download" onPress={() => router.push("/import-contacts")} />}
          <Button title="Add contact" icon="plus" variant="primary" onPress={() => router.push("/write")} />
        </>
      }
    >
      {shares.map((share) => (
        <Card key={share.id} style={s.share}>
          <Icon name="inbox" size={18} color={s.accent.color} />
          <View style={s.flex}>
            <Txt variant="label">{share.senderName} shared {share.count} contact{share.count === 1 ? "" : "s"} with you</Txt>
            <Txt variant="caption" numberOfLines={1}>{share.names.join(", ")}{share.message ? ` · “${share.message}”` : ""}</Txt>
          </View>
          <Button title="Decline" size="sm" variant="ghost" disabled={busy === share.id} onPress={() => void respond(share, false)} />
          <Button title="Add to contacts" size="sm" variant="primary" loading={busy === share.id} onPress={() => void respond(share, true)} />
        </Card>
      ))}

      {!desktop && (
        <Input icon="search" value={filters.query} onChangeText={(query) => setFilters({ ...filters, query })}
          placeholder="Search contacts" accessibilityLabel="Search contacts" autoCorrect={false} />
      )}
      <View style={s.toolbar}>
        {desktop ? (
          <Input icon="search" value={filters.query} onChangeText={(query) => setFilters({ ...filters, query })}
            placeholder="Search name, company, school, interest…" accessibilityLabel="Search contacts"
            containerStyle={s.flex} autoCorrect={false} />
        ) : <View style={s.flex} />}
        {!desktop && (
          <Button title={filterCount ? `Filters · ${filterCount}` : "Filters"} icon="filter" onPress={() => setFiltersOpen(true)} />
        )}
        <Button title={desktop ? SORT_LABELS[filters.sort] : "Sort"} iconRight="chevronDown" variant="secondary" onPress={() => setSortOpen(true)}
          accessibilityLabel={`Sort: ${SORT_LABELS[filters.sort]}`} />
      </View>

      <View style={s.body}>
        {desktop && <View style={s.sidebar}>{filterPanel}</View>}
        <View style={s.results}>
          {filterCount > 0 && (
            <ChipRow>
              {filters.metWithin !== "any" && (
                <Chip label={MET_LABELS[filters.metWithin]} selected onRemove={() => setFilters({ ...filters, metWithin: "any" })} />
              )}
              {filters.followUps && <Chip label="Has follow-ups" selected onRemove={() => setFilters({ ...filters, followUps: false })} />}
              {FACETS.flatMap((key) => filters.facets[key].map((value) => (
                <Chip key={`${key}:${value}`} label={value} selected onRemove={() => setFilters(toggleFacet(filters, key, value))} />
              )))}
              <Button title="Clear all" size="sm" variant="ghost" onPress={() => setFilters({ ...emptyFilters(), query: filters.query, sort: filters.sort })} />
            </ChipRow>
          )}

          <View style={s.resultsBar}>
            <Txt variant="small">
              {visible ? (visible.length === (people?.length ?? 0) ? `${visible.length} contacts` : `${visible.length} of ${people?.length}`) : " "}
            </Txt>
            <View style={s.bulk}>
              {selecting ? (
                <>
                  <Button title={selected.size === inView.length && inView.length > 0 ? "Clear" : "Select all"} size="sm" variant="ghost"
                    onPress={() => setSelected(selected.size === inView.length ? new Set() : new Set(inView.map((p) => p.id)))} />
                  <Button title="Done" size="sm" variant="ghost" onPress={() => { setSelecting(false); setSelected(new Set()); }} />
                </>
              ) : (
                <Button title="Select" size="sm" variant="ghost" icon="checkCircle" disabled={!inView.length} onPress={() => setSelecting(true)} />
              )}
              <Button title="Share" size="sm" icon="share" disabled={!targetIds.length} onPress={() => setSharing(true)} />
              <Button title="Export" size="sm" icon="download" disabled={!targetIds.length} onPress={() => setExportOpen(true)} />
            </View>
          </View>

          <Card padding="none">
            {!visible ? (
              error ? (
                <EmptyState icon="alert" title="Couldn’t load contacts" body={error} action={<Button title="Try again" onPress={load} />} />
              ) : (
                <View style={s.pad}><SkeletonRows rows={7} /></View>
              )
            ) : people?.length === 0 ? (
              <EmptyState icon="people" title="No contacts yet" body="Record a quick note after you meet someone, or import your phone contacts."
                action={
                  <View style={s.emptyActions}>
                    <Button title="Remember someone" icon="mic" variant="primary" onPress={() => router.push("/record")} />
                    {contactsSupported && <Button title="Import" onPress={() => router.push("/import-contacts")} />}
                  </View>
                } />
            ) : visible.length === 0 ? (
              <EmptyState icon="search" title="No contacts match" body="Try fewer filters, or ask Search in your own words."
                action={
                  <View style={s.emptyActions}>
                    <Button title="Clear filters" onPress={() => setFilters(emptyFilters())} />
                    <Button title="Search" icon="search" variant="ghost" onPress={() => router.push({ pathname: "/search", params: { q: filters.query } })} />
                  </View>
                } />
            ) : (
              visible.map((person, i) => (
                <ContactRow key={person.id} person={person} first={i === 0} desktop={desktop} selecting={selecting}
                  selected={selected.has(person.id)}
                  onPress={() => (selecting ? toggleSelect(person.id) : router.push({ pathname: "/contacts/[id]", params: { id: person.id } }))} />
              ))
            )}
          </Card>
        </View>
      </View>

      <Sheet visible={filtersOpen} title="Filters" onClose={() => setFiltersOpen(false)}
        footer={<Button title={`Show ${inView.length}`} variant="primary" onPress={() => setFiltersOpen(false)} />}>
        {filterPanel}
      </Sheet>

      <Sheet visible={sortOpen} title="Sort by" onClose={() => setSortOpen(false)} width={360}>
        {(Object.keys(SORT_LABELS) as Sort[]).map((sort) => (
          <Pressable key={sort} onPress={() => { setFilters({ ...filters, sort }); setSortOpen(false); }} accessibilityRole="radio"
            accessibilityState={{ checked: filters.sort === sort }} style={s.option}>
            <Txt variant="label" style={s.flex}>{SORT_LABELS[sort]}</Txt>
            {filters.sort === sort && <Icon name="check" size={16} color={s.accent.color} />}
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={exportOpen} title={`Export ${scopeLabel}`} onClose={() => setExportOpen(false)} width={420}>
        <Txt variant="small">
          {targetIds.length} contact{targetIds.length === 1 ? "" : "s"} with every saved detail: company, school, interests,
          where you met, notes and follow-ups.
        </Txt>
        <Button title="Copy for Google Sheets" icon="copy" fullWidth loading={busy === "tsv"} onPress={() => void doExport("tsv")} />
        <Button title="Download CSV" icon="download" variant="primary" fullWidth loading={busy === "csv"} onPress={() => void doExport("csv")} />
        <Txt variant="caption">CSV opens in Google Sheets (File › Import), Excel and Numbers.</Txt>
      </Sheet>

      <ShareContactsSheet visible={sharing} contactIds={targetIds} label={scopeLabel} onClose={() => setSharing(false)} />
    </Page>
  );
}

function ContactRow({ person, first, desktop, selecting, selected, onPress }: {
  person: ContactSummary;
  first: boolean;
  desktop: boolean;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const detail = [person.role && person.company ? `${person.role}, ${person.company}` : person.role || person.company, person.school]
    .filter(Boolean)
    .join(" · ");
  return (
    <Pressable onPress={onPress} accessibilityRole={selecting ? "checkbox" : "button"} accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={person.name}
      style={({ hovered }: { hovered?: boolean }) => [s.row, !first && s.rowBorder, (hovered || selected) && s.rowHover]}>
      {selecting && (
        <View style={[s.checkbox, selected && s.checkboxOn]}>
          {selected && <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />}
        </View>
      )}
      <Avatar name={person.name} size={36} />
      <View style={s.flex}>
        <Txt variant="label" numberOfLines={1}>{person.name}</Txt>
        <Txt variant="caption" numberOfLines={1}>{detail || person.location || person.email || "No details yet"}</Txt>
      </View>
      {desktop && (
        <View style={s.tags}>
          {(person.interests ?? []).slice(0, 2).map((x) => <Tag key={x} label={x} />)}
        </View>
      )}
      {desktop && person.openFollowUps > 0 && <Tag label={`${person.openFollowUps} to do`} tone="support" />}
      <Txt variant="caption" style={s.when}>{formatRelative(person.lastInteractionAt)}</Txt>
    </Pressable>
  );
}

function FilterPanel({ people, filters, onChange }: { people: ContactSummary[]; filters: Filters; onChange: (f: Filters) => void }) {
  const s = useStyles();
  const [expanded, setExpanded] = useState<Partial<Record<FacetKey, boolean>>>({});
  return (
    <View style={s.panel}>
      <View style={s.panelGroup}>
        <Txt variant="overline">Met</Txt>
        {(Object.keys(MET_LABELS) as MetWithin[]).map((key) => (
          <Option key={key} label={MET_LABELS[key]} on={filters.metWithin === key} radio onPress={() => onChange({ ...filters, metWithin: key })} />
        ))}
      </View>
      <View style={s.panelGroup}>
        <Txt variant="overline">Follow-ups</Txt>
        <Option label="Has open follow-ups" on={filters.followUps} onPress={() => onChange({ ...filters, followUps: !filters.followUps })} />
      </View>
      {FACETS.map((key) => {
        const options = facetOptions(people, key);
        if (!options.length) return null;
        const shown = expanded[key] ? options : options.slice(0, 5);
        return (
          <View key={key} style={s.panelGroup}>
            <Txt variant="overline">{FACET_LABELS[key]}</Txt>
            {shown.map((o) => (
              <Option key={o.value} label={o.value} count={o.count}
                on={filters.facets[key].some((v) => v.toLowerCase() === o.value.toLowerCase())}
                onPress={() => onChange(toggleFacet(filters, key, o.value))} />
            ))}
            {options.length > 5 && (
              <Pressable onPress={() => setExpanded({ ...expanded, [key]: !expanded[key] })} accessibilityRole="button" hitSlop={6}>
                <Txt variant="small" tone="secondary" weight="500">{expanded[key] ? "Show less" : `Show all ${options.length}`}</Txt>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

function Option({ label, count, on, radio, onPress }: { label: string; count?: number; on: boolean; radio?: boolean; onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole={radio ? "radio" : "checkbox"} accessibilityState={radio ? { checked: on } : { checked: on }}
      style={({ hovered }: { hovered?: boolean }) => [s.option, hovered && s.optionHover]}>
      <View style={[radio ? s.radio : s.checkbox, on && s.checkboxOn]}>
        {on && (radio ? <View style={s.radioDot} /> : <Icon name="check" size={11} color={colors.onAccent} strokeWidth={3} />)}
      </View>
      <Txt variant="small" tone="default" numberOfLines={1} style={s.flex}>{label}</Txt>
      {count !== undefined && <Txt variant="caption">{count}</Txt>}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    accent: { color: colors.supportText },
    pad: { padding: space.md },
    share: { flexDirection: "row", alignItems: "center", gap: space.sm, borderColor: colors.support, flexWrap: "wrap" },
    toolbar: { flexDirection: "row", alignItems: "center", gap: space.xs },
    body: { flexDirection: "row", alignItems: "flex-start", gap: space.lg },
    sidebar: { width: 220 },
    results: { flex: 1, minWidth: 0, gap: space.sm },
    resultsBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs, flexWrap: "wrap" },
    bulk: { flexDirection: "row", alignItems: "center", gap: space.xxs, flexWrap: "wrap" },
    row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 60, paddingHorizontal: space.md, paddingVertical: space.xs },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    rowHover: { backgroundColor: colors.surfaceHover },
    tags: { flexDirection: "row", gap: space.xxs, maxWidth: 220 },
    when: { width: 84, textAlign: "right" },
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
    radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.onAccent },
    checkboxOn: { backgroundColor: colors.support, borderColor: colors.support },
    panel: { gap: space.lg },
    panelGroup: { gap: 2 },
    option: { flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: 32, paddingHorizontal: space.xxs, borderRadius: radius.sm },
    optionHover: { backgroundColor: colors.surfaceHover },
    emptyActions: { flexDirection: "row", gap: space.xs, flexWrap: "wrap", justifyContent: "center" },
  }),
);
