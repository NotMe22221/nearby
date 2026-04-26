import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, radius, space } from "@/lib/theme";

type Rule = { id: string; name: string; discount_cap_pct: number; max_redemptions: number; time_window_start: string | null; time_window_end: string | null; active: boolean; status: string; item_ids: string[]; created_at: string };
type Item = { id: string; name: string };

const STATUS_COLORS: Record<string, string> = { draft: "#94A3B8", pending: "#F59E0B", approved: "#16A34A", rejected: "#DC2626" };

export default function RulesScreen() {
  const insets = useSafeAreaInsets();
  const [locationId, setLocationId] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formDiscount, setFormDiscount] = useState("20");
  const [formMaxRedemptions, setFormMaxRedemptions] = useState("100");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formItemIds, setFormItemIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: mem } = await supabase.from("memberships").select("organization_id").eq("user_id", user.id).limit(1);
    if (!mem?.length) { setLoading(false); return; }
    const { data: locs } = await supabase.from("locations").select("id").eq("organization_id", mem[0].organization_id).order("created_at", { ascending: true }).limit(1);
    if (!locs?.length) { setLoading(false); return; }
    const lid = locs[0].id;
    setLocationId(lid);
    const [rulesRes, itemsRes] = await Promise.all([
      supabase.from("offer_rules").select("*").eq("location_id", lid).order("created_at", { ascending: false }),
      supabase.from("items").select("id, name").eq("location_id", lid).order("name"),
    ]);
    setRules((rulesRes.data ?? []) as Rule[]);
    setItems((itemsRes.data ?? []) as Item[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null); setFormName(""); setFormDiscount("20"); setFormMaxRedemptions("100"); setFormStart("14:00"); setFormEnd("17:00"); setFormActive(true); setFormItemIds([]);
    setModalVisible(true);
  }
  function openEdit(rule: Rule) {
    setEditing(rule); setFormName(rule.name); setFormDiscount(String(rule.discount_cap_pct)); setFormMaxRedemptions(String(rule.max_redemptions)); setFormStart(rule.time_window_start ?? ""); setFormEnd(rule.time_window_end ?? ""); setFormActive(rule.active); setFormItemIds(rule.item_ids ?? []);
    setModalVisible(true);
  }

  function toggleItem(id: string) {
    setFormItemIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function save() {
    if (!supabase || !locationId) return;
    if (!formName.trim()) { Alert.alert("Required", "Name is required."); return; }
    if (!formStart.trim() || !formEnd.trim()) { Alert.alert("Required", "Start and end times are required (e.g. 14:00)."); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: formName.trim(), discount_cap_pct: parseInt(formDiscount) || 0, max_redemptions: parseInt(formMaxRedemptions) || 1,
        time_window_start: formStart.trim(), time_window_end: formEnd.trim(), active: formActive,
        item_ids: formItemIds, location_id: locationId, status: "draft",
      };
      if (editing) {
        const { status: _s, ...upd } = payload;
        const { error } = await supabase.from("offer_rules").update(upd).eq("id", editing.id);
        if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
      } else {
        const { error } = await supabase.from("offer_rules").insert(payload);
        if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
      }
      setModalVisible(false);
      Alert.alert("Saved", "Offer rule saved.");
      load();
    } catch (e: any) { Alert.alert("Error", e.message); } finally { setSaving(false); }
  }

  async function submitForApproval(id: string) {
    if (!supabase) return;
    await supabase.from("offer_rules").update({ status: "pending" }).eq("id", id);
    load();
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (!locationId) return <View style={s.center}><Text style={s.empty}>Create a location first.</Text></View>;

  return (
    <View style={s.root}>
      <FlatList
        data={rules}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>No offer rules yet.</Text>}
        renderItem={({ item: rule }) => (
          <Pressable style={s.card} onPress={() => openEdit(rule)}>
            <View style={{ flex: 1 }}>
              <View style={s.nameRow}>
                <Text style={s.ruleName}>{rule.name}</Text>
                <View style={[s.badge, { backgroundColor: STATUS_COLORS[rule.status] ?? "#94A3B8" }]}>
                  <Text style={s.badgeText}>{rule.status}</Text>
                </View>
              </View>
              <Text style={s.ruleMeta}>{rule.discount_cap_pct}% off · Max {rule.max_redemptions} redemptions</Text>
            </View>
            {rule.status === "draft" && (
              <Pressable onPress={() => submitForApproval(rule.id)} style={s.submitBtn} hitSlop={4}>
                <Text style={s.submitBtnText}>Submit</Text>
              </Pressable>
            )}
          </Pressable>
        )}
      />
      <Pressable style={[s.fab, { bottom: space(6) + insets.bottom }]} onPress={openAdd}><Ionicons name="add" size={28} color="#fff" /></Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <ScrollView style={s.modal} contentContainerStyle={[s.modalContent, { paddingBottom: space(5) + insets.bottom }]} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitle}>{editing ? "Edit Rule" : "New Rule"}</Text>
            <Text style={s.label}>Rule Name</Text>
            <TextInput style={s.input} value={formName} onChangeText={setFormName} placeholder="Happy Hour Special" placeholderTextColor={colors.inkSofter} />
            <Text style={s.label}>Discount Cap %</Text>
            <TextInput style={s.input} value={formDiscount} onChangeText={setFormDiscount} keyboardType="number-pad" placeholderTextColor={colors.inkSofter} />
            <Text style={s.label}>Max Redemptions</Text>
            <TextInput style={s.input} value={formMaxRedemptions} onChangeText={setFormMaxRedemptions} keyboardType="number-pad" placeholderTextColor={colors.inkSofter} />
            <Text style={s.label}>Time Window (optional)</Text>
            <View style={s.timeRow}>
              <TextInput style={[s.input, { flex: 1 }]} value={formStart} onChangeText={setFormStart} placeholder="14:00" placeholderTextColor={colors.inkSofter} />
              <Text style={s.timeSep}>to</Text>
              <TextInput style={[s.input, { flex: 1 }]} value={formEnd} onChangeText={setFormEnd} placeholder="17:00" placeholderTextColor={colors.inkSofter} />
            </View>
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Active</Text>
              <Switch value={formActive} onValueChange={setFormActive} trackColor={{ true: colors.accent }} />
            </View>
            {items.length > 0 && (
              <>
                <Text style={s.label}>Applies to Items</Text>
                <View style={s.chipRow}>
                  {items.map((it) => (
                    <Pressable key={it.id} onPress={() => toggleItem(it.id)} style={[s.chip, formItemIds.includes(it.id) && s.chipActive]}>
                      <Text style={[s.chipText, formItemIds.includes(it.id) && s.chipTextActive]}>{it.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <View style={s.modalActions}>
              <Pressable onPress={() => setModalVisible(false)} style={s.cancelBtn}><Text style={s.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable onPress={save} style={[s.saveBtn, saving && { opacity: 0.6 }]} disabled={saving}><Text style={s.saveBtnText}>{saving ? "Saving…" : "Save"}</Text></Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(6) },
  list: { padding: space(4), gap: space(3) },
  empty: { color: colors.inkSofter, textAlign: "center", marginTop: space(10) },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  ruleName: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  ruleMeta: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  badge: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  submitBtn: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  submitBtnText: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  fab: { position: "absolute", bottom: space(6), right: space(5), width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { maxHeight: "85%", backgroundColor: "#fff", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  modalContent: { padding: space(5), paddingBottom: space(8), gap: space(3) },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.ink },
  timeRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  timeSep: { color: colors.inkSoft, fontWeight: "600" },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: space(2) },
  switchLabel: { color: colors.ink, fontSize: 15, fontWeight: "500" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.inkSoft },
  chipTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", gap: space(3), marginTop: space(2) },
  cancelBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { color: colors.inkSoft, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, backgroundColor: colors.accent },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
