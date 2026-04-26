import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
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

type Item = { id: string; name: string; base_price: number; max_discount_pct: number; offer_eligible: boolean };

export default function ItemsScreen() {
  const insets = useSafeAreaInsets();
  const [locationId, setLocationId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formDiscount, setFormDiscount] = useState("");
  const [formEligible, setFormEligible] = useState(true);
  const [saving, setSaving] = useState(false);

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
    const { data } = await supabase.from("items").select("*").eq("location_id", lid).order("name");
    setItems((data ?? []) as Item[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null); setFormName(""); setFormPrice(""); setFormDiscount("25"); setFormEligible(true);
    setModalVisible(true);
  }
  function openEdit(item: Item) {
    setEditing(item); setFormName(item.name); setFormPrice(String(item.base_price)); setFormDiscount(String(item.max_discount_pct)); setFormEligible(item.offer_eligible);
    setModalVisible(true);
  }

  async function save() {
    if (!supabase || !locationId) return;
    if (!formName.trim()) { Alert.alert("Required", "Name is required."); return; }
    const price = parseFloat(formPrice) || 0;
    const disc = parseInt(formDiscount) || 0;
    setSaving(true);
    try {
      const payload = { name: formName.trim(), base_price: price, max_discount_pct: disc, offer_eligible: formEligible, location_id: locationId };
      if (editing) {
        const { error } = await supabase.from("items").update(payload).eq("id", editing.id);
        if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
      } else {
        const { error } = await supabase.from("items").insert(payload);
        if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
      }
      setModalVisible(false);
      load();
    } catch (e: any) { Alert.alert("Error", e.message); } finally { setSaving(false); }
  }

  function confirmDelete(item: Item) {
    Alert.alert("Delete Item", `Remove "${item.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => doDelete(item.id) },
    ]);
  }
  async function doDelete(id: string) {
    if (!supabase) return;
    await supabase.from("items").delete().eq("id", id);
    load();
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;
  if (!locationId) return <View style={s.center}><Text style={s.empty}>Create a location first in Business Profile.</Text></View>;

  return (
    <View style={s.root}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>No items yet. Add your first menu item.</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => openEdit(item)}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName}>{item.name}</Text>
              <Text style={s.itemMeta}>${item.base_price.toFixed(2)} · Max {item.max_discount_pct}% off {item.offer_eligible ? "" : "· Not eligible"}</Text>
            </View>
            <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={colors.red} />
            </Pressable>
          </Pressable>
        )}
      />
      <Pressable style={[s.fab, { bottom: space(6) + insets.bottom }]} onPress={openAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { paddingBottom: space(5) + insets.bottom }]}>
            <Text style={s.modalTitle}>{editing ? "Edit Item" : "New Item"}</Text>
            <Text style={s.label}>Name</Text>
            <TextInput style={s.input} value={formName} onChangeText={setFormName} placeholder="Latte" placeholderTextColor={colors.inkSofter} />
            <Text style={s.label}>Base Price ($)</Text>
            <TextInput style={s.input} value={formPrice} onChangeText={setFormPrice} placeholder="5.50" keyboardType="decimal-pad" placeholderTextColor={colors.inkSofter} />
            <Text style={s.label}>Max Discount %</Text>
            <TextInput style={s.input} value={formDiscount} onChangeText={setFormDiscount} placeholder="25" keyboardType="number-pad" placeholderTextColor={colors.inkSofter} />
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Offer Eligible</Text>
              <Switch value={formEligible} onValueChange={setFormEligible} trackColor={{ true: colors.accent }} />
            </View>
            <View style={s.modalActions}>
              <Pressable onPress={() => setModalVisible(false)} style={s.cancelBtn}><Text style={s.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable onPress={save} style={[s.saveBtn, saving && { opacity: 0.6 }]} disabled={saving}><Text style={s.saveBtnText}>{saving ? "Saving…" : "Save"}</Text></Pressable>
            </View>
          </View>
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
  itemName: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  itemMeta: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  fab: { position: "absolute", bottom: space(6), right: space(5), width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#fff", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space(5), paddingBottom: space(8), gap: space(3) },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.ink },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: space(2) },
  switchLabel: { color: colors.ink, fontSize: 15, fontWeight: "500" },
  modalActions: { flexDirection: "row", gap: space(3), marginTop: space(2) },
  cancelBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { color: colors.inkSoft, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, backgroundColor: colors.accent },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
