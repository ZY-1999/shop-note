import { useLocalSearchParams } from 'expo-router';

import { RecordForm } from '@/components/record-form';
import type { Direction } from '@/data/stock-record';

/**
 * The record-posting screen route (spec #06). A thin adapter: it reads the
 * `staff_id` + `direction` params pushed from a 记账 row's 入库/出库 button
 * (#5) and hands them to `<RecordForm>` as plain props. Keeping the param
 * reading here — and the form itself router-agnostic — is what lets the form be
 * rendered directly under the test providers (ADR-0006) with no router context.
 *
 * `direction` arrives as a string param; narrow to the `Direction` union (the
 * only two values the buttons ever push). `staff_id` is passed through; if it
 * were ever missing the form's own validation surfaces "请选择员工".
 */
export default function RecordFormRoute() {
  const { staff_id, direction } = useLocalSearchParams<{ staff_id: string; direction: string }>();
  const dir: Direction = direction === 'out' ? 'out' : 'in';
  return <RecordForm staffId={staff_id} direction={dir} />;
}
