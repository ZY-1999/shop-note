import { Text, type TextProps } from "react-native";

import type { Cents } from "@/data/primitives";
import { useTheme } from "@/hooks/use-theme";
import { formatCentsAsYuan } from "@/lib/format-cents-as-yuan";

/**
 * The single money-formatting primitive (spec #05 / ADR-0005). Every later screen
 * (#6–#9) reuses it, so the format + sign→color rules live here once:
 * - `cents < 0` → `${negativeLabel} ¥X.XX` in the danger token (default 欠货 = owes
 *   goods; the balance-domain passes 欠款 = owes money).
 * - `cents > 0` → `¥X.XX` in the success token.
 * - `0` → `¥0.00` in the neutral textSecondary token.
 *
 * Cents are integer 分; yuan via `formatCentsAsYuan` (shared with export). The
 * negative form shows the absolute amount (the debt magnitude) — the danger
 * color + prefix carry the sign.
 */
export function MoneyText({
  cents,
  negativeLabel = "欠货",
  fontSize,
  ...rest
}: { cents: Cents; negativeLabel?: string; fontSize?: number } & TextProps) {
  const theme = useTheme();
  if (cents < 0) {
    return (
      <Text style={[{ color: theme.danger, fontSize }]} {...rest}>
        {negativeLabel} ¥{formatCentsAsYuan(-cents)}
      </Text>
    );
  }
  if (cents > 0) {
    return (
      <Text style={[{ color: theme.text, fontSize }]} {...rest}>
        ¥{formatCentsAsYuan(cents)}
      </Text>
    );
  }
  return (
    <Text style={[{ color: theme.textSecondary, fontSize }]} {...rest}>
      ¥{formatCentsAsYuan(0)}
    </Text>
  );
}
