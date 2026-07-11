/**
 * Rasterize seam — wraps `react-native-view-shot` `captureRef` so the component
 * can `jest.mock('./rasterize')` the whole module in RNTL tests (spec #02
 * Design: isolate native rasterization behind a mockable boundary).
 *
 * Returns the RAW data URI as-is (may include `data:image/png;base64,` prefix).
 * Base64 normalization (stripping the prefix) is the COMPONENT's responsibility,
 * not this module's — so that mocking rasterize still leaves the strip logic
 * exercised by tests (AC #7).
 */
import { captureRef } from "react-native-view-shot";
import type { RefObject } from "react";
import type { View } from "react-native";

export async function rasterize(
  target: RefObject<View | null>,
): Promise<string> {
  return captureRef(target, { format: "png", result: "data-uri" });
}
