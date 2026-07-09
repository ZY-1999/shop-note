import { describe, expect, it } from "@jest/globals";
import { fireEvent } from "@testing-library/react-native";
import { StaffListTracer } from "@/components/staff-list-tracer";
import { renderWithProviders } from "@/testing/render";

/**
 * Spec #03 (data-flow-foundation) — the vertical tracer.
 *
 * These tests prove the ENTIRE data-flow stack through the public interface a
 * real screen will use: <AppProviders> → useRepos() → a useQuery read hook →
 * the repo → render. No Repos are mocked (ADR-0006): the real InMemoryAdapter
 * backs every assertion, so the test proves exactly what a production screen runs.
 */
describe("StaffListTracer — vertical tracer (spec #03 AC1)", () => {
  it("renders a seeded staff name through the full stack (ReposProvider → useRepos → useStaff → render)", async () => {
    const { view } = await renderWithProviders(<StaffListTracer />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "138", notes: "" });
      },
    });

    // No manual refetch, no act() poking — the seeded name arrives via the
    // normal React Query → render cycle. findByText awaits it.
    expect(await view.findByText("张三")).toBeTruthy();
  });
});

describe("StaffListTracer — write→invalidate→refresh loop (spec #03 AC2)", () => {
  it("firing useCreateStaff re-renders the list with the new name, no manual refetch", async () => {
    const { view } = await renderWithProviders(<StaffListTracer />, {
      seed: async (repos) => {
        await repos.staff.create({ name: "张三", phone: "138", notes: "" });
      },
    });

    expect(await view.findByText("张三")).toBeTruthy();

    // Fire the canonical mutation. onSuccess invalidates qk.staff.* → React Query
    // refetches useStaff → the new name appears with no caller-side refetch.
    fireEvent.press(view.getByText("add-staff"));

    expect(await view.findByText("新员工")).toBeTruthy();
  });
});
