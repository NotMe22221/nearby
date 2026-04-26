import { requireOptionalNativeModule } from "expo-modules-core";
import { Alert, Platform } from "react-native";
type ImagePickerModule = {
  requestMediaLibraryPermissionsAsync: (
    writeOnly?: boolean,
  ) => Promise<{ granted: boolean }>;
  launchImageLibraryAsync: (options?: {
    mediaTypes?: ("images" | "videos" | "livePhotos")[] | string;
    quality?: number;
  }) => Promise<{
    canceled: boolean;
    assets: { uri: string }[] | null;
  }>;
};

/**
 * Metro can expose `import("expo-image-picker")` as `{ default: module }` or flat named exports.
 */
function resolveImagePickerModule(
  mod: Record<string, unknown>,
): ImagePickerModule | null {
  const asPicker = (x: unknown): ImagePickerModule | null => {
    if (x == null || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (
      typeof o.requestMediaLibraryPermissionsAsync === "function" &&
      typeof o.launchImageLibraryAsync === "function"
    ) {
      return o as unknown as ImagePickerModule;
    }
    return null;
  };

  return asPicker(mod) ?? asPicker(mod.default);
}

/**
 * Opens the photo library without importing expo-image-picker at app startup.
 * If the dev client was built without the native module, user sees a clear message.
 */
const NATIVE_IMAGE_PICKER = "ExponentImagePicker";

function alertRebuildRequired() {
  Alert.alert(
    "New build required",
    "Choose Photo needs the image picker in your app binary. Rebuild the development client, for example: npx eas build --profile development — then install the new build on this device. (Or run: npx expo prebuild and npx expo run:ios / run:android.)",
  );
}

/**
 * If the dev client was built without expo-image-picker native code, we must not
 * `import("expo-image-picker")` — that loads JS which calls `requireNativeModule` and
 * throws, which still surfaces as a redbox even inside try/catch. Optional check avoids that.
 */
export async function pickImageFromLibrary(): Promise<string | null> {
  if (Platform.OS === "web") {
    Alert.alert("Not available", "Photo picking is not set up for web in this build.");
    return null;
  }

  if (!requireOptionalNativeModule(NATIVE_IMAGE_PICKER)) {
    alertRebuildRequired();
    return null;
  }

  try {
    const mod = (await import("expo-image-picker")) as Record<string, unknown>;
    const ImagePicker = resolveImagePickerModule(mod);
    if (!ImagePicker) {
      throw new Error(
        "expo_image_picker_unavailable: module loaded but API missing — rebuild the dev client with expo-image-picker.",
      );
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission", "We need access to your photos to set a store image.");
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    return res.assets[0].uri;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const needsRebuild =
      msg.includes("ExponentImagePicker") ||
      msg.includes("Cannot find native module") ||
      msg.includes("native module") ||
      msg.includes("expo_image_picker_unavailable") ||
      /requestMediaLibraryPermissionsAsync.*not a function|is not a function/i.test(msg);

    if (needsRebuild) {
      alertRebuildRequired();
    } else {
      Alert.alert("Photos", msg);
    }
    return null;
  }
}
