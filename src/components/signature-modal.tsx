/**
 * SignatureModal — full-screen controlled signature pad (spec #02).
 *
 * `react-native-svg` renders strokes via `<Path d={serializePath(strokes)} />`;
 * `react-native-gesture-handler` captures pan gestures → accumulates points →
 * dispatches `addStroke` on finger lift; `rasterize` (isolated module) wraps
 * `react-native-view-shot` to produce a PNG data URI; the component strips the
 * `data:image/png;base64,` prefix before calling `onConfirm`.
 *
 * Deep module: the three props (`visible` / `onConfirm` / `onCancel`) hide a
 * complete signature capability — gesture capture + stroke rendering +
 * rasterization + base64 normalization + empty-signature invariant.
 */
import { useReducer, useRef } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { Path, Svg } from "react-native-svg";

import {
  serializePath,
  strokeReducer,
  type Point,
} from "@/components/stroke-kernel";
import { rasterize } from "@/components/rasterize";
import { useTheme } from "@/hooks/use-theme";

export interface SignatureModalProps {
  visible: boolean;
  onConfirm(base64: string): void;
  onCancel(): void;
}

const BASE64_PREFIX_RE = /^data:image\/[^;]+;base64,/;

export function SignatureModal({
  visible,
  onConfirm,
  onCancel,
}: SignatureModalProps) {
  const theme = useTheme();
  const [strokes, dispatch] = useReducer(strokeReducer, []);
  const currentStroke = useRef<Point[]>([]);
  const canvasRef = useRef<View>(null);

  const pan = Gesture.Pan()
    .onBegin((e) => {
      currentStroke.current = [{ x: e.x, y: e.y }];
    })
    .onUpdate((e) => {
      currentStroke.current.push({ x: e.x, y: e.y });
    })
    .onEnd(() => {
      if (currentStroke.current.length > 0) {
        dispatch({
          type: "addStroke",
          stroke: { points: [...currentStroke.current] },
        });
        currentStroke.current = [];
      }
    });

  const handleConfirm = async () => {
    const raw = await rasterize(canvasRef);
    const base64 = raw.replace(BASE64_PREFIX_RE, "");
    onConfirm(base64);
  };

  return (
    <Modal visible={visible} transparent={false}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <GestureDetector gesture={pan}>
          <View
            ref={canvasRef}
            style={[styles.canvas, { borderColor: theme.border }]}
            testID="signature-canvas"
            collapsable={false}
          >
            <Svg style={styles.svg}>
              <Path
                d={serializePath(strokes)}
                stroke={theme.text}
                strokeWidth={2}
                fill="none"
              />
            </Svg>
          </View>
        </GestureDetector>
        <View style={styles.buttonBar}>
          <Pressable
            testID="undo-btn"
            style={styles.button}
            onPress={() => dispatch({ type: "undo" })}
          >
            <Text style={[styles.buttonText, { color: theme.text }]}>撤销</Text>
          </Pressable>
          <Pressable
            testID="clear-btn"
            style={styles.button}
            onPress={() => dispatch({ type: "clear" })}
          >
            <Text style={[styles.buttonText, { color: theme.text }]}>清除</Text>
          </Pressable>
          <Pressable
            testID="cancel-btn"
            style={styles.button}
            onPress={onCancel}
          >
            <Text style={[styles.buttonText, { color: theme.text }]}>取消</Text>
          </Pressable>
          <Pressable
            testID="confirm-btn"
            style={[
              styles.button,
              strokes.length === 0
                ? styles.buttonDisabled
                : { backgroundColor: theme.accent },
            ]}
            onPress={handleConfirm}
            disabled={strokes.length === 0}
            accessibilityState={{ disabled: strokes.length === 0 }}
          >
            <Text style={[styles.buttonText, { color: theme.text }]}>确认</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  canvas: {
    flex: 1,
    borderWidth: 1,
  },
  svg: {
    flex: 1,
  },
  buttonBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 16,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 16,
  },
});
