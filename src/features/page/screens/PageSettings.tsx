import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Keyboard,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Image,
  Dimensions,
  ActivityIndicator,
  Share,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetPageQuery,
  useUpdatePageMutation,
  useSetWebPasswordMutation,
} from "../api/page.queries";
import { Page, UpdatePageInput } from "../types/page.types";
import { useGetPhotosQuery } from "@/features/album/api/photo.queries";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PICKER_COLUMNS = 3;
const PICKER_GAP = 2;
const PICKER_CELL =
  (SCREEN_WIDTH - PICKER_GAP * (PICKER_COLUMNS - 1)) / PICKER_COLUMNS;

const PageSettingsScreen = () => {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { data: page } = useGetPageQuery(albumId!);

  if (!page) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#000" />
      </View>
    );
  }

  return <PageSettingsForm albumId={albumId!} page={page} />;
};

const PageSettingsForm = ({
  albumId,
  page,
}: {
  albumId: string;
  page: Page;
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: photos } = useGetPhotosQuery(albumId);
  const updatePageMutation = useUpdatePageMutation();

  const [title, setTitle] = useState(page.pageTitle ?? "");
  const [bio, setBio] = useState(page.bio ?? "");
  const [pageHandle, setPageHandle] = useState(page.pageHandle);
  const [isPublic, setIsPublic] = useState(page.isPublic);
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(
    page.coverPhoto?.photoId ?? null,
  );
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(
    page.coverPhoto?.thumbnailUrl ?? page.coverPhoto?.url ?? null,
  );
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Web access: public link + (private pages) password management
  const setWebPasswordMutation = useSetWebPasswordMutation();
  const [editingWebPassword, setEditingWebPassword] = useState(false);
  const [webPasswordDraft, setWebPasswordDraft] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyLink = useCallback(async () => {
    if (!page.webUrl) return;
    try {
      await Clipboard.setStringAsync(page.webUrl);
      setLinkCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      // Clipboard unavailable — nothing to do
    }
  }, [page.webUrl]);

  const handleShareLink = useCallback(() => {
    if (!page.webUrl) return;
    Share.share(
      Platform.OS === "ios"
        ? { url: page.webUrl }
        : { message: page.webUrl },
    ).catch(() => {});
  }, [page.webUrl]);

  const webPasswordValid = webPasswordDraft.trim().length >= 4;
  const handleSaveWebPassword = useCallback(() => {
    const password = webPasswordDraft.trim();
    if (password.length < 4 || setWebPasswordMutation.isPending) return;
    Keyboard.dismiss();
    setWebPasswordMutation.mutate(
      { albumId, pageId: page.pageId, password },
      {
        onSuccess: () => {
          setEditingWebPassword(false);
          setWebPasswordDraft("");
        },
      },
    );
  }, [webPasswordDraft, setWebPasswordMutation, albumId, page.pageId]);

  const handleRemoveWebPassword = useCallback(() => {
    if (setWebPasswordMutation.isPending) return;
    setWebPasswordMutation.mutate(
      { albumId, pageId: page.pageId, password: null },
      { onSuccess: () => setEditingWebPassword(false) },
    );
  }, [setWebPasswordMutation, albumId, page.pageId]);

  const isValid = title.trim().length > 0 && pageHandle.trim().length > 0;

  const changes = useMemo(() => {
    const input: UpdatePageInput = {};
    if (title.trim() !== (page.pageTitle ?? "")) input.title = title.trim();
    if (bio.trim() !== (page.bio ?? "")) input.bio = bio.trim() || null;
    if (pageHandle !== page.pageHandle) input.pageHandle = pageHandle;
    if (isPublic !== page.isPublic) input.isPublic = isPublic;
    if (coverPhotoId !== (page.coverPhoto?.photoId ?? null))
      input.coverPhotoId = coverPhotoId;
    return input;
  }, [title, bio, pageHandle, isPublic, coverPhotoId, page]);

  const hasChanges = Object.keys(changes).length > 0;

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // Remove @ and special characters from handle
  const handlePageHandleChange = useCallback((text: string) => {
    const cleaned = text
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase();
    setPageHandle(cleaned);
  }, []);

  const handleSelectCoverPhoto = useCallback(
    (photoId: string, previewUrl: string) => {
      setCoverPhotoId(photoId);
      setCoverPreviewUrl(previewUrl);
      setIsPickerVisible(false);
    },
    [],
  );

  const handleRemoveCoverPhoto = useCallback(() => {
    setCoverPhotoId(null);
    setCoverPreviewUrl(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!isValid || !hasChanges || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    Keyboard.dismiss();

    try {
      await updatePageMutation.mutateAsync({
        albumId,
        pageId: page.pageId,
        input: changes,
      });
      router.back();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save changes",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isValid,
    hasChanges,
    isSubmitting,
    albumId,
    page.pageId,
    changes,
    updatePageMutation,
    router,
  ]);

  const canSave = isValid && hasChanges && !isSubmitting;

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
        <Text style={styles.headerTitle}>Page Settings</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        >
          <Text
            style={[
              styles.saveButtonText,
              !canSave && styles.saveButtonTextDisabled,
            ]}
          >
            {isSubmitting ? "Saving…" : "Save"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#c62828" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Profile Picture */}
        <View style={styles.avatarSection}>
          <Pressable onPress={() => setIsPickerVisible(true)}>
            {/* Same rounded-square cover shape as the page profile */}
            <View style={styles.avatarFrame}>
              {coverPreviewUrl ? (
                <Image
                  source={{ uri: coverPreviewUrl }}
                  style={styles.avatarImage}
                />
              ) : (
                <Ionicons name="image-outline" size={32} color="#999" />
              )}
              <View style={styles.avatarEdge} pointerEvents="none" />
            </View>
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </Pressable>
          <Pressable onPress={() => setIsPickerVisible(true)}>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </Pressable>
          {coverPhotoId && (
            <Pressable onPress={handleRemoveCoverPhoto}>
              <Text style={styles.removePhotoText}>Remove Photo</Text>
            </Pressable>
          )}
        </View>

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
        </View>

        {/* Bio Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell people what this page is about"
            placeholderTextColor="#999"
            maxLength={500}
            multiline
          />
          <Text style={styles.hint}>Shown at the top of your page</Text>
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

        {/* Page on the web */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Page on the web</Text>
          {page.webUrl ? (
            <View style={styles.webLinkRow}>
              <Ionicons name="globe-outline" size={16} color="#666" />
              <Text style={styles.webLinkText} numberOfLines={1}>
                {page.webUrl.replace(/^https?:\/\//, "")}
              </Text>
              <Pressable
                onPress={handleCopyLink}
                hitSlop={8}
                style={styles.webLinkAction}
                accessibilityRole="button"
                accessibilityLabel="Copy page link"
              >
                <Ionicons
                  name={linkCopied ? "checkmark" : "copy-outline"}
                  size={18}
                  color={linkCopied ? "#1a9c4b" : "#000"}
                />
              </Pressable>
              <Pressable
                onPress={handleShareLink}
                hitSlop={8}
                style={styles.webLinkAction}
                accessibilityRole="button"
                accessibilityLabel="Share page link"
              >
                <Ionicons name="share-outline" size={18} color="#000" />
              </Pressable>
            </View>
          ) : null}
          <Text style={styles.hint}>
            {isPublic
              ? "Anyone with the link can view this page in a browser."
              : page.hasWebPassword
                ? "Private: accepted followers can sign in on the web, and anyone with the page password can view."
                : "Private: accepted followers can sign in on the web to view."}
          </Text>

          {!isPublic && (
            <View style={styles.passwordBlock}>
              {editingWebPassword ? (
                <>
                  <TextInput
                    style={styles.input}
                    value={webPasswordDraft}
                    onChangeText={setWebPasswordDraft}
                    placeholder="Page password (min 4 characters)"
                    placeholderTextColor="#999"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    maxLength={72}
                  />
                  <View style={styles.passwordEditActions}>
                    <Pressable
                      onPress={() => {
                        setEditingWebPassword(false);
                        setWebPasswordDraft("");
                      }}
                      style={styles.passwordCancel}
                      accessibilityRole="button"
                    >
                      <Text style={styles.passwordCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSaveWebPassword}
                      disabled={
                        !webPasswordValid || setWebPasswordMutation.isPending
                      }
                      style={[
                        styles.passwordSave,
                        (!webPasswordValid ||
                          setWebPasswordMutation.isPending) &&
                          styles.passwordSaveDisabled,
                      ]}
                      accessibilityRole="button"
                    >
                      {setWebPasswordMutation.isPending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.passwordSaveText}>
                          Save password
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.passwordRow}>
                  <View style={styles.passwordInfo}>
                    <Text style={styles.passwordTitle}>Page password</Text>
                    <Text style={styles.visibilityDescription}>
                      {page.hasWebPassword
                        ? "On — the page opens with this password"
                        : "Off"}
                    </Text>
                  </View>
                  {page.hasWebPassword ? (
                    <>
                      <Pressable
                        onPress={() => {
                          setEditingWebPassword(true);
                          setWebPasswordDraft("");
                        }}
                        style={styles.passwordAction}
                        accessibilityRole="button"
                      >
                        <Text style={styles.passwordActionText}>Change</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleRemoveWebPassword}
                        style={styles.passwordAction}
                        accessibilityRole="button"
                      >
                        {setWebPasswordMutation.isPending ? (
                          <ActivityIndicator size="small" color="#c62828" />
                        ) : (
                          <Text
                            style={[
                              styles.passwordActionText,
                              styles.passwordActionDanger,
                            ]}
                          >
                            Turn off
                          </Text>
                        )}
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      onPress={() => {
                        setEditingWebPassword(true);
                        setWebPasswordDraft("");
                      }}
                      style={styles.passwordAction}
                      accessibilityRole="button"
                    >
                      <Text style={styles.passwordActionText}>
                        Set password
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Cover photo picker */}
      <Modal
        visible={isPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Pressable
              onPress={() => setIsPickerVisible(false)}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={28} color="#000" />
            </Pressable>
            <Text style={styles.headerTitle}>Choose Photo</Text>
            <View style={styles.backButton} />
          </View>

          {photos && photos.length > 0 ? (
            <FlatList
              data={photos}
              keyExtractor={(item) => item.photoId}
              numColumns={PICKER_COLUMNS}
              columnWrapperStyle={styles.pickerRow}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              renderItem={({ item }) => {
                const isSelected = item.photoId === coverPhotoId;
                return (
                  <Pressable
                    onPress={() =>
                      handleSelectCoverPhoto(
                        item.photoId,
                        item.thumbnailUrl ?? item.url,
                      )
                    }
                    style={styles.pickerCell}
                  >
                    <Image
                      source={{ uri: item.thumbnailUrl ?? item.url }}
                      style={styles.pickerImage}
                    />
                    {isSelected && (
                      <View style={styles.pickerSelectedOverlay}>
                        <Ionicons
                          name="checkmark-circle"
                          size={28}
                          color="#fff"
                        />
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          ) : (
            <View style={styles.pickerEmpty}>
              <Ionicons name="images-outline" size={40} color="#ccc" />
              <Text style={styles.pickerEmptyText}>
                Add photos to the album first to use one as the page photo
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
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
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#000",
    borderRadius: 20,
  },
  saveButtonDisabled: {
    backgroundColor: "#e0e0e0",
  },
  saveButtonText: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#fff",
  },
  saveButtonTextDisabled: {
    color: "#999",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fdecea",
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#c62828",
  },
  avatarSection: {
    alignItems: "center",
    gap: 8,
    marginBottom: 28,
  },
  avatarFrame: {
    width: 96,
    height: 96,
    borderRadius: 26,
    backgroundColor: "#F1F1F3",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarEdge: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#000",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  changePhotoText: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  removePhotoText: {
    fontSize: 14,
    color: "#c62828",
  },
  inputGroup: {
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
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
  bioInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  hint: {
    fontSize: 13,
    color: "#888",
    marginTop: 8,
  },
  webLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  webLinkText: {
    flex: 1,
    fontSize: 14,
    color: "#111",
  },
  webLinkAction: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  passwordBlock: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  passwordInfo: {
    flex: 1,
  },
  passwordTitle: {
    fontSize: 15,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#111",
  },
  passwordAction: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  passwordActionText: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#000",
  },
  passwordActionDanger: {
    color: "#c62828",
  },
  passwordEditActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 14,
  },
  passwordCancel: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  passwordCancelText: {
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
    color: "#666",
  },
  passwordSave: {
    backgroundColor: "#000",
    borderRadius: 20,
    paddingHorizontal: 18,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  passwordSaveDisabled: {
    opacity: 0.4,
  },
  passwordSaveText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "InstrumentSans_600SemiBold",
    fontWeight: "600",
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
    fontFamily: "InstrumentSans_600SemiBold",
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
    fontFamily: "InstrumentSans_500Medium",
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
  pickerContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  pickerRow: {
    gap: PICKER_GAP,
    marginBottom: PICKER_GAP,
  },
  pickerCell: {
    width: PICKER_CELL,
    height: PICKER_CELL,
  },
  pickerImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f0f0f0",
  },
  pickerSelectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  pickerEmptyText: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
});

export default PageSettingsScreen;
