import { router } from "expo-router";

import { ManageTab } from "@/components/manage-tab";

/**
 * 管理 tab route (spec #09). A thin adapter over the router-agnostic
 * `<ManageTab>` — staff & product CRUD (search / create / edit / soft-delete /
 * restore), plus the dev-only smoke entry (#4) which lives inside the component
 * under `__DEV__`. #04 shipped this route as a placeholder; #09 fills it in.
 * manage-import: import navigation stays here (not inside ManageTab).
 */
export default function ManageTabRoute() {
  return (
    <ManageTab
      onImport={(kind) =>
        router.push({ pathname: "/import-form", params: { kind } })
      }
    />
  );
}
