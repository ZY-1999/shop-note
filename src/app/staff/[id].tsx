import { router, useLocalSearchParams } from "expo-router";

import { StaffDetail } from "@/components/staff-detail";

/**
 * The staff detail route (spec #07). A thin adapter: it reads the `id` param
 * pushed from a 记账 row tap (#5) and hands it to `<StaffDetail>` as a plain
 * prop, wiring the history-row tap to push the record detail route. Keeping the
 * param reading here — and StaffDetail router-agnostic — is what lets the
 * component be rendered directly under the test providers (ADR-0006) with no
 * router context.
 */
export default function StaffDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <StaffDetail
      staffId={id}
      onOpenRecord={(recordId) =>
        router.push({ pathname: "/record/[id]", params: { id: recordId } })
      }
      onOpenTopup={(topupId) =>
        router.push({ pathname: "/topup/[id]", params: { id: topupId } })
      }
    />
  );
}
