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

type StampCard = { id: string; name: string; stamps_required: number; reward_text: string; active: boolean };
type PointHolder = { user_id: string; total: number; email?: string };

export default function LoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const [orgId, setOrgId] = useState("");
  const [cards, setCards] = useState<StampCard[]>([]);
  const [topHolders, setTopHolders] = useState<PointHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<StampCard | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formStamps, setFormStamps] = useState("10");
  const [formReward, setFormReward] = useState("");
  const [formActive, setFormActive] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: mem } = await supabase.from("memberships").select("organization_id").eq("user_id", user.id).limit(1);
    if (!mem?.length) { setLoading(false); return; }
    const oid = mem[0].organization_id;
    setOrgId(oid);
    const { data: sc } = await supabase.from("stamp_cards").select("*").eq("organization_id", oid).order("created_at", { ascending: false });
    setCards((sc ?? []) as StampCard[]);

    // top point holders
    const { data: pts } = await supabase.from("point_ledger").select("user_id, points").eq("organization_id", oid);
    if (pts?.length) {
      const agg: Record<string, number> = {};
      pts.forEach((p: any) => { agg[p.user_id] = (agg[p.user_id] ?? 0) + p.points; });
      const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([uid, total]) => ({ user_id: uid, total }));
      setTopHolders(sorted);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null); setFormName(""); setFormStamps("10"); setFormReward(""); setFormActive(true);
    setModalVisible(true);
  }
  function openEdit(card: StampCard) {
    setEditing(card); setFormName(card.name); setFormStamps(String(card.stamps_required)); setFormReward(card.reward_text); setFormActive(card.active);
    setModalVisible(true);
  }

  async function save() {
    if (!supabase || !orgId) return;
    if (!formName.trim() || !formReward.trim()) { Alert.alert("Required", "Name and reward are required."); return; }
    setSaving(true);
    try {
      const payload = { name: formName.trim(), stamps_required: parseInt(formStamps) || 10, reward_text: formReward.trim(), active: formActive, organization_id: orgId };
      if (editing) {
        await supabase.from("stamp_cards").update(payload).eq("id", editing.id);
      } else {
        await supabase.from("stamp_cards").insert(payload);
      }
      setModalVisible(false);
      load();
    } catch (e: any) { Alert.alert("Error", e.message); } finally { setSaving(false); }
  }

  function confirmDelete(card: StampCard) {
    Alert.alert("Delete Card", `Remove "${card.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => doDelete(card.id) },
    ]);
  }
  async function doDelete(id: string) {
    if (!supabase) return;
    await supabase.from("stamp_cards").delete().eq("id", id);
    load();
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <View style={s.root}>
      <FlatList
        data={cards}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={
          topHolders.length > 0 ? (
            <View style={s.holdersSection}>
              <Text style={s.sectionTitle}>Top Point Holders</Text>
              {topHolders.map((h, i) => (
                <View key={h.user_id} style={s.holderRow}>
                  <Text style={s.holderRank}>#{i + 1}</Text>
                  <Text style={s.holderId} numberOfLines={1}>{h.user_id.slice(0, 8)}…</Text>
                  <Text style={s.holderPts}>{h.total} pts</Text>
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={<Text style={s.empty}>No stamp cards yet.</Text>}
        renderItem={({ item: card }) => (
          <Pressable style={s.card} onPress={() => openEdit(card)}>
            <View style={{ flex: 1 }}>
              <View style={s.nameRow}>
                <Text style={s.cardName}>{card.name}</Text>
                <View style={[s.badge, { backgroundColor: card.active ? colors.green : colors.inkSofter }]}>
                  <Text style={s.badgeText}>{card.active ? "Active" : "Inactive"}</Text>
                </View>
              </View>
              <Text style={s.cardMeta}>{card.stamps_required} stamps → {card.reward_text}</Text>
            </View>
            <Pressable onPress={() => confirmDelete(card)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={colors.red} />
            </Pressable>
          </Pressable>
        )}
      />
      <Pressable style={[s.fab, { bottom: space(6) + insets.bottom }]} onPress={openAdd}><Ionicons name="add" size={28} color="#fff" /></Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { paddingBottom: space(5) + insets.bottom }]}>
            <Text style={s.modalTitle}>{editing ? "Edit Stamp Card" : "New Stamp Card"}</Text>
            <Text style={s.label}>Name</Text>
            <TextInput style={s.input} value={formName} onChangeText={setFormName} placeholder="Coffee Card" placeholderTextColor={colors.inkSofter} />
            <Text style={s.label}>Stamps Required (1-50)</Text>
            <TextInput style={s.input} value={formStamps} onChangeText={setFormStamps} keyboardType="number-pad" placeholderTextColor={colors.inkSofter} />
            <Text style={s.label}>Reward</Text>
            <TextInput style={s.input} value={formReward} onChangeText={setFormReward} placeholder="Free drink" placeholderTextColor={colors.inkSofter} />
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Active</Text>
              <Switch value={formActive} onValueChange={setFormActive} trackColor={{ true: colors.accent }} />
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: space(4), gap: space(3) },
  empty: { color: colors.inkSofter, textAlign: "center", marginTop: space(6) },
  holdersSection: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), marginBottom: space(3), gap: space(2) },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", marginBottom: space(1) },
  holderRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  holderRank: { color: colors.accent, fontWeight: "700", fontSize: 14, width: 28 },
  holderId: { flex: 1, color: colors.inkSoft, fontSize: 13 },
  holderPts: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  nameRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  cardName: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  cardMeta: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  badge: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
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
