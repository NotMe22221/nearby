import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "location-photos";

/**
 * Upload a local image file URI to Supabase storage and return the public URL.
 */
export async function uploadLocationCover(
  supabase: SupabaseClient,
  userId: string,
  locationId: string,
  localUri: string,
): Promise<string> {
  const lower = localUri.toLowerCase();
  const isPng = lower.includes("png");
  const ext = isPng ? "png" : "jpg";
  const path = `${userId}/${locationId}.${ext}`;
  const res = await fetch(localUri);
  const buf = await res.arrayBuffer();
  const contentType = isPng ? "image/png" : "image/jpeg";

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType, upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
