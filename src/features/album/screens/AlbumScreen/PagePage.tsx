import { ResizeMode, Video } from "expo-av";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { View, StyleSheet, Text, Image, Pressable } from "react-native";
import { Button } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useGetPageQuery } from "@/features/page/api/page.queries";
import { Page } from "@/features/page/types/page.types";
import PostGrid from "@/features/page/components/PostGrid";

interface PagePageProps {
  contentTop: number;
}

const PagePage: React.FC<PagePageProps> = ({ contentTop }) => {
  const { albumId }: { albumId: string } = useLocalSearchParams();
  const { data: page } = useGetPageQuery(albumId);

  if (page == null) {
    return <NoPage albumId={albumId} />;
  }

  return (
    <PageContent
      albumId={albumId}
      pageId={page.pageId}
      page={page}
      contentTop={contentTop}
    />
  );
};

const PageContent = ({
  contentTop,
  albumId,
  pageId,
  page,
}: {
  contentTop: number;
  albumId: string;
  pageId: string;
  page: Page;
}) => {
  const handleCreatePost = useCallback(() => {
    router.push(`/album/${albumId}/page/${pageId}/create-post`);
  }, [albumId, pageId]);

  const headerComponent = useMemo(
    () => (
      <View style={styles.headerSection}>
        <View style={styles.profileRow}>
          <PageCoverPhoto page={page} />
          <View style={styles.profileInfo}>
            <Text style={styles.pageTitle}>{page?.pageTitle}</Text>
            <Text style={styles.pageHandle}>@{page?.pageHandle}</Text>
          </View>
        </View>
        <Pressable onPress={handleCreatePost} style={styles.createPostButton}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.createPostButtonText}>New Post</Text>
        </Pressable>
      </View>
    ),
    [page, handleCreatePost]
  );

  return (
    <View style={styles.pagePlain}>
      <PostGrid
        albumId={albumId}
        pageId={pageId}
        ListHeaderComponent={headerComponent}
        contentContainerStyle={{ paddingTop: contentTop, paddingBottom: 100 }}
      />

      {/* FAB for creating posts */}
      <Pressable
        onPress={handleCreatePost}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
};

const NoPage = ({ albumId }: { albumId: string }) => {
  const handleCreatePage = () => {
    router.push(`/album/${albumId}/page/create`);
  };
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Video
        source={require("./../../../../../assets/memo-background-vid.mp4")}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
      />
      <BlurView
        style={{ ...StyleSheet.absoluteFillObject }}
        intensity={80}
        tint="extraLight"
      />
      <View
        style={{
          paddingHorizontal: 40,
          gap: 10,
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          Create a public page for your album
        </Text>
        <Text
          style={{
            textAlign: "center",
          }}
        >
          Choose what photos to include on your page and share it with others
        </Text>
        <Button
          mode="contained"
          style={{ marginTop: 10 }}
          onPress={handleCreatePage}
        >
          Create Page
        </Button>
      </View>
    </View>
  );
};

const PageCoverPhoto = ({ page }: { page: Page }) => {
  return (
    <LinearGradient
      colors={["#ff00b7ff", "#495bffff", "#9b69ffff"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.coverPhotoGradient}
    >
      <View style={styles.coverPhotoInner}>
        <Image
          source={{
            uri: page?.coverPhoto?.thumbnailUrl ?? page?.coverPhoto?.url,
          }}
          style={styles.coverPhotoImage}
        />
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  pagePlain: {
    flex: 1,
    width: "100%",
    backgroundColor: "#fff",
  },
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
    marginBottom: 2,
  },
  profileRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  profileInfo: {
    flex: 1,
    justifyContent: "center",
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginBottom: 4,
  },
  pageHandle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  createPostButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  createPostButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  coverPhotoGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    padding: 3,
  },
  coverPhotoInner: {
    width: "100%",
    height: "100%",
    borderRadius: 34,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  coverPhotoImage: {
    width: "100%",
    height: "100%",
  },
  fab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default PagePage;
