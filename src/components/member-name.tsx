import { LevelBadge } from "@/components/level-badge";
import type { StaffLevel } from "@/data/staff";
import { useTheme } from "@/hooks/use-theme";
import type { StyleProp } from "react-native";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export interface MemberNameProps {
  name: string;
  level: StaffLevel;
  /** Caps the NAME's width — beyond it the name truncates with '…' while the
   *  badge stays visible. (Fill-and-truncate inside a bounded row is also
   *  possible via `nameStyle={{ flex: 1 }}`.) */
  maxWidth?: number;
  /** Extra style on the name+badge row container. */
  style?: StyleProp<ViewStyle>;
  /** Typography / flex for the name (size / weight / color / flex); merged over
   *  the default. Pass `flex: 1` to make the name fill a bounded row. */
  nameStyle?: StyleProp<TextStyle>;
}

export function MemberName({
  name,
  level,
  maxWidth,
  style,
  nameStyle,
}: MemberNameProps) {
  const theme = useTheme();

  return (
    <View testID="member-name" style={[styles.row, style]}>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[
          styles.name,
          { color: theme.text },
          maxWidth != null && { maxWidth },
          nameStyle,
        ]}
      >
        {name}
      </Text>
      <LevelBadge level={level} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
  name: { fontSize: 13 },
});
