import React, { useMemo, useState, useCallback } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useCreateAlbumMutation, useJoinAlbumMutation } from "../api/album.queries";
import { useRouter } from "expo-router";
import { notify } from "@/components/global";
import * as Haptics from "expo-haptics";

type ScreenStep = "choice" | "create" | "join";

const CreateAlbumScreen: React.FC = () => {
  const [step, setStep] = useState<ScreenStep>("choice");
  const [albumName, setAlbumName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  // The rejected code — shown inline because the toast host renders
  // beneath this modal; clears as soon as the code is edited
  const [invalidCode, setInvalidCode] = useState<string | null>(null);

  const router = useRouter();

  const createAlbumMutation = useCreateAlbumMutation();
  const joinAlbumMutation = useJoinAlbumMutation();

  const canCreate = useMemo(() => albumName.trim().length > 0, [albumName]);
  const canJoin = useMemo(() => inviteCode.trim().length === 8, [inviteCode]);

  const handleCreate = async () => {
    if (!canCreate) return;

    try {
      const result = await createAlbumMutation.mutateAsync({
        title: albumName,
      });

      router.back();
      setTimeout(() => {
        router.push(`/album/${result.albumId}`);
      }, 500);
    } catch (error) {
      notify.error("Failed to create album. Please try again.");
    }
  };

  const handleJoin = async () => {
    if (!canJoin) return;

    try {
      // Joining is approval-based: this creates a pending request, it does
      // NOT make us a member yet — so don't navigate into the album
      await joinAlbumMutation.mutateAsync(inviteCode.toUpperCase());

      router.back();
      notify.success(
        "Request sent",
        "The album owner will review your request",
      );
    } catch (error) {
      setInvalidCode(inviteCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleSelectCreate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("create");
  }, []);

  const handleSelectJoin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("join");
  }, []);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("choice");
    setAlbumName("");
    setInviteCode("");
  }, []);

  const handleInviteCodeChange = useCallback((text: string) => {
    // Only allow alphanumeric characters and limit to 8
    const cleaned = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
    setInviteCode(cleaned);
    setInvalidCode(null);
  }, []);

  const isInvalidCode = invalidCode !== null && invalidCode === inviteCode;

  // Choice screen
  if (step === "choice") {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.inner}>
          <View style={styles.header}>
            <Text style={styles.title}>Albums</Text>
            <Text style={styles.subtitle}>
              Create a new album or join an existing one with an invite code
            </Text>
          </View>

          <View style={styles.optionsContainer}>
            <Pressable style={styles.optionCard} onPress={handleSelectCreate}>
              <View style={styles.optionIconContainer}>
                <Ionicons name="add-circle" size={32} color="#111" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Create Album</Text>
                <Text style={styles.optionDescription}>
                  Start a new shared album and invite others
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </Pressable>

            <Pressable style={styles.optionCard} onPress={handleSelectJoin}>
              <View style={styles.optionIconContainer}>
                <Ionicons name="enter" size={32} color="#111" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Join Album</Text>
                <Text style={styles.optionDescription}>
                  Enter an 8-character invite code to join
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // Join album screen
  if (step === "join") {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.inner}>
          <StatusBar barStyle="dark-content" />

          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Join album</Text>
          </View>

          <View style={styles.content}>
            <Text style={styles.stepTitle}>Enter invite code</Text>
            <Text style={styles.stepSubtitle}>
              Ask the album owner for the 8-character code
            </Text>
            <TextInput
              style={[styles.codeInput, isInvalidCode && styles.codeInputInvalid]}
              placeholder="XXXXXXXX"
              placeholderTextColor="#ccc"
              value={inviteCode}
              onChangeText={handleInviteCodeChange}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
            />
            {inviteCode.length > 0 && inviteCode.length < 8 && (
              <Text style={styles.helper}>
                {8 - inviteCode.length} more character{8 - inviteCode.length !== 1 ? "s" : ""} needed
              </Text>
            )}
            {isInvalidCode && (
              <Text
                style={styles.invalidHelper}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                That code didn't match an album. Check it and try again.
              </Text>
            )}
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.primaryButton, !canJoin && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={!canJoin || joinAlbumMutation.isPending}
          >
            {joinAlbumMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text
                  style={[
                    styles.primaryButtonText,
                    !canJoin && styles.buttonDisabledText,
                  ]}
                >
                  Join album
                </Text>
                <Ionicons
                  name="enter"
                  size={18}
                  color={canJoin ? "#fff" : "#c5c5c5"}
                  style={{ marginLeft: 6 }}
                />
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Create album screen (default)
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={styles.inner}>
        <StatusBar barStyle="dark-content" />

        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Create album</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.stepTitle}>Name your album</Text>
          <Text style={styles.stepSubtitle}>
            A clear name helps everyone find it.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Summer in Lisbon"
            value={albumName}
            onChangeText={setAlbumName}
            autoFocus
          />
          {!canCreate && <Text style={styles.helper}>Required</Text>}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.primaryButton, !canCreate && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!canCreate || createAlbumMutation.isPending}
        >
          {createAlbumMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text
                style={[
                  styles.primaryButtonText,
                  !canCreate && styles.buttonDisabledText,
                ]}
              >
                Create album
              </Text>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={canCreate ? "#fff" : "#c5c5c5"}
                style={{ marginLeft: 6 }}
              />
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 32,
  },
  backButton: {
    marginBottom: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#111",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextContainer: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 16,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  optionDescription: {
    fontSize: 13,
    color: "#666",
  },
  content: {
    gap: 8,
  },
  stepTitle: {
    fontSize: 18,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#111",
  },
  stepSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  input: {
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    fontSize: 16,
  },
  codeInput: {
    marginTop: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: 4,
    textAlign: "center",
    // Album codes stay monospace — not part of the Instrument Sans sweep
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  helper: {
    color: "#888",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  codeInputInvalid: {
    borderColor: "#E5484D",
    color: "#E5484D",
  },
  invalidHelper: {
    color: "#E5484D",
    fontSize: 13,
    marginTop: 10,
    textAlign: "center",
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#ededed",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#fff",
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonDisabled: {
    backgroundColor: "#e4e4e4",
  },
  buttonDisabledText: {
    color: "#a0a0a0",
  },
});

export default CreateAlbumScreen;
