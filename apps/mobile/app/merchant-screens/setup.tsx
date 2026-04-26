import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

type SlowHour = { day: number; start: string; end: string };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SetupScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [slowHours, setSlowHours] = useState<SlowHour[]>([]);
  const [orgId, setOrgId] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: memberships } = await supabase
      .from("memberships").select("organization_id").eq("user_id", user.id).limit(1);
    if (!memberships?.length) { setLoading(false); return; }
    setOrgId(memberships[0].organization_id);
    const { data: locs } = await supabase
      .from("locations").select("*").eq("organization_id", memberships[0].organization_id)
      .order("created_at", { ascending: true }).limit(1);
    if (locs?.length) {
      const loc = locs[0] as any;
      setLocationId(loc.id);
      setName(loc.name ?? "");
      setAddress(loc.address ?? "");
      setSlowHours(loc.slow_hours ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function addSlowHour() {
    setSlowHours([...slowHours, { day: 1, start: "14:00", end: "17:00" }]);
  }
  function removeSlowHour(i: number) {
    setSlowHours(slowHours.filter((_, idx) => idx !== i));
  }
  function updateSlowHour(i: number, field: keyof SlowHour, val: any) {
    const copy = [...slowHours];
    (copy[i] as any)[field] = val;
    setSlowHours(copy);
  }

  async function save() {
    if (!supabase) return;
    if (!name.trim() || !address.trim()) {
      Alert.alert("Required", "Name and address are required.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("setup_merchant_business", {
        p_name: name.trim(),
        p_address: address.trim(),
        p_slow_hours: slowHours,
      });
      if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
      if (data) {
        setOrgId(data.org_id);
        setLocationId(data.location_id);
      }
      Alert.alert("Saved", "Business profile updated.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <Text style={s.sectionTitle}>Business Info</Text>
      <Text style={s.label}>Business Name</Text>
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. Joe's Coffee" placeholderTextColor={colors.inkSofter} />
      <Text style={s.label}>Address</Text>
      <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="123 Main St, City" placeholderTextColor={colors.inkSofter} />

      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Slow Hours</Text>
        <Pressable onPress={addSlowHour} style={s.addBtn}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={s.addBtnText}>Add</Text>
        </Pressable>
      </View>
      <Text style={s.hint}>Define quiet periods to boost offers during slow business times.</Text>
      {slowHours.map((sh, i) => (
        <View key={i} style={s.slowCard}>
          <View style={s.dayRow}>
            {DAYS.map((d, idx) => (
              <Pressable key={idx} onPress={() => updateSlowHour(i, "day", idx)}
                style={[s.dayChip, sh.day === idx && s.dayChipActive]}>
                <Text style={[s.dayChipText, sh.day === idx && s.dayChipTextActive]}>{d}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.timeRow}>
            <TextInput style={s.timeInput} value={sh.start} onChangeText={(v) => updateSlowHour(i, "start", v)} placeholder="14:00" placeholderTextColor={colors.inkSofter} />
            <Text style={s.timeSep}>to</Text>
            <TextInput style={s.timeInput} value={sh.end} onChangeText={(v) => updateSlowHour(i, "end", v)} placeholder="17:00" placeholderTextColor={colors.inkSofter} />
            <Pressable onPress={() => removeSlowHour(i)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={colors.red} />
            </Pressable>
          </View>
        </View>
      ))}

      <Pressable style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        <Text style={s.saveBtnText}>{saving ? "Saving…" : "Save Profile"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: space(4), gap: space(2), paddingBottom: space(10) },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space(4) },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: space(2) },
  hint: { color: colors.inkSofter, fontSize: 13, lineHeight: 18 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.ink },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(1.5), paddingHorizontal: space(3) },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  slowCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(3), gap: space(2) },
  dayRow: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  dayChip: { paddingHorizontal: space(2), paddingVertical: space(1), borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  dayChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayChipText: { fontSize: 12, fontWeight: "600", color: colors.inkSoft },
  dayChipTextActive: { color: "#fff" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  timeInput: { flex: 1, textAlign: "center", color: colors.ink, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: space(2), fontSize: 14 },
  timeSep: { color: colors.inkSoft, fontWeight: "600" },
  saveBtn: { marginTop: space(4), backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(3.5), alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
