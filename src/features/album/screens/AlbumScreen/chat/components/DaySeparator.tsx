// Day separator for message list

import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";

interface DaySeparatorProps {
  date: string;
}

const DaySeparator = memo<DaySeparatorProps>(({ date }) => (
  <View style={styles.container}>
    <View style={styles.line} />
    <Text style={styles.text}>{date}</Text>
    <View style={styles.line} />
  </View>
));

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e0e0e0",
  },
  text: {
    fontSize: 12,
    fontFamily: "InstrumentSans_500Medium",
    fontWeight: "500",
    color: "#888",
    paddingHorizontal: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});

export default DaySeparator;
