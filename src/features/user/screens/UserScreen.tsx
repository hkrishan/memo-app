import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  Platform,
} from "react-native";
import { Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import dayjs from "dayjs";
import SafeAreaView from "@/components/layout/SafeAreaView";
import Avatar from "@/components/ui/Avatar";
import { notify, uploadIndicator } from "@/components/global";
import useUser from "../hooks/useUser";
import {
  useUpdateAvatarMutation,
  useUpdateProfileMutation,
} from "../api/user.queries";
import { color, type } from "@/lib/tokens";

const AVATAR_SIZE = 140;

const UserScreen = () => {
  const router = useRouter();
  const { user } = useUser();
  const { mutateAsync: updateAvatarAsync, isPending: isUploading } =
    useUpdateAvatarMutation();
  const { mutate: updateProfile, isPending: isSaving } =
    useUpdateProfileMutation();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handlePickerResult = useCallback(
    (result: ImagePicker.ImagePickerResult) => {
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileName =
        asset.fileName ?? asset.uri.split("/").pop() ?? "avatar.jpg";
      const mimeType = asset.mimeType ?? "image/jpeg";

      // Only one avatar upload can run at a time (guarded by isUploading),
      // so a fixed indicator id is safe. mutateAsync, not per-call callbacks:
      // react-query drops those on unmount, stranding the pill mid-spin.
      uploadIndicator.begin("avatar-upload", "Updating photo…");
      updateAvatarAsync({ fileUri: asset.uri, fileName, mimeType })
        .then(() => {
          uploadIndicator.succeed("avatar-upload", "Photo updated");
        })
        .catch(() => {
          uploadIndicator.fail("avatar-upload", "Couldn't update photo");
        });
    },
    [updateAvatarAsync],
  );

  const showPermissionDeniedAlert = useCallback((what: string) => {
    // Permanently denied — the OS won't show the prompt again, so the only
    // way forward is the system settings screen
    Alert.alert(
      "Permission required",
      `${what} access has been disabled. You can enable it in Settings.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ],
    );
  }, []);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        showPermissionDeniedAlert("Camera");
      } else {
        notify.error(
          "Permission required",
          "Camera access is needed to take a photo",
        );
      }
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    handlePickerResult(result);
  }, [handlePickerResult, showPermissionDeniedAlert]);

  const chooseFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) {
        showPermissionDeniedAlert("Photo library");
      } else {
        notify.error(
          "Permission required",
          "Photo library access is needed to choose a photo",
        );
      }
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    handlePickerResult(result);
  }, [handlePickerResult, showPermissionDeniedAlert]);

  const handleChangeAvatar = useCallback(() => {
    if (isUploading) return;

    Alert.alert("Change Profile Photo", undefined, [
      { text: "Take Photo", onPress: takePhoto },
      { text: "Choose from Library", onPress: chooseFromLibrary },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [isUploading, takePhoto, chooseFromLibrary]);

  const handleStartEditName = useCallback(() => {
    setNameDraft(user?.name ?? "");
    setIsEditingName(true);
  }, [user?.name]);

  const handleCancelEditName = useCallback(() => {
    if (isSaving) return;
    setIsEditingName(false);
    setNameDraft("");
  }, [isSaving]);

  const handleSaveName = useCallback(() => {
    if (isSaving) return;

    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === user?.name) {
      // Nothing to save — behave like cancel
      setIsEditingName(false);
      setNameDraft("");
      return;
    }

    updateProfile(
      { name: trimmed },
      {
        onSuccess: () => {
          // Cache and auth store are already synced by the mutation hook
          setIsEditingName(false);
          setNameDraft("");
        },
        onError: () => {
          notify.error("Couldn't save", "Please try again");
        },
      },
    );
  }, [isSaving, nameDraft, user?.name, updateProfile]);

  const joined = user?.createdAt ? dayjs(user.createdAt) : null;
  const memberSince = joined?.isValid() ? joined.format("MMMM YYYY") : null;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      {/* automaticallyAdjustKeyboardInsets works correctly inside a pageSheet
          modal, where KeyboardAvoidingView miscalculates by the sheet offset */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
          <SafeAreaView edges={Platform.OS === "android" ? ["top", "bottom"] : ["bottom"]} style={styles.safeArea}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable
                onPress={handleClose}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.rowPressed,
                ]}
              >
                <Ionicons name="chevron-down" size={26} color={color.textPrimary} />
              </Pressable>
              <Text style={styles.headerTitle}>Account</Text>
            </View>

            {/* Avatar + name */}
            <View style={styles.avatarSection}>
              <Pressable
                onPress={handleChangeAvatar}
                disabled={isUploading}
                style={({ pressed }) => [
                  styles.avatarWrapper,
                  pressed && styles.rowPressed,
                ]}
              >
                <Avatar user={user} size={AVATAR_SIZE} />
                {isUploading && (
                  <View style={styles.avatarLoadingOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
                <View style={styles.editBadge}>
                  <Ionicons name="camera" size={16} color="#fff" />
                </View>
              </Pressable>
              <Text
                style={styles.name}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {user?.name}
              </Text>
              {memberSince && (
                <Text style={styles.memberSince}>
                  Member since {memberSince}
                </Text>
              )}
            </View>

            {/* Details */}
            <Text style={styles.sectionLabel}>Details</Text>
            <View>
              {isEditingName ? (
                <View style={styles.row}>
                  <Ionicons name="person-outline" size={22} color={color.textPrimary} />
                  <TextInput
                    mode="outlined"
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    autoFocus
                    maxLength={255}
                    disabled={isSaving}
                    dense
                    style={styles.nameInput}
                    placeholder="Your name"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                    onFocus={() => scrollRef.current?.scrollToEnd()}
                  />
                  {isSaving ? (
                    <ActivityIndicator
                      size="small"
                      color="#999"
                      style={styles.editAction}
                    />
                  ) : (
                    <Pressable
                      onPress={handleSaveName}
                      disabled={!nameDraft.trim()}
                      hitSlop={{ top: 8, bottom: 8 }}
                      style={({ pressed }) => [
                        styles.editAction,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      <Ionicons
                        name="checkmark"
                        size={22}
                        color={nameDraft.trim() ? "#000" : "#ccc"}
                      />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={handleCancelEditName}
                    disabled={isSaving}
                    hitSlop={{ top: 8, bottom: 8 }}
                    style={({ pressed }) => [
                      styles.editAction,
                      (pressed || isSaving) && styles.rowPressed,
                    ]}
                  >
                    <Ionicons name="close" size={22} color="#999" />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={handleStartEditName}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Ionicons name="person-outline" size={22} color={color.textPrimary} />
                  <Text style={styles.rowTitle}>Name</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {user?.name ?? ""}
                  </Text>
                  <Ionicons name="create-outline" size={18} color="#999" />
                </Pressable>
              )}
              <View style={styles.rowDivider} />
              <View style={styles.row}>
                <Ionicons name="mail-outline" size={22} color={color.textPrimary} />
                <Text style={styles.rowTitle}>Email</Text>
                <Text
                  style={[styles.rowValue, !user?.email && styles.rowValueMuted]}
                  numberOfLines={1}
                >
                  {user?.email ?? "Not set"}
                </Text>
              </View>
              <View style={styles.rowDivider} />
            </View>
          </SafeAreaView>
      </ScrollView>
    </View>
  );
};

export default UserScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  safeArea: {
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    marginBottom: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...type.title,
    color: color.textPrimary,
  },
  avatarSection: {
    alignItems: "center",
    marginTop: 8,
  },
  avatarWrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  editBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  name: {
    fontSize: 26,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    letterSpacing: -0.4,
    marginTop: 12,
    color: color.textPrimary,
  },
  memberSince: {
    fontSize: 13,
    color: color.textTertiary,
    marginTop: 4,
  },
  sectionLabel: {
    ...type.overline,
    color: color.textTertiary,
    marginTop: 36,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 14,
    // Same height in display and edit mode so rows don't jump
    minHeight: 64,
  },
  rowPressed: {
    opacity: 0.5,
  },
  rowTitle: {
    fontSize: 16,
    color: color.textPrimary,
  },
  rowValue: {
    flex: 1,
    fontSize: 15,
    color: color.textTertiary,
    textAlign: "right",
  },
  rowValueMuted: {
    color: color.textTertiary,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },
  nameInput: {
    flex: 1,
    backgroundColor: "#fff",
    height: 40,
  },
  editAction: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
