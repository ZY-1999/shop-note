export type Point = { x: number; y: number };
export type Stroke = { points: Point[] };
export type Strokes = Stroke[];

export type StrokeAction =
  | { type: "addStroke"; stroke: Stroke }
  | { type: "undo" }
  | { type: "clear" };

export function strokeReducer(state: Strokes, action: StrokeAction): Strokes {
  switch (action.type) {
    case "addStroke":
      return [...state, action.stroke];
    case "undo":
      return state.slice(0, -1);
    case "clear":
      return [];
    default:
      return state;
  }
}

export function serializePath(strokes: Strokes): string {
  return strokes
    .map((s) => {
      const [first, ...rest] = s.points;
      return `M ${first.x},${first.y}` + rest.map((p) => ` L ${p.x},${p.y}`).join("");
    })
    .join(" ");
}
