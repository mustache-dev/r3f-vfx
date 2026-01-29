import type { Node } from 'three/webgpu'

// Helper to select color from array based on index (up to 8 colors)
export const selectColor = (
  idx: Node,
  c0: Node,
  c1: Node,
  c2: Node,
  c3: Node,
  c4: Node,
  c5: Node,
  c6: Node,
  c7: Node
): Node => {
  return idx
    .lessThan(1)
    .select(
      c0,
      idx
        .lessThan(2)
        .select(
          c1,
          idx
            .lessThan(3)
            .select(
              c2,
              idx
                .lessThan(4)
                .select(
                  c3,
                  idx
                    .lessThan(5)
                    .select(
                      c4,
                      idx.lessThan(6).select(c5, idx.lessThan(7).select(c6, c7))
                    )
                )
            )
        )
    )
}
