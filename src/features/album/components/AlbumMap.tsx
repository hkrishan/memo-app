/**
 * AlbumMap Component
 * Map of where the album's photos were taken. Photos that sit close
 * together at the current zoom level merge into a cluster marker showing
 * the newest photo, a count label, and the members who added them; a
 * lone photo shows its thumbnail with the uploader's avatar. Tapping a
 * marker hands its photo(s) to onPressPhotos — the screen opens a
 * preview. Clustering is grid-based over the visible region —
 * recomputed whenever the user stops panning/zooming.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Region } from "react-native-maps";

import { PhotoWithUploader } from "../types/album.types";
import { User } from "@/features/user/types/user.types";
import { CachedImage } from "@/components/ui/CachedImage";
import Avatar from "@/components/ui/Avatar";

const MARKER_SIZE = 44;
/** Markers closer than this (screen px) merge into one cluster */
const CLUSTER_RADIUS_PX = 64;
const MAX_CLUSTER_AVATARS = 3;
/** Cluster tap: zoom-to-fit duration, then the preview opens */
const CLUSTER_ZOOM_DURATION_MS = 350;
/** Tightest zoom a cluster tap goes to (~400m across) */
const CLUSTER_ZOOM_MIN_DELTA = 0.004;

type LocatedPhoto = PhotoWithUploader & {
  latitude: number;
  longitude: number;
};

type MapCluster = {
  id: string;
  latitude: number;
  longitude: number;
  /** Newest first — [0] is the cluster's face */
  photos: LocatedPhoto[];
  uploaders: LocatedPhoto["uploader"][];
};

interface AlbumMapProps {
  photos: PhotoWithUploader[] | undefined;
  /** Fires with the tapped marker's photos — one for a lone pin, all of them for a cluster (newest first) */
  onPressPhotos?: (photos: PhotoWithUploader[]) => void;
}

/**
 * One marker per cluster. iOS re-rasterizes custom marker views every
 * frame while tracksViewChanges is on — with dozens of image markers that
 * janks anything animating over the map (the photo preview fade). Track
 * until the face image has painted, then freeze the raster.
 */
const ClusterMarkerView = memo<{
  cluster: MapCluster;
  onPress: (cluster: MapCluster) => void;
}>(({ cluster, onPress }) => {
  const [tracksChanges, setTracksChanges] = useState(true);

  const face = cluster.photos[0];
  const isCluster = cluster.photos.length > 1;

  const handleFacePainted = useCallback(() => {
    // Give the (tiny, cached) avatar images a beat to paint too
    setTimeout(() => setTracksChanges(false), 150);
  }, []);

  const handlePress = useCallback(() => onPress(cluster), [onPress, cluster]);

  return (
    <Marker
      coordinate={{
        latitude: cluster.latitude,
        longitude: cluster.longitude,
      }}
      onPress={handlePress}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksChanges}
    >
      <View style={styles.markerContainer}>
        <View style={styles.markerFrame}>
          <CachedImage
            uri={face.thumbnailUrl ?? face.url}
            style={styles.markerImage}
            onLoadEnd={handleFacePainted}
          />
        </View>

        {isCluster && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{cluster.photos.length}</Text>
          </View>
        )}

        <View style={styles.avatarRow}>
          {cluster.uploaders
            .slice(0, MAX_CLUSTER_AVATARS)
            .map((uploader, index) => (
              <View
                key={uploader.userId}
                style={[styles.avatarRing, index > 0 && styles.avatarOverlap]}
              >
                <Avatar user={uploader as User} size={16} />
              </View>
            ))}
          {cluster.uploaders.length > MAX_CLUSTER_AVATARS && (
            <View style={[styles.avatarRing, styles.avatarOverlap]}>
              <View style={styles.avatarMore}>
                <Text style={styles.avatarMoreText}>
                  +{cluster.uploaders.length - MAX_CLUSTER_AVATARS}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Marker>
  );
});
ClusterMarkerView.displayName = "ClusterMarkerView";

const boundingRegion = (
  photos: LocatedPhoto[],
  minDelta = 0.02,
): Region => {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const photo of photos) {
    minLat = Math.min(minLat, photo.latitude);
    maxLat = Math.max(maxLat, photo.latitude);
    minLng = Math.min(minLng, photo.longitude);
    maxLng = Math.max(maxLng, photo.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // Padding around the outermost pins; floor keeps co-located pins sensible
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, minDelta),
    longitudeDelta: Math.max((maxLng - minLng) * 1.6, minDelta),
  };
};

export const AlbumMap: React.FC<AlbumMapProps> = ({
  photos,
  onPressPhotos,
}) => {
  const mapRef = useRef<MapView>(null);
  const window = useWindowDimensions();
  const [mapSize, setMapSize] = useState<{ width: number; height: number }>();
  const [region, setRegion] = useState<Region | null>(null);

  const located = useMemo(
    () =>
      (photos ?? [])
        .filter(
          (photo): photo is LocatedPhoto =>
            typeof photo.latitude === "number" &&
            typeof photo.longitude === "number",
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [photos],
  );

  const initialRegion = useMemo(
    () => (located.length > 0 ? boundingRegion(located) : null),
    [located],
  );

  const clusters = useMemo<MapCluster[]>(() => {
    const activeRegion = region ?? initialRegion;
    if (!activeRegion || located.length === 0) return [];
    const width = mapSize?.width ?? window.width;
    const height = mapSize?.height ?? window.height;

    // Grid cell spanning CLUSTER_RADIUS_PX at the current zoom
    const cellLng = Math.max(
      (activeRegion.longitudeDelta / width) * CLUSTER_RADIUS_PX,
      1e-8,
    );
    const cellLat = Math.max(
      (activeRegion.latitudeDelta / height) * CLUSTER_RADIUS_PX,
      1e-8,
    );

    const cells = new Map<string, LocatedPhoto[]>();
    for (const photo of located) {
      const key = `${Math.floor(photo.longitude / cellLng)}:${Math.floor(
        photo.latitude / cellLat,
      )}`;
      const bucket = cells.get(key);
      if (bucket) bucket.push(photo);
      else cells.set(key, [photo]);
    }

    return [...cells.values()].map((cellPhotos) => {
      let latSum = 0;
      let lngSum = 0;
      const uploaders: LocatedPhoto["uploader"][] = [];
      const seenUploaders = new Set<string>();
      for (const photo of cellPhotos) {
        latSum += photo.latitude;
        lngSum += photo.longitude;
        if (!seenUploaders.has(photo.uploader.userId)) {
          seenUploaders.add(photo.uploader.userId);
          uploaders.push(photo.uploader);
        }
      }
      return {
        // Keyed by membership so markers only remount when grouping changes
        id: `${cellPhotos[0].photoId}:${cellPhotos.length}`,
        latitude: latSum / cellPhotos.length,
        longitude: lngSum / cellPhotos.length,
        photos: cellPhotos,
        uploaders,
      };
    });
  }, [located, region, initialRegion, mapSize, window.width, window.height]);

  const handleMapLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = event.nativeEvent.layout;
      if (width > 0 && height > 0) setMapSize({ width, height });
    },
    [],
  );

  const handleRegionChangeComplete = useCallback((next: Region) => {
    setRegion(next);
  }, []);

  // A cluster tap from far away just zooms in; only once zooming can't
  // meaningfully split the group does a tap open the preview
  const handlePressCluster = useCallback(
    (cluster: MapCluster) => {
      if (cluster.photos.length === 1) {
        onPressPhotos?.(cluster.photos);
        return;
      }

      const activeRegion = region ?? initialRegion;
      const target = boundingRegion(cluster.photos, CLUSTER_ZOOM_MIN_DELTA);
      // Already at (or past) the zoom this cluster needs — show its photos
      if (
        !activeRegion ||
        target.latitudeDelta >= activeRegion.latitudeDelta * 0.8
      ) {
        onPressPhotos?.(cluster.photos);
        return;
      }

      mapRef.current?.animateToRegion(target, CLUSTER_ZOOM_DURATION_MS);
    },
    [onPressPhotos, region, initialRegion],
  );

  if (located.length === 0 || !initialRegion) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="map-outline" size={44} color="#ccc" />
        <Text style={styles.emptyTitle}>No locations yet</Text>
        <Text style={styles.emptySubtitle}>
          Photos that include where they were taken show up here
        </Text>
      </View>
    );
  }

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      onLayout={handleMapLayout}
      initialRegion={initialRegion}
      onRegionChangeComplete={handleRegionChangeComplete}
      showsPointsOfInterest={false}
    >
      {clusters.map((cluster) => (
        <ClusterMarkerView
          key={cluster.id}
          cluster={cluster}
          onPress={handlePressCluster}
        />
      ))}
    </MapView>
  );
};

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  // Padding gives the badges room without clipping
  markerContainer: {
    padding: 7,
    alignItems: "center",
  },
  markerFrame: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "#e5e5e5",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  markerImage: {
    width: "100%",
    height: "100%",
  },
  countBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#000",
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  avatarRow: {
    position: "absolute",
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarRing: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  avatarOverlap: {
    marginLeft: -6,
  },
  avatarMore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMoreText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
    backgroundColor: "#fff",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
});

export default AlbumMap;
