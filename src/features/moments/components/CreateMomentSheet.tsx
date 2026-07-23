/**
 * Bottom sheet for starting a moment. Reuses the photoSocial
 * SocialBottomSheet chrome. Two states: a type picker iterating the
 * registry, or (once a type is chosen / preselected) that type's
 * CreateForm.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import SocialBottomSheet from "@/features/album/components/photoSocial/SocialBottomSheet";
import { MomentType } from "../types/moment.types";
import { momentTypeRegistry, momentTypeList } from "../registry/momentTypes";

interface CreateMomentSheetProps {
  albumId: string;
  visible: boolean;
  /** Skip the picker and jump straight to this type's form */
  initialType?: MomentType | null;
  onClose: () => void;
}

const CreateMomentSheet: React.FC<CreateMomentSheetProps> = ({
  albumId,
  visible,
  initialType = null,
  onClose,
}) => {
  const [selectedType, setSelectedType] = useState<MomentType | null>(
    initialType,
  );

  // Re-arm the sheet's state each time it opens
  useEffect(() => {
    if (visible) setSelectedType(initialType);
  }, [visible, initialType]);

  const handleBack = useCallback(() => setSelectedType(null), []);

  const definition = selectedType ? momentTypeRegistry[selectedType] : null;
  const title = definition ? definition.displayName : "Start a moment";

  return (
    <SocialBottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      heightFraction={0.68}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {definition ? (
          <>
            {/* Back to the picker (only when the picker was the entry point) */}
            {initialType == null && (
              <Pressable
                onPress={handleBack}
                style={styles.backRow}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Back to moment types"
              >
                <Ionicons name="chevron-back" size={16} color="#8E8E93" />
                <Text style={styles.backLabel}>All moments</Text>
              </Pressable>
            )}
            <definition.CreateForm albumId={albumId} onClose={onClose} />
          </>
        ) : (
          <View style={styles.pickerContainer}>
            {momentTypeList.map((entry) => (
              <Pressable
                key={entry.type}
                style={styles.typeRow}
                onPress={() => setSelectedType(entry.type)}
                accessibilityRole="button"
                accessibilityLabel={`Start a ${entry.displayName}`}
              >
                <View
                  style={[
                    styles.typeIcon,
                    { backgroundColor: `${entry.accentColor}26` },
                  ]}
                >
                  <Ionicons
                    name={entry.icon}
                    size={20}
                    color={entry.accentColor}
                  />
                </View>
                <View style={styles.typeText}>
                  <Text style={styles.typeName}>{entry.displayName}</Text>
                  <Text style={styles.typeTagline}>{entry.tagline}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="rgba(255, 255, 255, 0.35)"
                />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SocialBottomSheet>
  );
};

const styles = StyleSheet.create({
  pickerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 16,
    padding: 14,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  typeText: {
    flex: 1,
  },
  typeName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  typeTagline: {
    color: "rgba(255, 255, 255, 0.55)",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 4,
    alignSelf: "flex-start",
  },
  backLabel: {
    color: "#8E8E93",
    fontSize: 13,
    fontWeight: "600",
  },
});

export default CreateMomentSheet;
