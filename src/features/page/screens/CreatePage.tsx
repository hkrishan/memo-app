import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Keyboard,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useCreatePageMutation } from "../api/page.queries";

const CreatePageScreen = () => {
  const router = useRouter();
  const { albumId } = useLocalSearchParams<{ albumId: string }>();

  const [title, setTitle] = useState("");
  const [pageHandle, setPageHandle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValid = title.trim().length > 0 && pageHandle.trim().length > 0;

  const createPageMutation = useCreatePageMutation();

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // Remove @ and special characters from handle
  const handlePageHandleChange = useCallback((text: string) => {
    // Remove @ if user types it, and remove spaces and special chars
    const cleaned = text
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase();
    setPageHandle(cleaned);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!isValid || isSubmitting || !albumId) return;

    setIsSubmitting(true);
    Keyboard.dismiss();

    try {
      const response = await createPageMutation.mutateAsync({
        albumId,
        input: {
          title: title.trim(),
          pageHandle: pageHandle.toLowerCase(),
          isPublic,
        },
      });

      router.back();
    } catch (error) {
      if (__DEV__) console.error("Failed to create page:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, isSubmitting, albumId, pageHandle, title, isPublic, router]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: 20 }]}>
        <Pressable
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={28} color="#000" />
        </Pressable>
        <Text style={styles.headerTitle}>Create Page</Text>
        <Pressable
          onPress={handleCreate}
          disabled={!isValid || isSubmitting}
          style={[
            styles.createButton,
            (!isValid || isSubmitting) && styles.createButtonDisabled,
          ]}
        >
          <Text
            style={[
              styles.createButtonText,
              (!isValid || isSubmitting) && styles.createButtonTextDisabled,
            ]}
          >
            {isSubmitting ? "Creating..." : "Create"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Page Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="My Amazing Page"
            placeholderTextColor="#999"
            maxLength={50}
            autoCapitalize="words"
          />
          <Text style={styles.hint}>This is the display name of your page</Text>
        </View>

        {/* Page Handle Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Page Handle</Text>
          <View style={styles.handleInputContainer}>
            <Text style={styles.handlePrefix}>@</Text>
            <TextInput
              style={styles.handleInput}
              value={pageHandle}
              onChangeText={handlePageHandleChange}
              placeholder="mypage"
              placeholderTextColor="#999"
              maxLength={30}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={styles.hint}>
            Only letters, numbers, and underscores. This will be your page URL.
          </Text>
          {pageHandle.length > 0 && (
            <Text style={styles.preview}>
              memo.app/@{pageHandle.toLowerCase()}
            </Text>
          )}
        </View>

        {/* Visibility Toggle */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Visibility</Text>
          <Pressable
            onPress={() => setIsPublic(true)}
            style={styles.visibilityToggle}
          >
            <View style={styles.visibilityOption}>
              <View
                style={[
                  styles.visibilityIcon,
                  isPublic && styles.visibilityIconActive,
                ]}
              >
                <Ionicons
                  name="globe-outline"
                  size={20}
                  color={isPublic ? "#fff" : "#666"}
                />
              </View>
              <View style={styles.visibilityText}>
                <Text
                  style={[
                    styles.visibilityTitle,
                    isPublic && styles.visibilityTitleActive,
                  ]}
                >
                  Public
                </Text>
                <Text style={styles.visibilityDescription}>
                  Anyone can view this page
                </Text>
              </View>
            </View>
            <View
              style={[styles.radioOuter, isPublic && styles.radioOuterActive]}
            >
              {isPublic && <View style={styles.radioInner} />}
            </View>
          </Pressable>

          <Pressable
            onPress={() => setIsPublic(false)}
            style={styles.visibilityToggle}
          >
            <View style={styles.visibilityOption}>
              <View
                style={[
                  styles.visibilityIcon,
                  !isPublic && styles.visibilityIconActive,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={!isPublic ? "#fff" : "#666"}
                />
              </View>
              <View style={styles.visibilityText}>
                <Text
                  style={[
                    styles.visibilityTitle,
                    !isPublic && styles.visibilityTitleActive,
                  ]}
                >
                  Private
                </Text>
                <Text style={styles.visibilityDescription}>
                  Only album members can view
                </Text>
              </View>
            </View>
            <View
              style={[styles.radioOuter, !isPublic && styles.radioOuterActive]}
            >
              {!isPublic && <View style={styles.radioInner} />}
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  createButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#000",
    borderRadius: 20,
  },
  createButtonDisabled: {
    backgroundColor: "#e0e0e0",
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  createButtonTextDisabled: {
    color: "#999",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 16,
    color: "#000",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  hint: {
    fontSize: 13,
    color: "#888",
    marginTop: 8,
  },
  handleInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  handlePrefix: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    marginRight: 2,
  },
  handleInput: {
    flex: 1,
    fontSize: 16,
    color: "#000",
    paddingVertical: 14,
  },
  preview: {
    fontSize: 13,
    color: "#666",
    marginTop: 8,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  visibilityToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  visibilityOption: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  visibilityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0e0e0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  visibilityIconActive: {
    backgroundColor: "#000",
  },
  visibilityText: {
    flex: 1,
  },
  visibilityTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
  },
  visibilityTitleActive: {
    color: "#000",
  },
  visibilityDescription: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: "#000",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#000",
  },
});

export default CreatePageScreen;
