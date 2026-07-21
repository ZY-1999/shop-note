import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';

import { TopupForm } from '@/components/topup-form';

/**
 * The top-up screen route (topup-subpage spec #02). A thin adapter: it reads the
 * `staff_id` param pushed from a 记账 row's [充值] button and hands it to
 * `<TopupForm>` as a plain prop. Keeping the param reading here — and the form
 * itself router-agnostic — lets the form render directly under the test providers
 * (ADR-0006) with no router context.
 *
 * The Stack title is the fixed string 「充值」 (set via `useNavigation().setOptions`,
 * same posture as the 「会员详情」 fixed title — no dynamic title function needed).
 */
export default function TopupFormRoute() {
  const navigation = useNavigation();
  const { staff_id } = useLocalSearchParams<{ staff_id: string }>();
  useEffect(() => {
    navigation.setOptions({ title: '充值' });
  }, [navigation]);
  return <TopupForm staffId={staff_id} />;
}
