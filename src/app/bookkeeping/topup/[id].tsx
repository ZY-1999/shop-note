import { useLocalSearchParams } from "expo-router";

import { TopupDetail } from "@/components/topup-detail";

/**
 * The top-up detail route. Thin adapter: reads `id` and hands it to TopupDetail.
 */
export default function TopupDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TopupDetail topupId={id} />;
}
