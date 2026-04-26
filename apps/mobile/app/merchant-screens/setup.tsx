import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { pickImageFromLibrary } from "@/lib/pickImage";
import { geocodeAddress } from "@/lib/geocode";
import { uploadLocationCover } from "@/lib/locationPhoto";
import { resolveOrganizationId } from "@/lib/merchantOrg";
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
  const [userId, setUserId] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [hasCoords, setHasCoords] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [localCoverUri, setLocalCoverUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const oid = await resolveOrganizationId(supabase);
    if (!oid) { setLoading(false); return; }
    setOrgId(oid);
    const { data: locs } = await supabase
      .from("locations").select("*").eq("organization_id", oid)
      .order("created_at", { ascending: true }).limit(1);
    if (locs?.length) {
      const loc = locs[0] as { id: string; name: string; address: string; slow_hours: SlowHour[]; lat?: number; lng?: number; cover_image_url?: string | null };
      setLocationId(loc.id);
      setName(loc.name ?? "");
      setAddress(loc.address ?? "");
      setSlowHours(loc.slow_hours ?? []);
      setHasCoords(!!(loc.lat && loc.lng));
      setCoverImageUrl(loc.cover_image_url ?? null);
      setLocalCoverUri(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function pickCover() {
    const uri = await pickImageFromLibrary();
    if (uri) setLocalCoverUri(uri);
  }

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
    if (!name.trim()) {
      Alert.alert("Required", "Business name is required.");
      return;
    }
    if (!address.trim()) {
      Alert.alert("Location Required", "Your business address is essential — it's how nearby customers discover you. Please enter your full address.");
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

      let newLocationId = locationId;
      if (data) {
        setOrgId(data.org_id);
        setLocationId(data.location_id);
        newLocationId = data.location_id;
      }

      // Geocode the address to lat/lng
      if (newLocationId && address.trim()) {
        const coords = await geocodeAddress(address.trim());
        if (coords) {
          await supabase.rpc("update_location_coords", {
            p_location_id: newLocationId,
            p_lat: coords.lat,
            p_lng: coords.lng,
          });
          setHasCoords(true);
        }
      }

      if (newLocationId && userId) {
        const uri = localCoverUri;
        if (uri) {
          try {
            const publicUrl = await uploadLocationCover(supabase, userId, newLocationId, uri);
            const { error: imgErr } = await supabase
              .from("locations")
              .update({ cover_image_url: publicUrl })
              .eq("id", newLocationId);
            if (imgErr) { Alert.alert("Photo", `Saved profile but image upload failed: ${imgErr.message}`); }
            else { setCoverImageUrl(publicUrl); setLocalCoverUri(null); }
          } catch (e) {
            Alert.alert("Photo", e instanceof Error ? e.message : "Image upload failed.");
          }
        }
      }

      Alert.alert("Saved", "Business profile updated. Customers nearby can now discover you!");
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

      {/* Location section - prominent */}
      <View style={s.locationSection}>
        <View style={s.locationHeader}>
          <Ionicons name="location" size={20} color={colors.accent} />
          <Text style={s.locationTitle}>Business Location</Text>
          {hasCoords && <Ionicons name="checkmark-circle" size={18} color={colors.green} />}
        </View>
        <Text style={s.locationExplain}>
          Your address is how customers find you on the map. Enter your full street address so people nearby can discover your business and offers.
        </Text>
        <TextInput
          style={s.addressInput}
          value={address}
          onChangeText={setAddress}
          placeholder="e.g. 123 Main St, Woodbury, MN 55125"
          placeholderTextColor={colors.inkSofter}
          multiline
          numberOfLines={2}
        />
        {!address.trim() && (
          <View style={s.warningRow}>
            <Ionicons name="warning-outline" size={16} color="#D97706" />
            <Text style={s.warningText}>Without an address, customers won't be able to find you</Text>
          </View>
        )}
        {hasCoords && (
          <View style={s.successRow}>
            <Ionicons name="navigate-outline" size={14} color={colors.green} />
            <Text style={s.successText}>Location verified — you're on the map!</Text>
          </View>
        )}
      </View>

      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Storefront Photo</Text>
      </View>
      <Text style={s.hint}>This photo appears on the Nearby app for your business.</Text>
      <Pressable onPress={pickCover} style={s.coverBox}>
        {(localCoverUri || coverImageUrl) ? (
          <Image
            source={{ uri: localCoverUri ?? coverImageUrl ?? "" }}
            style={s.coverImg}
            resizeMode="cover"
          />
        ) : (
          <View style={s.coverPlaceholder}>
            <Ionicons name="image-outline" size={40} color={colors.inkSofter} />
            <Text style={s.coverPlText}>Add a cover photo</Text>
          </View>
        )}
        <View style={s.coverEdit}>
          <Ionicons name="camera-outline" size={18} color={colors.accent} />
          <Text style={s.coverEditText}>{(localCoverUri || coverImageUrl) ? "Change photo" : "Choose from library"}</Text>
        </View>
      </Pressable>

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
  locationSection: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accent, borderRadius: radius.lg, padding: space(4), gap: space(2), marginTop: space(3) },
  locationHeader: { flexDirection: "row", alignItems: "center", gap: space(2) },
  locationTitle: { color: colors.ink, fontSize: 16, fontWeight: "700", flex: 1 },
  locationExplain: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  addressInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: colors.ink, minHeight: 56, textAlignVertical: "top" },
  warningRow: { flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: "#FFFBEB", borderRadius: radius.sm, padding: space(2) },
  warningText: { color: "#92400E", fontSize: 12, fontWeight: "500", flex: 1 },
  successRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  successText: { color: colors.green, fontSize: 12, fontWeight: "600" },
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
  coverBox: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.card, marginTop: space(1) },
  coverImg: { width: "100%" as any, height: 160, backgroundColor: colors.bg },
  coverPlaceholder: { height: 160, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: space(1) },
  coverPlText: { color: colors.inkSofter, fontSize: 14, fontWeight: "600" },
  coverEdit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), paddingVertical: space(3) },
  coverEditText: { color: colors.accent, fontWeight: "600", fontSize: 15 },
  saveBtn: { marginTop: space(4), backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: space(3.5), alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
