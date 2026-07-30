/**
 * Country calling-code picker for the phone login flow: a dark full-screen
 * modal with search, matching the phone-flow visual language.
 */

import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import CountryFlag from "react-native-country-flag";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COUNTRIES, type Country } from "../lib/countries";

type Props = {
  visible: boolean;
  selected: Country;
  onSelect: (country: Country) => void;
  onClose: () => void;
};

const CountryCodePicker = ({ visible, selected, onSelect, onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const digits = q.replace(/^\+/, "");
    return COUNTRIES.filter(
      (country) =>
        country.name.toLowerCase().includes(q) ||
        (/^\d+$/.test(digits) && country.dial.startsWith(digits)),
    );
  }, [query]);

  const handleSelect = (country: Country) => {
    onSelect(country);
    setQuery("");
    onClose();
  };

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Country code</Text>
          <Pressable
            onPress={handleClose}
            hitSlop={10}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={17} color="#6e6e73" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search country or code"
            placeholderTextColor="#6e6e73"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={(country) => country.iso}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>No country matches "{query}"</Text>
          }
          renderItem={({ item }) => {
            const isSelected = item.iso === selected.iso;
            return (
              <Pressable
                style={styles.row}
                onPress={() => handleSelect(item)}
                accessibilityRole="button"
              >
                <CountryFlag isoCode={item.iso} size={18} style={styles.flag} />
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowDial}>+{item.dial}</Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0e0e10",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: "InstrumentSans_700Bold",
    fontWeight: "700",
    color: "#fff",
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#1c1c1e",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  flag: {
    borderRadius: 3,
  },
  rowName: {
    flex: 1,
    fontSize: 16,
    color: "#fff",
  },
  rowDial: {
    fontSize: 15,
    color: "#9a9aa0",
    fontVariant: ["tabular-nums"],
  },
  empty: {
    paddingTop: 32,
    textAlign: "center",
    fontSize: 14,
    color: "#6e6e73",
  },
});

export default CountryCodePicker;
