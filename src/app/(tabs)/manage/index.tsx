import { ManageTab } from '@/components/manage-tab';

/**
 * 管理 tab route (spec #09). A thin adapter over the router-agnostic
 * `<ManageTab>` — staff & product CRUD (search / create / edit / soft-delete /
 * restore), plus the dev-only smoke entry (#4) which lives inside the component
 * under `__DEV__`. #04 shipped this route as a placeholder; #09 fills it in.
 */
export default function ManageTabRoute() {
  return <ManageTab />;
}
