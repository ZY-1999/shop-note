import { useLocalSearchParams } from 'expo-router';

import { RecordDetail } from '@/components/record-detail';

/**
 * The record detail route (spec #07). A thin adapter: it reads the `id` param
 * (pushed from a staff detail history-row tap) and hands it to `<RecordDetail>`
 * as a plain prop. Edit + void live inside RecordDetail (edit reuses #06's form
 * preloaded with the record's lines); the route just resolves the id, so the
 * component is RNTL-testable with no router context (ADR-0006).
 */
export default function RecordDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordDetail recordId={id} />;
}
