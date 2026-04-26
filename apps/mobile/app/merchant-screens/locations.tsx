import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pickImageFromLibrary } from "@/lib/pickImage";
import { supabase } from "@/lib/supabase";
import { geocodeAddress } from "@/lib/geocode";
import { uploadLocationCover } from "@/lib/locationPhoto";
import { resolveOrganizationId } from "@/lib/merchantOrg";
import { colors, radius, space } from "@/lib/theme";

type Location = {
  id: string;
  name: string;
  address: string;
  slow_hours: unknown[];
  cover_image_url: string | null;
  created_at: string;
};

export default function LocationsScreen() {
  const insets = useSafeAreaInsets();
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [localCoverUri, setLocalCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const oid = await resolveOrganizationId(supabase);
    if (!oid) { setLoading(false); return; }
    setOrgId(oid);
    const { data } = await supabase
      .from("locations")
      .select("id, name, address, slow_hours, cover_image_url, created_at")
      .eq("organization_id", oid)
      .order("created_at", { ascending: true });
    setLocations((data ?? []) as Location[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditing(null);
    setFormName("");
    setFormAddress("");
    setLocalCoverUri(null);
    setModalVisible(true);
  }
  function openEdit(loc: Location) {
    setEditing(loc);
    setFormName(loc.name);
    setFormAddress(loc.address);
    setLocalCoverUri(null);
    setModalVisible(true);
  }

  async function pickPhoto() {
    const uri = await pickImageFromLibrary();
    if (uri) setLocalCoverUri(uri);
  }

  async function save() {
    if (!supabase || !orgId) return;
    if (!formName.trim() || !formAddress.trim()) { Alert.alert("Required", "Name and address are required."); return; }
    setSaving(true);
    try {
      let targetId: string;
      if (editing) {
        const { error } = await supabase
          .from("locations")
          .update({ name: formName.trim(), address: formAddress.trim() })
          .eq("id", editing.id);
        if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
        targetId = editing.id;
      } else {
        const { data: ins, error } = await supabase
          .from("locations")
          .insert({
            name: formName.trim(),
            address: formAddress.trim(),
            organization_id: orgId,
            owner_user_id: userId,
            slow_hours: [],
          })
          .select("id")
          .single();
        if (error) { Alert.alert("Error", error.message); setSaving(false); return; }
        targetId = ins.id;
      }
      const coords = await geocodeAddress(formAddress.trim());
      if (coords) {
        await supabase.rpc("update_location_coords", {
          p_location_id: targetId,
          p_lat: coords.lat,
          p_lng: coords.lng,
        });
      }
      if (localCoverUri) {
        const publicUrl = await uploadLocationCover(supabase, userId, targetId, localCoverUri);
        const { error: up } = await supabase.from("locations").update({ cover_image_url: publicUrl }).eq("id", targetId);
        if (up) Alert.alert("Photo", up.message);
      }
      setModalVisible(false);
      load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  function confirmDelete(loc: Location) {
    Alert.alert("Delete Location", `Remove "${loc.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => doDelete(loc.id) },
    ]);
  }
  async function doDelete(id: string) {
    if (!supabase) return;
    await supabase.from("locations").delete().eq("id", id);
    load();
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  return (
    <View style={s.root}>
      <FlatList
        data={locations}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>No locations yet. Add your first one.</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => openEdit(item)}>
            {item.cover_image_url ? (
              <Image source={{ uri: item.cover_image_url }} style={s.thumb} resizeMode="cover" />
            ) : (
              <View style={s.thumbPlaceholder}>
                <Ionicons name="storefront-outline" size={28} color={colors.inkSofter} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.locName}>{item.name}</Text>
              <Text style={s.locAddr}>{item.address}</Text>
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

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { paddingBottom: space(5) + insets.bottom }]}>
            <Text style={s.modalTitle}>{editing ? "Edit Location" : "New Location"}</Text>
            <Text style={s.label}>Name</Text>
            <TextInput style={s.input} value={formName} onChangeText={setFormName} placeholder="Location name" placeholderTextColor={colors.inkSofter} />
            <Text style={s.label}>Address</Text>
            <TextInput style={s.input} value={formAddress} onChangeText={setFormAddress} placeholder="123 Main St" placeholderTextColor={colors.inkSofter} multiline />
            <Pressable onPress={pickPhoto} style={s.photoRow}>
              <Ionicons name="image-outline" size={20} color={colors.accent} />
              <Text style={s.photoText}>{localCoverUri || editing?.cover_image_url ? "Update storefront photo" : "Add storefront photo (optional)"}</Text>
            </Pressable>
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
  empty: { color: colors.inkSofter, textAlign: "center", marginTop: space(10) },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(3), gap: space(3) },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.bg },
  thumbPlaceholder: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  locName: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  locAddr: { color: colors.inkSoft, fontSize: 13, marginTop: 2 },
  fab: { position: "absolute", bottom: space(6), right: space(5), width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#fff", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space(5), paddingBottom: space(8), gap: space(2) },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.ink, minHeight: 44 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: space(2), paddingVertical: space(2) },
  photoText: { color: colors.accent, fontWeight: "600", fontSize: 14, flex: 1 },
  modalActions: { flexDirection: "row", gap: space(3), marginTop: space(2) },
  cancelBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { color: colors.inkSoft, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, backgroundColor: colors.accent },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
