import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect } from "react";

import { ImportForm, type ImportKind } from "@/components/import-form";

/**
 * Import screen route (manage-import #01). Thin adapter: reads `kind` and
 * hands it to `<ImportForm>`. Form stays router-agnostic for RNTL (ADR-0006).
 */
export default function ImportFormRoute() {
  const navigation = useNavigation();
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const resolved: ImportKind =
    kind === "product" || kind === "restock" || kind === "staff"
      ? kind
      : "staff";

  useEffect(() => {
    const title =
      resolved === "staff"
        ? "导入会员"
        : resolved === "product"
          ? "导入商品"
          : "导入补货";
    navigation.setOptions({ title });
  }, [navigation, resolved]);

  return <ImportForm kind={resolved} />;
}
