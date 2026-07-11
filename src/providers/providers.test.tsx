import { describe, expect, it, jest } from "@jest/globals";
import { focusManager } from "@tanstack/react-query";
import { Text } from "react-native";
import { useStaff } from "@/hooks/reads";
import { qk } from "@/hooks/query-keys";
import { InMemoryAdapter } from "@/data/in-memory";
import { setupRepos } from "@/data/composition";
import { renderWithProviders } from "@/testing/render";
import { createQueryClient } from "@/providers/providers";

/** A minimal consumer that surfaces useStaff()'s data as text — used by AC6 to
 *  observe whether a refetch happens. */
function StaffEcho() {
  const { data, isLoading } = useStaff();
  return <Text>{isLoading ? "loading" : (data ?? []).map((s) => s.name).join(",") || "empty"}</Text>;
}

describe("renderWithProviders — test isolation (spec #03 AC4)", () => {
  it("test A seeds a staff member and sees it", async () => {
    const { view } = await renderWithProviders(<StaffEcho />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "1", notes: "" });
      },
    });
    expect(await view.findByText("张三")).toBeTruthy();
  });

  it("test B gets a FRESH adapter + QueryClient — none of test A's data leaks in", async () => {
    // No seed: if isolation holds, this adapter is empty and shows "empty".
    // If the adapter/queryClient leaked from test A, "张三" would appear here.
    const { view } = await renderWithProviders(<StaffEcho />);
    expect(await view.findByText("empty")).toBeTruthy();
  });
});

describe("createQueryClient — local-only defaults (spec #03 AC6)", () => {
  it("disables refetch on focus + never evicts/stales; refetches on mount so re-entry is fresh", () => {
    const q = createQueryClient().getDefaultOptions().queries;
    expect(q).toMatchObject({
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    });
  });

  it("a focus event does NOT trigger a refetch (data changes only via our mutates)", async () => {
    const { view, repos } = await renderWithProviders(<StaffEcho />, {
      seed: async (r) => {
        await r.staff.create({ name: "张三", phone: "1", notes: "" });
      },
    });
    await view.findByText("张三"); // initial fetch settled

    const listSpy = jest.spyOn(repos.staff, "list");
    const fetchesBefore = listSpy.mock.calls.length;

    // Simulate the app returning to focus. With refetchOnWindowFocus:false the
    // query must NOT refetch — list() is called zero additional times.
    focusManager.setFocused(true);
    // Give any would-be refetch a chance to fire (it must not).
    await view.findByText("张三");

    expect(listSpy.mock.calls.length).toBe(fetchesBefore);
    focusManager.setFocused(false);
  });

  it("refetches on remount after an invalidation while inactive (no stale data on re-entry)", async () => {
    // Regression: a query invalidated while NO component observes it (e.g. posting
    // a record from the 记账 list while member-detail is unmounted) must still come
    // back fresh when its screen is re-entered. With staleTime:Infinity this only
    // refetches invalidated queries — fresh ones don't re-fetch on mount.
    const repos = setupRepos(new InMemoryAdapter());
    await repos.staff.create({ name: "张三", phone: "1", notes: "" });
    const queryClient = createQueryClient();

    // 1) mount → fetch + cache the staff list ("张三")
    const first = await renderWithProviders(<StaffEcho />, { repos, queryClient });
    expect(await first.view.findByText("张三")).toBeTruthy();
    first.view.unmount();

    // 2) while inactive: add a member + invalidate (mirrors useCreateStaff's onSuccess)
    await repos.staff.create({ name: "李四", phone: "2", notes: "" });
    await queryClient.invalidateQueries({ queryKey: qk.staff.all });

    // 3) re-mount → the query MUST refetch; the new member shows (no stale cache)
    const second = await renderWithProviders(<StaffEcho />, { repos, queryClient });
    expect(await second.view.findByText("张三,李四")).toBeTruthy();
  });
});
