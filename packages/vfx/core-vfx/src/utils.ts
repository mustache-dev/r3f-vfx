// Convert hex color string to RGB array [0-1]
export const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
      ]
    : [1, 1, 1];
};

// Normalize a prop to [min, max] array - if single value, use same for both
export const toRange = (
  value: number | [number, number] | null | undefined,
  defaultVal: [number, number] = [0, 0]
): [number, number] => {
  if (value === undefined || value === null) return defaultVal;
  if (Array.isArray(value))
    return value.length === 2 ? value : [value[0], value[0]];
  return [value, value];
};

// Convert easing string to type number
export const easingToType = (easing: string | number | undefined): number => {
  if (typeof easing === 'number') return easing;
  switch (easing) {
    case 'easeIn':
      return 1;
    case 'easeOut':
      return 2;
    case 'easeInOut':
      return 3;
    default:
      return 0; // linear
  }
};

// Convert axis string to number: 0=+X, 1=+Y, 2=+Z, 3=-X, 4=-Y, 5=-Z
export const axisToNumber = (axis: string): number => {
  switch (axis) {
    case 'x':
    case '+x':
    case 'X':
    case '+X':
      return 0;
    case 'y':
    case '+y':
    case 'Y':
    case '+Y':
      return 1;
    case 'z':
    case '+z':
    case 'Z':
    case '+Z':
      return 2;
    case '-x':
    case '-X':
      return 3;
    case '-y':
    case '-Y':
      return 4;
    case '-z':
    case '-Z':
      return 5;
    default:
      return 2; // default to +Z
  }
};

// Normalize rotation prop to 3D format [[minX, maxX], [minY, maxY], [minZ, maxZ]]
// Supports:
// - Single number: rotation={0.5} → same rotation for all axes
// - [min, max]: rotation={[0, Math.PI]} → random in range for all axes
// - [[minX, maxX], [minY, maxY], [minZ, maxZ]]: full 3D control
export const toRotation3D = (
  value: number | [number, number] | [[number, number], [number, number], [number, number]] | null | undefined
): [[number, number], [number, number], [number, number]] => {
  if (value === undefined || value === null)
    return [
      [0, 0],
      [0, 0],
      [0, 0],
    ];
  if (typeof value === 'number')
    return [
      [value, value],
      [value, value],
      [value, value],
    ];
  if (Array.isArray(value)) {
    // Check if nested array [[x], [y], [z]]
    if (Array.isArray(value[0])) {
      const nested = value as [[number, number], [number, number], [number, number]];
      return [
        toRange(nested[0], [0, 0]),
        toRange(nested[1], [0, 0]),
        toRange(nested[2], [0, 0]),
      ];
    }
    // Simple [min, max] - apply to all axes
    const range = toRange(value as [number, number], [0, 0]);
    return [range, range, range];
  }
  return [
    [0, 0],
    [0, 0],
    [0, 0],
  ];
};

// Convert lifetime in seconds to fade rate per second (framerate independent)
export const lifetimeToFadeRate = (seconds: number): number => 1 / seconds;
