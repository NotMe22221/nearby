import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { apiBaseUrl } from "@/lib/config";
import { resolveOrganizationId } from "@/lib/merchantOrg";
import { colors, radius, space } from "@/lib/theme";

type SquareConnection = { id: string; merchant_id: string; connected_at: string };
type ItemLink = { id: string; item_id: string; square_catalog_id: string; item_name?: string };
type Redemption = { id: string; offer_id: string; status: string; created_at: string };
type LocalItem = { id: string; name: string };

export default function PosScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [connection, setConnection] = useState<SquareConnection | null>(null);
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [localItems, setLocalItems] = useState<LocalItem[]>([]);

  const [linkModal, setLinkModal] = useState(false);
  const [linkItemId, setLinkItemId] = useState("");
  const [linkCatalogId, setLinkCatalogId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const oid = await resolveOrganizationId(supabase);
    if (!oid) { setLoading(false); return; }
    setOrgId(oid);

    const { data: locs } = await supabase.from("locations").select("id").eq("organization_id", oid).order("created_at", { ascending: true }).limit(1);
    if (locs?.length) setLocationId(locs[0].id);

    const { data: conn } = await supabase.from("square_connections").select("*").eq("organization_id", oid).limit(1);
    setConnection(conn?.length ? (conn[0] as SquareConnection) : null);

    if (locs?.length) {
      const lid = locs[0].id;
      const [linksRes, itemsRes, redemRes] = await Promise.all([
        supabase.from("square_item_links").select("*").eq("location_id", lid),
        supabase.from("items").select("id, name").eq("location_id", lid).order("name"),
        supabase.from("pos_redemptions").select("*").eq("location_id", lid).order("created_at", { ascending: false }).limit(20),
      ]);
      const linkRows = (linksRes.data ?? []) as ItemLink[];
      const itemRows = (itemsRes.data ?? []) as LocalItem[];
      linkRows.forEach(lr => { lr.item_name = itemRows.find(it => it.id === lr.item_id)?.name; });
      setLinks(linkRows);
      setLocalItems(itemRows);
      setRedemptions((redemRes.data ?? []) as Redemption[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function disconnect() {
    if (!supabase || !connection) return;
    const client = supabase;
    const connId = connection.id;
    Alert.alert("Disconnect Square", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: async () => {
        await client.from("square_connections").delete().eq("id", connId);
        setConnection(null);
      }},
    ]);
  }

  async function saveLink() {
    if (!supabase || !locationId) return;
    if (!linkItemId || !linkCatalogId.trim()) { Alert.alert("Required", "Select an item and enter Square catalog ID."); return; }
    setSaving(true);
    try {
      await supabase.from("square_item_links").insert({ item_id: linkItemId, square_catalog_id: linkCatalogId.trim(), location_id: locationId });
      setLinkModal(false); setLinkItemId(""); setLinkCatalogId("");
      load();
    } catch (e: any) { Alert.alert("Error", e.message); } finally { setSaving(false); }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <View style={s.root}>
      <View style={s.statusCard}>
        <Ionicons name={connection ? "hardware-chip" : "hardware-chip-outline"} size={32} color={connection ? colors.green : colors.inkSofter} />
        <View style={{ flex: 1 }}>
          <Text style={s.statusTitle}>{connection ? "Square Connected" : "Square Not Connected"}</Text>
          {connection && <Text style={s.statusSub}>Merchant: {connection.merchant_id}</Text>}
        </View>
        {connection ? (
          <Pressable style={s.disconnectBtn} onPress={disconnect}><Text style={s.disconnectBtnText}>Disconnect</Text></Pressable>
        ) : (
          <Pressable style={s.connectBtn} onPress={() => {
            const url = `${apiBaseUrl}/api/square/oauth/start?org_id=${orgId}`;
            Linking.openURL(url);
          }}>
            <Text style={s.connectBtnText}>Connect</Text>
          </Pressable>
        )}
      </View>

      {connection && (
        <>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Item Links</Text>
            <Pressable onPress={() => setLinkModal(true)} style={s.addBtn}><Ionicons name="add" size={16} color="#fff" /><Text style={s.addBtnText}>Link</Text></Pressable>
          </View>
          {links.length === 0 ? <Text style={s.empty}>No items linked to Square yet.</Text> : links.map(lk => (
            <View key={lk.id} style={s.linkRow}>
              <Text style={s.linkItem}>{lk.item_name ?? lk.item_id.slice(0, 8)}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.inkSofter} />
              <Text style={s.linkCatalog}>{lk.square_catalog_id}</Text>
            </View>
          ))}

          <Text style={[s.sectionTitle, { marginTop: space(4) }]}>Recent POS Redemptions</Text>
          {redemptions.length === 0 ? <Text style={s.empty}>No redemptions yet.</Text> : (
            <FlatList
              data={redemptions}
              keyExtractor={(i) => i.id}
              scrollEnabled={false}
              renderItem={({ item: r }) => (
                <View style={s.redeemRow}>
                  <Text style={s.redeemId}>Offer {r.offer_id.slice(0, 8)}…</Text>
                  <Text style={[s.redeemStatus, { color: r.status === "completed" ? colors.green : colors.inkSofter }]}>{r.status}</Text>
                  <Text style={s.redeemDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
                </View>
              )}
            />
          )}
        </>
      )}

      <Modal visible={linkModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { paddingBottom: space(5) + insets.bottom }]}>
            <Text style={s.modalTitle}>Link Item to Square</Text>
            <Text style={s.label}>Local Item</Text>
            <View style={s.chipRow}>
              {localItems.map(it => (
                <Pressable key={it.id} onPress={() => setLinkItemId(it.id)} style={[s.chip, linkItemId === it.id && s.chipActive]}>
                  <Text style={[s.chipText, linkItemId === it.id && s.chipTextActive]}>{it.name}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.label}>Square Catalog ID</Text>
            <TextInput style={s.input} value={linkCatalogId} onChangeText={setLinkCatalogId} placeholder="SQCID_xxx" placeholderTextColor={colors.inkSofter} />
            <View style={s.modalActions}>
              <Pressable onPress={() => setLinkModal(false)} style={s.cancelBtn}><Text style={s.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable onPress={saveLink} style={[s.saveBtn, saving && { opacity: 0.6 }]} disabled={saving}><Text style={s.saveBtnText}>{saving ? "Saving…" : "Save"}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: space(4) },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  statusCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(3), marginBottom: space(4) },
  statusTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  statusSub: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  connectBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2) },
  connectBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  disconnectBtn: { backgroundColor: colors.red, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2) },
  disconnectBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space(2) },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(1.5), paddingHorizontal: space(3) },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  empty: { color: colors.inkSofter, fontSize: 13, marginBottom: space(3) },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space(3), marginBottom: space(2) },
  linkItem: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  linkCatalog: { color: colors.inkSoft, fontSize: 13 },
  redeemRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2), borderBottomWidth: 1, borderBottomColor: colors.border },
  redeemId: { flex: 1, color: colors.ink, fontSize: 13 },
  redeemStatus: { fontWeight: "600", fontSize: 12 },
  redeemDate: { color: colors.inkSofter, fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#fff", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space(5), paddingBottom: space(8), gap: space(3) },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.ink },
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
