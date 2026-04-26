import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { resolveOrganizationId } from "@/lib/merchantOrg";
import { colors, radius, space } from "@/lib/theme";

type Member = { id: string; user_id: string; role: string; email?: string };

const ROLES = ["owner", "manager", "staff"];

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState("");
  const [myUserId, setMyUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyUserId(user.id);
    const oid = await resolveOrganizationId(supabase);
    if (!oid) { setLoading(false); return; }
    setOrgId(oid);
    const { data: myMemRows } = await supabase
      .from("memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", oid)
      .limit(1);
    setMyRole((myMemRows?.[0] as { role: string } | undefined)?.role ?? "");
    const { data: org } = await supabase.from("organizations").select("name").eq("id", oid).single();
    if (org) { setOrgName(org.name); setNewOrgName(org.name); }
    const { data: allMem } = await supabase.from("memberships").select("id, user_id, role").eq("organization_id", oid);
    setMembers((allMem ?? []) as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function renameOrg() {
    if (!supabase || !orgId || !newOrgName.trim()) return;
    setRenaming(true);
    await supabase.from("organizations").update({ name: newOrgName.trim() }).eq("id", orgId);
    setOrgName(newOrgName.trim());
    setRenaming(false);
    Alert.alert("Renamed", "Organization name updated.");
  }

  async function invite() {
    if (!supabase || !orgId) return;
    if (!inviteEmail.trim()) { Alert.alert("Required", "Email is required."); return; }
    setSaving(true);
    try {
      const { data: userId, error: lookupErr } = await supabase.rpc("get_user_id_by_email", { p_email: inviteEmail.trim() });
      if (lookupErr || !userId) {
        Alert.alert("Not Found", "No user with that email. They must sign up first.");
        setSaving(false); return;
      }
      const { error: insertErr } = await supabase.from("memberships").insert({ user_id: userId, organization_id: orgId, role: inviteRole });
      if (insertErr) { Alert.alert("Error", insertErr.message); setSaving(false); return; }
      setInviteModal(false); setInviteEmail("");
      Alert.alert("Invited", `Team member added as ${inviteRole}.`);
      load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally { setSaving(false); }
  }

  async function changeRole(memberId: string, newRole: string) {
    if (!supabase) return;
    await supabase.from("memberships").update({ role: newRole }).eq("id", memberId);
    load();
  }

  function confirmRemove(member: Member) {
    if (member.user_id === myUserId) { Alert.alert("Cannot remove yourself"); return; }
    Alert.alert("Remove Member", "Remove this team member?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        if (!supabase) return;
        await supabase.from("memberships").delete().eq("id", member.id);
        load();
      }},
    ]);
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.accent} /></View>;

  const isOwner = myRole === "owner";

  return (
    <View style={s.root}>
      {isOwner && (
        <View style={s.renameSection}>
          <Text style={s.label}>Organization Name</Text>
          <View style={s.renameRow}>
            <TextInput style={[s.input, { flex: 1 }]} value={newOrgName} onChangeText={setNewOrgName} placeholderTextColor={colors.inkSofter} />
            <Pressable style={[s.renameBtn, renaming && { opacity: 0.6 }]} onPress={renameOrg} disabled={renaming}>
              <Text style={s.renameBtnText}>{renaming ? "…" : "Rename"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Members ({members.length})</Text>
        <Pressable onPress={() => setInviteModal(true)} style={s.addBtn}>
          <Ionicons name="person-add" size={14} color="#fff" />
          <Text style={s.addBtnText}>Invite</Text>
        </Pressable>
      </View>

      <FlatList
        data={members}
        keyExtractor={(i) => i.id}
        contentContainerStyle={s.list}
        renderItem={({ item: m }) => (
          <View style={s.memberCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.memberName}>{m.user_id === myUserId ? "You" : m.user_id.slice(0, 8) + "…"}</Text>
              <View style={s.roleRow}>
                {ROLES.map(r => (
                  <Pressable key={r} onPress={() => isOwner && m.user_id !== myUserId ? changeRole(m.id, r) : null}
                    style={[s.roleChip, m.role === r && s.roleChipActive]}>
                    <Text style={[s.roleChipText, m.role === r && s.roleChipTextActive]}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {isOwner && m.user_id !== myUserId && (
              <Pressable onPress={() => confirmRemove(m)} hitSlop={8}>
                <Ionicons name="remove-circle-outline" size={22} color={colors.red} />
              </Pressable>
            )}
          </View>
        )}
      />

      <Modal visible={inviteModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { paddingBottom: space(5) + insets.bottom }]}>
            <Text style={s.modalTitle}>Invite Team Member</Text>
            <Text style={s.label}>Email</Text>
            <TextInput style={s.input} value={inviteEmail} onChangeText={setInviteEmail} placeholder="team@example.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.inkSofter} />
            <Text style={s.label}>Role</Text>
            <View style={s.chipRow}>
              {ROLES.filter(r => r !== "owner").map(r => (
                <Pressable key={r} onPress={() => setInviteRole(r)} style={[s.chip, inviteRole === r && s.chipActive]}>
                  <Text style={[s.chipText, inviteRole === r && s.chipTextActive]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.modalActions}>
              <Pressable onPress={() => setInviteModal(false)} style={s.cancelBtn}><Text style={s.cancelBtnText}>Cancel</Text></Pressable>
              <Pressable onPress={invite} style={[s.saveBtn, saving && { opacity: 0.6 }]} disabled={saving}><Text style={s.saveBtnText}>{saving ? "Sending…" : "Invite"}</Text></Pressable>
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
  renameSection: { marginBottom: space(4) },
  renameRow: { flexDirection: "row", gap: space(2), marginTop: space(1) },
  renameBtn: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space(4), justifyContent: "center" },
  renameBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space(3) },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(1.5), paddingHorizontal: space(3) },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  list: { gap: space(3), paddingBottom: space(6) },
  memberCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space(4), gap: space(3) },
  memberName: { color: colors.ink, fontSize: 15, fontWeight: "600", marginBottom: space(1) },
  roleRow: { flexDirection: "row", gap: 4 },
  roleChip: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  roleChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  roleChipText: { fontSize: 11, fontWeight: "600", color: colors.inkSoft, textTransform: "capitalize" },
  roleChipTextActive: { color: "#fff" },
  label: { color: colors.inkSoft, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.ink },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#fff", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space(5), paddingBottom: space(8), gap: space(3) },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  chipRow: { flexDirection: "row", gap: 6 },
  chip: { paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.inkSoft, textTransform: "capitalize" },
  chipTextActive: { color: "#fff" },
  modalActions: { flexDirection: "row", gap: space(3), marginTop: space(2) },
  cancelBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { color: colors.inkSoft, fontWeight: "600" },
  saveBtn: { flex: 1, paddingVertical: space(3), alignItems: "center", borderRadius: radius.pill, backgroundColor: colors.accent },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
