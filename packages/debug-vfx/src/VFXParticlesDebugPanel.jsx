import { createRoot } from 'react-dom/client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { Appearance, Blending, EmitterShape, Lighting } from 'core-vfx'
import { buildCurveTextureBin } from 'core-vfx'
import { create } from 'zustand'
import { GeometryType, geometryDefaults } from './geometry'
import { generateVFXParticlesJSX, generateVueTemplate, generateVanillaCode } from './code-generation'
import { wrapped, styles } from './styles'

export {
  GeometryType,
  createGeometry,
  detectGeometryTypeAndArgs,
} from './geometry'

// Minimal Zustand store - holds flushChanges ref without causing re-renders
const useDebugPanelStore = create(() => ({
  flushChangesRef: { current: null },
}))

// Non-reactive accessors (no subscriptions, no re-renders)
const getFlushChanges = () =>
  useDebugPanelStore.getState().flushChangesRef.current
const setFlushChanges = (fn) => {
  useDebugPanelStore.getState().flushChangesRef.current = fn
}

// Default values for VFXParticles props (used by reset button)
export const DEFAULT_VALUES = Object.freeze({
  maxParticles: 10000,
  size: [0.1, 0.3],
  colorStart: ['#ffffff'],
  colorEnd: null,
  fadeSize: [1, 0],
  fadeSizeCurve: null,
  fadeOpacity: [1, 0],
  fadeOpacityCurve: null,
  velocityCurve: null,
  gravity: [0, 0, 0],
  lifetime: [1, 2],
  direction: [
    [-1, 1],
    [0, 1],
    [-1, 1],
  ],
  startPosition: [
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  speed: [0.1, 0.1],
  friction: { intensity: 0, easing: 'linear' },
  appearance: Appearance.GRADIENT,
  rotation: [
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  rotationSpeed: [
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  rotationSpeedCurve: null,
  geometryType: GeometryType.NONE,
  geometryArgs: null,
  orientToDirection: false,
  orientAxis: 'z',
  stretchBySpeed: null,
  lighting: Lighting.STANDARD,
  shadow: false,
  blending: Blending.NORMAL,
  intensity: 1,
  position: [0, 0, 0],
  autoStart: true,
  delay: 0,
  emitCount: 1,
  emitterShape: EmitterShape.BOX,
  emitterRadius: [0, 1],
  emitterAngle: Math.PI / 4,
  emitterHeight: [0, 1],
  emitterSurfaceOnly: false,
  emitterDirection: [0, 1, 0],
  turbulence: null,
  attractors: null,
  attractToCenter: false,
  startPositionAsDirection: false,
  softParticles: false,
  softDistance: 0.5,
  collision: null,
})

// Global state for the debug panel
let debugRoot = null
let debugContainer = null
let currentValues = null
let currentOnChange = null

// Helper to parse range values
const parseRange = (value, defaultVal = [0, 0]) => {
  if (value === undefined || value === null) return defaultVal
  if (Array.isArray(value))
    return value.length === 2 ? value : [value[0], value[0]]
  return [value, value]
}

// Helper to parse 3D rotation/direction values
const parse3D = (value) => {
  if (value === undefined || value === null)
    return [
      [0, 0],
      [0, 0],
      [0, 0],
    ]
  if (typeof value === 'number')
    return [
      [value, value],
      [value, value],
      [value, value],
    ]
  if (Array.isArray(value)) {
    if (Array.isArray(value[0])) {
      return [
        parseRange(value[0], [0, 0]),
        parseRange(value[1], [0, 0]),
        parseRange(value[2], [0, 0]),
      ]
    }
    const range = parseRange(value, [0, 0])
    return [range, range, range]
  }
  return [
    [0, 0],
    [0, 0],
    [0, 0],
  ]
}

// Section component - uses local state only for UI collapse
const Section = ({
  title,
  children,
  defaultOpen = true,
  optional = false,
  enabled,
  onToggleEnabled,
  hidden = false,
}) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [isHovered, setIsHovered] = useState(false)
  const contentRef = useRef(null)
  const [contentHeight, setContentHeight] = useState(defaultOpen ? 'auto' : 0)

  // Update height when opening/closing
  useEffect(() => {
    if (contentRef.current) {
      if (isOpen) {
        const height = contentRef.current.scrollHeight
        setContentHeight(height)
        // After animation, set to auto for dynamic content
        const timer = setTimeout(() => setContentHeight('auto'), 250)
        return () => clearTimeout(timer)
      } else {
        // First set explicit height, then animate to 0
        const height = contentRef.current.scrollHeight
        setContentHeight(height)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setContentHeight(0)
          })
        })
      }
    }
  }, [isOpen])

  const sectionStyle = {
    ...styles.section,
    ...(optional ? styles.optionalSection : {}),
    ...(isHovered
      ? {
          border: '1px solid transparent',
          background: `linear-gradient(rgba(25, 25, 30, 0.9), rgba(25, 25, 30, 0.9)) padding-box, linear-gradient(135deg, rgba(249, 115, 22, 0.6) 0%, rgba(251, 146, 60, 0.4) 50%, rgba(253, 186, 116, 0.3) 100%) border-box`,
        }
      : {}),
  }

  const contentWrapperStyle = {
    height: contentHeight === 'auto' ? 'auto' : `${contentHeight}px`,
    overflow: 'hidden',
    transition: 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  }

  // If hidden (filtered out by search), don't render
  if (hidden) return null

  return (
    <div
      style={sectionStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        style={{
          ...styles.sectionHeader,
          background: isHovered
            ? 'rgba(249, 115, 22, 0.06)'
            : 'rgba(255, 255, 255, 0.02)',
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ color: isHovered ? wrapped.textAccent : wrapped.text }}>
          {title}
        </span>
        <span
          style={{
            ...styles.arrow,
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          ▶
        </span>
      </div>
      <div style={contentWrapperStyle}>
        <div ref={contentRef} style={styles.sectionContent}>
          {optional && (
            <div style={styles.enableCheckbox}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => onToggleEnabled(e.target.checked)}
                  style={styles.checkbox}
                />
                Enable {title}
              </label>
            </div>
          )}
          {(!optional || enabled) && children}
        </div>
      </div>
    </div>
  )
}

// Scrubber hook for drag-to-change values like Photoshop
const useScrubber = (value, onChange, step = 0.01, min, max) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const isDraggingRef = useRef(false)
  const hasMoved = useRef(false)
  const startX = useRef(0)
  const startValue = useRef(0)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback(
    (e) => {
      // Only start scrubbing on left click
      if (e.button !== 0) return
      e.preventDefault()
      isDraggingRef.current = true
      hasMoved.current = false
      startX.current = e.clientX
      startValue.current = value
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'

      const handleMouseMove = (e) => {
        if (!isDraggingRef.current) return
        const delta = e.clientX - startX.current

        // Only start scrubbing after moving a few pixels (dead zone)
        if (!hasMoved.current && Math.abs(delta) < 3) return
        if (!hasMoved.current) {
          hasMoved.current = true
          setIsDragging(true)
        }

        // Sensitivity: 1px = step * 0.5, hold shift for fine control
        const sensitivity = e.shiftKey ? 0.1 : 0.5
        const change = delta * step * sensitivity
        let newValue = startValue.current + change

        // Clamp to min/max
        if (min !== undefined) newValue = Math.max(min, newValue)
        if (max !== undefined) newValue = Math.min(max, newValue)

        // Round to step precision
        const precision = step < 1 ? Math.ceil(-Math.log10(step)) : 0
        newValue = parseFloat(newValue.toFixed(precision))

        onChange(newValue)
      }

      const handleMouseUp = () => {
        const wasDragging = hasMoved.current
        isDraggingRef.current = false
        setIsDragging(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)

        // Flush pending changes when user lifts mouse after dragging
        if (wasDragging) {
          const flushChanges = getFlushChanges()
          flushChanges?.()
        }
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [value, onChange, step, min, max]
  )

  return { handleMouseDown, hasMoved, isDragging }
}

// Scrubber input component for individual number fields
const ScrubInput = ({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  style,
  placeholder,
}) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const inputRef = useRef(null)
  const [localValue, setLocalValue] = useState(String(value))
  const [isFocused, setIsFocused] = useState(false)
  const { handleMouseDown, hasMoved, isDragging } = useScrubber(
    value,
    onChange,
    step,
    min,
    max
  )

  // Sync local value with prop when not focused (e.g., from scrubbing)
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(value))
    }
  }, [value, isFocused])

  const onMouseDown = useCallback(
    (e) => {
      // If already focused, let normal input behavior happen (selecting text, etc.)
      if (document.activeElement === inputRef.current) return

      handleMouseDown(e)

      // On mouseup, if we didn't drag, focus the input for typing
      const onMouseUp = () => {
        if (!hasMoved.current && inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mouseup', onMouseUp)
    },
    [handleMouseDown, hasMoved]
  )

  const inputStyle = {
    ...style,
    cursor: 'ew-resize',
    ...(isDragging
      ? {
          background: `rgba(249, 115, 22, 0.15)`,
          borderColor: wrapped.accent,
          boxShadow: `0 0 0 2px ${wrapped.accentGlow}, 0 0 12px rgba(249, 115, 22, 0.3)`,
          color: wrapped.accentLight,
        }
      : {}),
  }

  // Handle both comma and dot as decimal separators
  const handleChange = useCallback(
    (e) => {
      const val = e.target.value.replace(',', '.')
      setLocalValue(val)
      const parsed = parseFloat(val)
      if (!isNaN(parsed)) {
        onChange(parsed)
      }
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e) => {
      // Convert comma to dot for decimal input
      if (e.key === ',') {
        e.preventDefault()
        const input = e.target
        const start = input.selectionStart
        const end = input.selectionEnd
        const currentValue = input.value
        const newValue =
          currentValue.slice(0, start) + '.' + currentValue.slice(end)
        setLocalValue(newValue)
        // Need to set cursor position after React re-renders
        setTimeout(() => {
          input.setSelectionRange(start + 1, start + 1)
        }, 0)
        const parsed = parseFloat(newValue)
        if (!isNaN(parsed)) {
          onChange(parsed)
        }
      }
    },
    [onChange]
  )

  const handleFocus = useCallback(() => {
    setIsFocused(true)
  }, [])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    // On blur, sync back to the actual value
    setLocalValue(String(value))
  }, [value])

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onMouseDown={onMouseDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={inputStyle}
      placeholder={placeholder}
      title="Drag to scrub, click to type"
    />
  )
}

// Input components - all call onChange immediately
const NumberInput = ({ label, value, onChange, min, max, step = 0.01 }) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const { handleMouseDown } = useScrubber(value, onChange, step, min, max)

  return (
    <div style={styles.row}>
      <label
        style={{ ...styles.label, cursor: 'ew-resize' }}
        onMouseDown={handleMouseDown}
        title="Drag to scrub value"
      >
        {label}
      </label>
      <ScrubInput
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        style={styles.input}
      />
    </div>
  )
}

const RangeInput = ({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
  step = 0.01,
}) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const [minVal, maxVal] = parseRange(value, [0, 0])
  const [linked, setLinked] = useState(false)

  // When linked, changing one value changes both
  const handleMinChange = useCallback(
    (v) => {
      if (linked) {
        onChange([v, v])
      } else {
        onChange([v, maxVal])
      }
    },
    [linked, maxVal, onChange]
  )

  const handleMaxChange = useCallback(
    (v) => {
      if (linked) {
        onChange([v, v])
      } else {
        onChange([minVal, v])
      }
    },
    [linked, minVal, onChange]
  )

  const { handleMouseDown } = useScrubber(
    minVal,
    handleMinChange,
    step,
    min,
    max
  )

  return (
    <div style={styles.row}>
      <label
        style={{ ...styles.label, cursor: 'ew-resize' }}
        onMouseDown={handleMouseDown}
        title="Drag to scrub min value"
      >
        {label}
      </label>
      <div style={styles.rangeRow}>
        <span
          style={{
            fontSize: '9px',
            color: 'rgba(255,255,255,0.4)',
            marginRight: '4px',
          }}
        >
          min
        </span>
        <ScrubInput
          value={minVal}
          onChange={handleMinChange}
          min={min}
          max={max}
          step={step}
          style={styles.rangeInput}
          placeholder="min"
        />
        <button
          onClick={() => {
            if (!linked) {
              // When linking, set both to average or min value
              const avg = (minVal + maxVal) / 2
              onChange([avg, avg])
            }
            setLinked(!linked)
          }}
          style={{
            background: linked ? 'rgba(249, 115, 22, 0.2)' : 'transparent',
            border: `1px solid ${linked ? 'rgba(249, 115, 22, 0.5)' : 'rgba(255, 255, 255, 0.15)'}`,
            color: linked
              ? 'rgba(249, 115, 22, 0.9)'
              : 'rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            fontSize: '11px',
            padding: '2px 4px',
            borderRadius: '3px',
            transition: 'all 0.15s',
            margin: '0 2px',
            lineHeight: 1,
          }}
          title={
            linked
              ? 'Unlink min/max (values change together)'
              : 'Link min/max (values change together)'
          }
        >
          {linked ? '🔗' : '⛓️‍💥'}
        </button>
        <ScrubInput
          value={maxVal}
          onChange={handleMaxChange}
          min={min}
          max={max}
          step={step}
          style={styles.rangeInput}
          placeholder="max"
        />
        <span
          style={{
            fontSize: '9px',
            color: 'rgba(255,255,255,0.4)',
            marginLeft: '4px',
          }}
        >
          max
        </span>
      </div>
    </div>
  )
}

const Vec3Input = ({ label, value, onChange }) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const [x, y, z] = value || [0, 0, 0]
  const { handleMouseDown } = useScrubber(x, (v) => onChange([v, y, z]), 0.1)

  return (
    <div style={styles.row}>
      <label
        style={{ ...styles.label, cursor: 'ew-resize' }}
        onMouseDown={handleMouseDown}
        title="Drag to scrub X value"
      >
        {label}
      </label>
      <div style={styles.vec3Row}>
        <div>
          <ScrubInput
            value={x}
            onChange={(v) => onChange([v, y, z])}
            step={0.1}
            style={styles.vec3Input}
          />
          <div style={styles.vec3Label}>X</div>
        </div>
        <div>
          <ScrubInput
            value={y}
            onChange={(v) => onChange([x, v, z])}
            step={0.1}
            style={styles.vec3Input}
          />
          <div style={styles.vec3Label}>Y</div>
        </div>
        <div>
          <ScrubInput
            value={z}
            onChange={(v) => onChange([x, y, v])}
            step={0.1}
            style={styles.vec3Input}
          />
          <div style={styles.vec3Label}>Z</div>
        </div>
      </div>
    </div>
  )
}

const Range3DInput = ({ label, value, onChange }) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const parsed = parse3D(value)
  const update = (axis, idx, val) => {
    const newVal = parsed.map((r, i) =>
      i === axis ? [idx === 0 ? val : r[0], idx === 1 ? val : r[1]] : [...r]
    )
    onChange(newVal)
  }
  const { handleMouseDown } = useScrubber(
    parsed[0][0],
    (v) => update(0, 0, v),
    0.1
  )

  return (
    <div style={styles.row}>
      <label
        style={{ ...styles.label, cursor: 'ew-resize' }}
        onMouseDown={handleMouseDown}
        title="Drag to scrub X min"
      >
        {label}
      </label>
      {['X', 'Y', 'Z'].map((axis, i) => (
        <div key={axis} style={{ ...styles.rangeRow, marginBottom: '4px' }}>
          <span
            style={{
              width: '16px',
              color: '#6b7280',
              fontSize: '10px',
              cursor: 'ew-resize',
            }}
            title={`Drag to scrub ${axis} min`}
          >
            {axis}
          </span>
          <ScrubInput
            value={parsed[i][0]}
            onChange={(v) => update(i, 0, v)}
            step={0.1}
            style={{ ...styles.rangeInput, flex: 1 }}
          />
          <span style={styles.rangeSeparator}>→</span>
          <ScrubInput
            value={parsed[i][1]}
            onChange={(v) => update(i, 1, v)}
            step={0.1}
            style={{ ...styles.rangeInput, flex: 1 }}
          />
        </div>
      ))}
    </div>
  )
}

const SelectInput = ({ label, value, onChange, options }) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  return (
    <div style={styles.row}>
      <label style={styles.label}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.select}
      >
        {Object.entries(options).map(([key, val]) => (
          <option key={key} value={val}>
            {key}
          </option>
        ))}
      </select>
    </div>
  )
}

const CheckboxInput = ({ label, value, onChange }) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  return (
    <div style={styles.row}>
      <label style={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          style={styles.checkbox}
        />
        {label}
      </label>
    </div>
  )
}

// Custom Color Picker matching the UI theme
const CustomColorPicker = ({ color, onChange }) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const [isOpen, setIsOpen] = useState(false)
  const [hexInput, setHexInput] = useState(color)
  const pickerRef = useRef(null)
  const gradientRef = useRef(null)
  const isDraggingGradient = useRef(false)
  const isDraggingHue = useRef(false)

  // Preset colors
  const presets = [
    '#ffffff',
    '#f97316',
    '#fb923c',
    '#fbbf24',
    '#facc15',
    '#a3e635',
    '#22c55e',
    '#14b8a6',
    '#06b6d4',
    '#0ea5e9',
    '#3b82f6',
    '#6366f1',
    '#8b5cf6',
    '#a855f7',
    '#d946ef',
    '#ec4899',
    '#f43f5e',
    '#ef4444',
    '#000000',
    '#888888',
  ]

  // Convert hex to HSV
  const hexToHsv = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b)
    const d = max - min
    let h = 0
    const s = max === 0 ? 0 : d / max
    const v = max
    if (max !== min) {
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0)
          break
        case g:
          h = (b - r) / d + 2
          break
        case b:
          h = (r - g) / d + 4
          break
      }
      h /= 6
    }
    return { h: h * 360, s: s * 100, v: v * 100 }
  }

  // Convert HSV to hex
  const hsvToHex = (h, s, v) => {
    s /= 100
    v /= 100
    const i = Math.floor(h / 60) % 6
    const f = h / 60 - Math.floor(h / 60)
    const p = v * (1 - s)
    const q = v * (1 - f * s)
    const t = v * (1 - (1 - f) * s)
    let r, g, b
    switch (i) {
      case 0:
        r = v
        g = t
        b = p
        break
      case 1:
        r = q
        g = v
        b = p
        break
      case 2:
        r = p
        g = v
        b = t
        break
      case 3:
        r = p
        g = q
        b = v
        break
      case 4:
        r = t
        g = p
        b = v
        break
      case 5:
        r = v
        g = p
        b = q
        break
    }
    const toHex = (x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  const [hsv, setHsv] = useState(() => hexToHsv(color))

  // Sync when color prop changes
  useEffect(() => {
    if (!isOpen) {
      setHsv(hexToHsv(color))
      setHexInput(color)
    }
  }, [color, isOpen])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        const newColor = hsvToHex(hsv.h, hsv.s, hsv.v)
        onChange(newColor)
        setIsOpen(false)
      }
    }
    setTimeout(
      () => document.addEventListener('mousedown', handleClickOutside),
      0
    )
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, hsv, onChange])

  // Handle gradient area interaction
  const updateFromGradient = useCallback(
    (e) => {
      if (!gradientRef.current) return
      const rect = gradientRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
      const newHsv = { ...hsv, s: x * 100, v: (1 - y) * 100 }
      setHsv(newHsv)
      setHexInput(hsvToHex(newHsv.h, newHsv.s, newHsv.v))
    },
    [hsv]
  )

  const handleGradientMouseDown = useCallback(
    (e) => {
      e.preventDefault()
      isDraggingGradient.current = true
      updateFromGradient(e)

      const handleMove = (e) => {
        if (isDraggingGradient.current) updateFromGradient(e)
      }
      const handleUp = () => {
        isDraggingGradient.current = false
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }
      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [updateFromGradient]
  )

  const handleHueChange = useCallback(
    (e) => {
      const newH = parseFloat(e.target.value)
      const newHsv = { ...hsv, h: newH }
      setHsv(newHsv)
      setHexInput(hsvToHex(newHsv.h, newHsv.s, newHsv.v))
    },
    [hsv]
  )

  const handleHexChange = useCallback((e) => {
    const val = e.target.value
    setHexInput(val)
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      setHsv(hexToHsv(val))
    }
  }, [])

  const handlePreset = useCallback(
    (preset) => {
      setHsv(hexToHsv(preset))
      setHexInput(preset)
      onChange(preset)
      setIsOpen(false)
    },
    [onChange]
  )

  const currentColor = hsvToHex(hsv.h, hsv.s, hsv.v)
  const hueColor = hsvToHex(hsv.h, 100, 100)

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      ref={pickerRef}
    >
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '28px',
          height: '22px',
          borderRadius: '4px',
          background: color,
          border: `1px solid ${wrapped.border}`,
          cursor: 'pointer',
          boxShadow: `0 0 8px ${color}50, inset 0 0 0 1px rgba(255,255,255,0.1)`,
          transition: 'all 0.15s ease',
        }}
        title={color}
      />
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(12, 12, 14, 0.98)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${wrapped.borderLit}`,
            borderRadius: '12px',
            padding: '16px',
            zIndex: 10000,
            boxShadow: `0 25px 50px rgba(0, 0, 0, 0.6), 0 0 0 1px ${wrapped.accentGlow}20`,
            width: '240px',
          }}
        >
          {/* Saturation/Value gradient */}
          <div
            ref={gradientRef}
            onMouseDown={handleGradientMouseDown}
            style={{
              width: '100%',
              height: '150px',
              borderRadius: '6px',
              position: 'relative',
              cursor: 'crosshair',
              marginBottom: '12px',
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
              border: `1px solid ${wrapped.border}`,
            }}
          >
            {/* Marker */}
            <div
              style={{
                position: 'absolute',
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                border: '2px solid white',
                boxShadow:
                  '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.4)',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                background: currentColor,
              }}
            />
          </div>

          {/* Hue slider */}
          <div style={{ marginBottom: '12px' }}>
            <input
              type="range"
              min="0"
              max="360"
              value={hsv.h}
              onChange={handleHueChange}
              style={{
                width: '100%',
                height: '14px',
                borderRadius: '7px',
                background:
                  'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                cursor: 'pointer',
                WebkitAppearance: 'none',
              }}
            />
          </div>

          {/* Hex input and preview */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '12px',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '6px',
                background: currentColor,
                border: `1px solid ${wrapped.border}`,
                boxShadow: `0 0 12px ${currentColor}60`,
                flexShrink: 0,
              }}
            />
            <input
              type="text"
              value={hexInput}
              onChange={handleHexChange}
              onBlur={() => {
                if (/^#[0-9A-Fa-f]{6}$/.test(hexInput)) {
                  onChange(hexInput)
                }
              }}
              maxLength={7}
              style={{
                flex: 1,
                padding: '8px 10px',
                background: wrapped.bgInput,
                border: `1px solid ${wrapped.border}`,
                borderRadius: '6px',
                color: wrapped.text,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
                textAlign: 'center',
                textTransform: 'uppercase',
              }}
            />
          </div>

          {/* Presets */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(10, 1fr)',
              gap: '4px',
            }}
          >
            {presets.map((preset) => (
              <div
                key={preset}
                onClick={() => handlePreset(preset)}
                style={{
                  aspectRatio: '1',
                  borderRadius: '3px',
                  background: preset,
                  cursor: 'pointer',
                  border: `1px solid ${wrapped.border}`,
                  transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'scale(1.15)'
                  e.target.style.boxShadow = `0 0 8px ${preset}80`
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'scale(1)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            ))}
          </div>

          {/* Close button */}
          <button
            onClick={() => {
              onChange(currentColor)
              setIsOpen(false)
            }}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '8px',
              background: `linear-gradient(135deg, ${wrapped.accentSoft} 0%, ${wrapped.accent}40 100%)`,
              border: `1px solid ${wrapped.borderLit}`,
              borderRadius: '6px',
              color: wrapped.accent,
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              textTransform: 'lowercase',
            }}
          >
            done
          </button>
        </div>
      )}
    </div>
  )
}

const ColorArrayInput = ({ label, value, onChange }) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const colors = value || ['#ffffff']
  const updateColor = (index, color) => {
    const newColors = [...colors]
    newColors[index] = color
    onChange(newColors)
  }
  const addColor = () => {
    if (colors.length < 8) {
      onChange([...colors, '#ffffff'])
    }
  }
  const removeColor = (index) => {
    if (colors.length > 1) {
      onChange(colors.filter((_, i) => i !== index))
    }
  }
  return (
    <div style={styles.row}>
      <label style={styles.label}>{label}</label>
      <div style={styles.colorRow}>
        {colors.map((color, i) => (
          <div key={i} style={styles.colorWrapper}>
            <CustomColorPicker
              color={color}
              onChange={(c) => updateColor(i, c)}
            />
            {colors.length > 1 && (
              <button
                onClick={() => removeColor(i)}
                style={styles.removeColorBtn}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {colors.length < 8 && (
          <button onClick={addColor} style={styles.addColorBtn}>
            +
          </button>
        )}
      </div>
    </div>
  )
}

// Easing Curve Editor Component - bezier curve with handles
const EasingCurveEditor = ({ value, onChange, label = 'Easing Curve' }) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  // value = { points: [{ pos: [x, y], handleIn: [dx, dy], handleOut: [dx, dy] }, ...] }
  // Start point (0, 0) has handleOut only, end point (1, 1) has handleIn only
  // Default curve: 1→0 (fade out behavior - start full, end at zero)
  const defaultValue = {
    points: [
      { pos: [0, 1], handleOut: [0.3, 0] },
      { pos: [1, 0], handleIn: [-0.3, 0] },
    ],
  }

  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  // dragging: null, or { type: 'point' | 'handleIn' | 'handleOut', index: number }
  const draggingRef = useRef(null)
  const localDataRef = useRef(value?.points || defaultValue.points)
  const [, forceUpdate] = useState(0)
  const [hoverItem, setHoverItem] = useState(null) // { type, index }
  const [selectedPoint, setSelectedPoint] = useState(null) // index of selected point
  const [isScaling, setIsScaling] = useState(false)
  const scaleStartRef = useRef(null) // { mouseX, handleIn, handleOut }
  const [isRotating, setIsRotating] = useState(false)
  const rotateStartRef = useRef(null) // { mouseX, handleIn, handleOut }

  // Logical size (CSS pixels)
  const SIZE = 260
  const PADDING = 30
  const GRAPH_SIZE = SIZE - 2 * PADDING

  // Sync with prop
  useEffect(() => {
    if (value?.points) {
      localDataRef.current = value.points
      forceUpdate((n) => n + 1)
    }
  }, [value])

  const points = localDataRef.current

  // Convert curve coords (0-1) to canvas coords
  const toCanvas = useCallback(
    (x, y) => ({
      x: PADDING + x * GRAPH_SIZE,
      y: SIZE - PADDING - y * GRAPH_SIZE,
    }),
    [GRAPH_SIZE]
  )

  // Convert canvas coords to curve coords (0-1)
  const fromCanvas = useCallback(
    (cx, cy) => ({
      x: (cx - PADDING) / GRAPH_SIZE,
      y: (SIZE - PADDING - cy) / GRAPH_SIZE,
    }),
    [GRAPH_SIZE]
  )

  // Clamp value to 0-1
  const clampY = (y) => Math.max(0, Math.min(1, y))

  // Draw the curve with HiDPI support
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')

    // Set canvas buffer size for sharp rendering
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    ctx.scale(dpr, dpr)

    // Clear
    ctx.clearRect(0, 0, SIZE, SIZE)

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, SIZE, SIZE)
    bgGrad.addColorStop(0, 'rgba(18, 18, 22, 0.98)')
    bgGrad.addColorStop(1, 'rgba(8, 8, 10, 0.98)')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Grid lines
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.08)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const pos = PADDING + (i / 4) * GRAPH_SIZE
      ctx.beginPath()
      ctx.moveTo(pos, PADDING)
      ctx.lineTo(pos, SIZE - PADDING)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(PADDING, pos)
      ctx.lineTo(SIZE - PADDING, pos)
      ctx.stroke()
    }

    // Outer box
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.25)'
    ctx.lineWidth = 1
    ctx.strokeRect(PADDING, PADDING, GRAPH_SIZE, GRAPH_SIZE)

    // Diagonal reference line (linear)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
    ctx.setLineDash([6, 6])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PADDING, SIZE - PADDING)
    ctx.lineTo(SIZE - PADDING, PADDING)
    ctx.stroke()
    ctx.setLineDash([])

    const pts = localDataRef.current

    // Draw bezier curves between consecutive points
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i]
      const p1 = pts[i + 1]

      // Control points for this segment
      const cp0 = toCanvas(p0.pos[0], p0.pos[1])
      const cp1 = toCanvas(
        p0.pos[0] + (p0.handleOut?.[0] || 0),
        p0.pos[1] + (p0.handleOut?.[1] || 0)
      )
      const cp2 = toCanvas(
        p1.pos[0] + (p1.handleIn?.[0] || 0),
        p1.pos[1] + (p1.handleIn?.[1] || 0)
      )
      const cp3 = toCanvas(p1.pos[0], p1.pos[1])

      // Glow
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.25)'
      ctx.lineWidth = 8
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cp0.x, cp0.y)
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, cp3.x, cp3.y)
      ctx.stroke()

      // Main curve
      ctx.strokeStyle = wrapped.accent
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(cp0.x, cp0.y)
      ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, cp3.x, cp3.y)
      ctx.stroke()
    }

    // Draw handles and points
    pts.forEach((pt, idx) => {
      const pos = toCanvas(pt.pos[0], pt.pos[1])
      const isFirst = idx === 0
      const isLast = idx === pts.length - 1
      const isDraggingPoint =
        draggingRef.current?.type === 'point' &&
        draggingRef.current?.index === idx
      const isHoveringPoint =
        hoverItem?.type === 'point' && hoverItem?.index === idx
      const isSelected = selectedPoint === idx

      // Draw handleOut (for all except last)
      if (!isLast && pt.handleOut) {
        const handlePos = toCanvas(
          pt.pos[0] + pt.handleOut[0],
          pt.pos[1] + pt.handleOut[1]
        )
        const isDraggingHandle =
          draggingRef.current?.type === 'handleOut' &&
          draggingRef.current?.index === idx
        const isHoveringHandle =
          hoverItem?.type === 'handleOut' && hoverItem?.index === idx

        // Handle line - highlight if selected (purple if rotating, cyan if scaling/selected)
        const handleLineColor = isSelected
          ? isRotating
            ? 'rgba(200, 100, 255, 0.7)'
            : 'rgba(100, 200, 255, 0.7)'
          : 'rgba(249, 115, 22, 0.5)'
        ctx.strokeStyle = handleLineColor
        ctx.lineWidth = isSelected ? 2 : 1.5
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        ctx.lineTo(handlePos.x, handlePos.y)
        ctx.stroke()

        // Handle point - purple if rotating, cyan if scaling/selected
        const handlePointColor = isSelected
          ? isRotating
            ? '#c864ff'
            : '#64c8ff'
          : isHoveringHandle
            ? wrapped.accentLight
            : 'rgba(249, 115, 22, 0.8)'
        ctx.fillStyle = isDraggingHandle ? '#fff' : handlePointColor
        ctx.beginPath()
        ctx.arc(
          handlePos.x,
          handlePos.y,
          isDraggingHandle ? 7 : isSelected ? 6 : 5,
          0,
          Math.PI * 2
        )
        ctx.fill()
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Draw handleIn (for all except first)
      if (!isFirst && pt.handleIn) {
        const handlePos = toCanvas(
          pt.pos[0] + pt.handleIn[0],
          pt.pos[1] + pt.handleIn[1]
        )
        const isDraggingHandle =
          draggingRef.current?.type === 'handleIn' &&
          draggingRef.current?.index === idx
        const isHoveringHandle =
          hoverItem?.type === 'handleIn' && hoverItem?.index === idx

        // Handle line - highlight if selected (purple if rotating, cyan if scaling/selected)
        const handleLineColorIn = isSelected
          ? isRotating
            ? 'rgba(200, 100, 255, 0.7)'
            : 'rgba(100, 200, 255, 0.7)'
          : 'rgba(249, 115, 22, 0.5)'
        ctx.strokeStyle = handleLineColorIn
        ctx.lineWidth = isSelected ? 2 : 1.5
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        ctx.lineTo(handlePos.x, handlePos.y)
        ctx.stroke()

        // Handle point - purple if rotating, cyan if scaling/selected
        const handlePointColorIn = isSelected
          ? isRotating
            ? '#c864ff'
            : '#64c8ff'
          : isHoveringHandle
            ? wrapped.accentLight
            : 'rgba(249, 115, 22, 0.8)'
        ctx.fillStyle = isDraggingHandle ? '#fff' : handlePointColorIn
        ctx.beginPath()
        ctx.arc(
          handlePos.x,
          handlePos.y,
          isDraggingHandle ? 7 : isSelected ? 6 : 5,
          0,
          Math.PI * 2
        )
        ctx.fill()
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Main point - purple if rotating, cyan if scaling/selected
      const pointColor = isSelected
        ? isRotating
          ? '#c864ff'
          : '#64c8ff'
        : isHoveringPoint
          ? wrapped.accentLight
          : wrapped.accent
      ctx.fillStyle = isDraggingPoint ? '#fff' : pointColor
      ctx.shadowColor = isSelected
        ? isRotating
          ? '#c864ff'
          : '#64c8ff'
        : wrapped.accent
      ctx.shadowBlur = isDraggingPoint ? 15 : isSelected ? 12 : 8
      ctx.beginPath()
      ctx.arc(
        pos.x,
        pos.y,
        isDraggingPoint ? 10 : isSelected ? 9 : 8,
        0,
        Math.PI * 2
      )
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.strokeStyle = isSelected ? '#fff' : 'white'
      ctx.lineWidth = isSelected ? 3 : 2
      ctx.stroke()
    })

    // Labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.font = "11px 'JetBrains Mono', monospace"
    ctx.textAlign = 'center'
    ctx.fillText('0', PADDING, SIZE - PADDING + 18)
    ctx.fillText('1', SIZE - PADDING, SIZE - PADDING + 18)
    ctx.textAlign = 'right'
    ctx.fillText('0', PADDING - 8, SIZE - PADDING + 4)
    ctx.fillText('1', PADDING - 8, PADDING + 4)

    // Axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.font = "9px 'JetBrains Mono', monospace"
    ctx.textAlign = 'center'
    ctx.fillText('time →', SIZE / 2, SIZE - 6)

    ctx.save()
    ctx.translate(10, SIZE / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('value →', 0, 0)
    ctx.restore()
  }, [toCanvas, hoverItem, GRAPH_SIZE, selectedPoint, isScaling, isRotating])

  // Draw on mount and updates
  useEffect(() => {
    draw()
  }, [draw])

  // Find what's at a position
  const hitTest = useCallback(
    (mx, my) => {
      const pts = localDataRef.current

      // Check points first (priority over handles)
      for (let i = 0; i < pts.length; i++) {
        const pos = toCanvas(pts[i].pos[0], pts[i].pos[1])
        if (Math.hypot(mx - pos.x, my - pos.y) < 15) {
          return { type: 'point', index: i }
        }
      }

      // Then check handles
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i]

        // HandleOut
        if (pt.handleOut && i < pts.length - 1) {
          const handlePos = toCanvas(
            pt.pos[0] + pt.handleOut[0],
            pt.pos[1] + pt.handleOut[1]
          )
          if (Math.hypot(mx - handlePos.x, my - handlePos.y) < 12) {
            return { type: 'handleOut', index: i }
          }
        }

        // HandleIn
        if (pt.handleIn && i > 0) {
          const handlePos = toCanvas(
            pt.pos[0] + pt.handleIn[0],
            pt.pos[1] + pt.handleIn[1]
          )
          if (Math.hypot(mx - handlePos.x, my - handlePos.y) < 12) {
            return { type: 'handleIn', index: i }
          }
        }
      }

      return null
    },
    [toCanvas]
  )

  // Document-level mouse handlers for reliable dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // Handle scaling mode
      if (isScaling && selectedPoint !== null && scaleStartRef.current) {
        const deltaX = e.clientX - scaleStartRef.current.mouseX
        const scaleFactor = 1 + deltaX * 0.01 // 100px = 2x scale
        const clampedScale = Math.max(0.1, Math.min(3, scaleFactor))

        const pts = localDataRef.current.map((p) => ({ ...p }))
        const pt = pts[selectedPoint]

        // Scale handleIn
        if (pt.handleIn && scaleStartRef.current.handleIn) {
          const origLen = scaleStartRef.current.handleInLen
          const origAngle = scaleStartRef.current.handleInAngle
          const newLen = origLen * clampedScale
          pt.handleIn = [
            Math.cos(origAngle) * newLen,
            Math.sin(origAngle) * newLen,
          ]
        }

        // Scale handleOut
        if (pt.handleOut && scaleStartRef.current.handleOut) {
          const origLen = scaleStartRef.current.handleOutLen
          const origAngle = scaleStartRef.current.handleOutAngle
          const newLen = origLen * clampedScale
          pt.handleOut = [
            Math.cos(origAngle) * newLen,
            Math.sin(origAngle) * newLen,
          ]
        }

        pts[selectedPoint] = pt
        localDataRef.current = pts
        draw()
        return
      }

      // Handle rotating mode
      if (isRotating && selectedPoint !== null && rotateStartRef.current) {
        const deltaX = e.clientX - rotateStartRef.current.mouseX
        const rotationAngle = deltaX * 0.02 // 50px = 1 radian

        const pts = localDataRef.current.map((p) => ({ ...p }))
        const pt = pts[selectedPoint]

        // Rotate handleIn
        if (pt.handleIn && rotateStartRef.current.handleIn) {
          const origAngle = rotateStartRef.current.handleInAngle
          const origLen = rotateStartRef.current.handleInLen
          const newAngle = origAngle + rotationAngle
          pt.handleIn = [
            Math.cos(newAngle) * origLen,
            Math.sin(newAngle) * origLen,
          ]
        }

        // Rotate handleOut
        if (pt.handleOut && rotateStartRef.current.handleOut) {
          const origAngle = rotateStartRef.current.handleOutAngle
          const origLen = rotateStartRef.current.handleOutLen
          const newAngle = origAngle + rotationAngle
          pt.handleOut = [
            Math.cos(newAngle) * origLen,
            Math.sin(newAngle) * origLen,
          ]
        }

        pts[selectedPoint] = pt
        localDataRef.current = pts
        draw()
        return
      }

      if (draggingRef.current !== null) {
        const { x, y } = fromCanvas(mx, my)
        const pts = localDataRef.current.map((p) => ({ ...p }))
        const { type, index } = draggingRef.current

        if (type === 'point') {
          const isFirst = index === 0
          const isLast = index === pts.length - 1

          if (isFirst) {
            pts[index] = { ...pts[index], pos: [0, clampY(y)] }
          } else if (isLast) {
            pts[index] = { ...pts[index], pos: [1, clampY(y)] }
          } else {
            // Keep x sorted between neighbors
            const minX = pts[index - 1].pos[0] + 0.02
            const maxX = pts[index + 1].pos[0] - 0.02
            pts[index] = {
              ...pts[index],
              pos: [Math.max(minX, Math.min(maxX, x)), clampY(y)],
            }
          }
        } else if (type === 'handleOut') {
          const pt = pts[index]
          const dx = x - pt.pos[0]
          const dy = y - pt.pos[1]
          pts[index] = { ...pt, handleOut: [dx, dy] }
        } else if (type === 'handleIn') {
          const pt = pts[index]
          const dx = x - pt.pos[0]
          const dy = y - pt.pos[1]
          pts[index] = { ...pt, handleIn: [dx, dy] }
        }

        localDataRef.current = pts
        draw()
      } else if (mx >= 0 && mx <= SIZE && my >= 0 && my <= SIZE) {
        const hit = hitTest(mx, my)
        if (JSON.stringify(hit) !== JSON.stringify(hoverItem)) {
          setHoverItem(hit)
        }
      }
    }

    const handleMouseUp = () => {
      if (isScaling) {
        // Confirm scale
        onChange?.({ points: localDataRef.current })
        setIsScaling(false)
        scaleStartRef.current = null
        document.body.style.cursor = ''
        draw()
        return
      }
      if (isRotating) {
        // Confirm rotation
        onChange?.({ points: localDataRef.current })
        setIsRotating(false)
        rotateStartRef.current = null
        document.body.style.cursor = ''
        draw()
        return
      }

      if (draggingRef.current !== null) {
        onChange?.({ points: localDataRef.current })
        draggingRef.current = null
        document.body.style.cursor = ''
        draw()
      }
    }

    // Keyboard handlers for scale mode
    const handleKeyDown = (e) => {
      // Ignore keyboard shortcuts when typing in input fields
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'SELECT' ||
        e.target.tagName === 'TEXTAREA'
      ) {
        return
      }

      // 'S' to start scaling selected point's handles
      if (e.key === 's' || e.key === 'S') {
        if (selectedPoint !== null && !isScaling && !isRotating) {
          const pt = localDataRef.current[selectedPoint]
          scaleStartRef.current = {
            mouseX: 0, // Will be set on first mouse move
            handleIn: pt.handleIn ? [...pt.handleIn] : null,
            handleOut: pt.handleOut ? [...pt.handleOut] : null,
            handleInLen: pt.handleIn
              ? Math.hypot(pt.handleIn[0], pt.handleIn[1])
              : 0,
            handleOutLen: pt.handleOut
              ? Math.hypot(pt.handleOut[0], pt.handleOut[1])
              : 0,
            handleInAngle: pt.handleIn
              ? Math.atan2(pt.handleIn[1], pt.handleIn[0])
              : 0,
            handleOutAngle: pt.handleOut
              ? Math.atan2(pt.handleOut[1], pt.handleOut[0])
              : 0,
          }
          // Get current mouse position
          const getMouseX = (ev) => {
            scaleStartRef.current.mouseX = ev.clientX
            document.removeEventListener('mousemove', getMouseX)
          }
          document.addEventListener('mousemove', getMouseX)
          setIsScaling(true)
          document.body.style.cursor = 'ew-resize'
        }
      }

      // 'R' to start rotating selected point's handles
      if (e.key === 'r' || e.key === 'R') {
        if (selectedPoint !== null && !isScaling && !isRotating) {
          const pt = localDataRef.current[selectedPoint]
          rotateStartRef.current = {
            mouseX: 0, // Will be set on first mouse move
            handleIn: pt.handleIn ? [...pt.handleIn] : null,
            handleOut: pt.handleOut ? [...pt.handleOut] : null,
            handleInLen: pt.handleIn
              ? Math.hypot(pt.handleIn[0], pt.handleIn[1])
              : 0,
            handleOutLen: pt.handleOut
              ? Math.hypot(pt.handleOut[0], pt.handleOut[1])
              : 0,
            handleInAngle: pt.handleIn
              ? Math.atan2(pt.handleIn[1], pt.handleIn[0])
              : 0,
            handleOutAngle: pt.handleOut
              ? Math.atan2(pt.handleOut[1], pt.handleOut[0])
              : 0,
          }
          // Get current mouse position
          const getMouseX = (ev) => {
            rotateStartRef.current.mouseX = ev.clientX
            document.removeEventListener('mousemove', getMouseX)
          }
          document.addEventListener('mousemove', getMouseX)
          setIsRotating(true)
          document.body.style.cursor = 'grab'
        }
      }

      // Escape to cancel scaling/rotating or deselect
      if (e.key === 'Escape') {
        if (isScaling && scaleStartRef.current) {
          // Restore original handles
          const pts = localDataRef.current.map((p) => ({ ...p }))
          if (selectedPoint !== null) {
            if (scaleStartRef.current.handleIn) {
              pts[selectedPoint].handleIn = scaleStartRef.current.handleIn
            }
            if (scaleStartRef.current.handleOut) {
              pts[selectedPoint].handleOut = scaleStartRef.current.handleOut
            }
            localDataRef.current = pts
          }
          setIsScaling(false)
          scaleStartRef.current = null
          document.body.style.cursor = ''
          draw()
        } else if (isRotating && rotateStartRef.current) {
          // Restore original handles
          const pts = localDataRef.current.map((p) => ({ ...p }))
          if (selectedPoint !== null) {
            if (rotateStartRef.current.handleIn) {
              pts[selectedPoint].handleIn = rotateStartRef.current.handleIn
            }
            if (rotateStartRef.current.handleOut) {
              pts[selectedPoint].handleOut = rotateStartRef.current.handleOut
            }
            localDataRef.current = pts
          }
          setIsRotating(false)
          rotateStartRef.current = null
          document.body.style.cursor = ''
          draw()
        } else {
          setSelectedPoint(null)
        }
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    draw,
    fromCanvas,
    onChange,
    hitTest,
    hoverItem,
    selectedPoint,
    isScaling,
    isRotating,
  ])

  const handleMouseDown = useCallback(
    (e) => {
      e.preventDefault()
      // Focus the canvas so keyboard shortcuts work
      canvasRef.current?.focus()

      const rect = canvasRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // Cancel scaling mode on click
      if (isScaling) {
        onChange?.({ points: localDataRef.current })
        setIsScaling(false)
        scaleStartRef.current = null
        document.body.style.cursor = ''
        return
      }
      // Cancel rotating mode on click
      if (isRotating) {
        onChange?.({ points: localDataRef.current })
        setIsRotating(false)
        rotateStartRef.current = null
        document.body.style.cursor = ''
        return
      }

      const hit = hitTest(mx, my)

      if (hit) {
        // Select the point (clicking point or its handles selects that point)
        setSelectedPoint(hit.index)

        draggingRef.current = hit
        document.body.style.cursor = 'grabbing'
        draw()
        return
      }

      // Click on empty space deselects
      setSelectedPoint(null)

      // Double-click to add a point
      if (e.detail === 2) {
        const { x, y } = fromCanvas(mx, my)
        if (x > 0.02 && x < 0.98) {
          const pts = [...localDataRef.current]
          let insertIdx = 1
          for (let i = 1; i < pts.length; i++) {
            if (pts[i].pos[0] > x) {
              insertIdx = i
              break
            }
          }
          // Create new point with handles
          const newPoint = {
            pos: [x, clampY(y)],
            handleIn: [-0.1, 0],
            handleOut: [0.1, 0],
          }
          pts.splice(insertIdx, 0, newPoint)
          localDataRef.current = pts
          onChange?.({ points: pts })
          // Select the new point
          setSelectedPoint(insertIdx)
          draw()
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [draw, fromCanvas, onChange, hitTest, isScaling, isRotating]
  )

  const handleContextMenu = useCallback(
    (e) => {
      e.preventDefault()
      const rect = canvasRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const pts = localDataRef.current

      // Check if right-clicking on a point (not first or last)
      for (let i = 1; i < pts.length - 1; i++) {
        const pos = toCanvas(pts[i].pos[0], pts[i].pos[1])
        if (Math.hypot(mx - pos.x, my - pos.y) < 15) {
          const newPts = pts.filter((_, idx) => idx !== i)
          localDataRef.current = newPts
          onChange?.({ points: newPts })
          setHoverItem(null)
          draw()
          return
        }
      }
    },
    [draw, onChange, toCanvas]
  )

  const handleMouseLeave = useCallback(() => {
    if (draggingRef.current === null) {
      setHoverItem(null)
    }
  }, [])

  // Preset curves with handles
  const presets = [
    // Fade OUT presets (1→0): start full, end at zero
    {
      name: 'linear',
      points: [
        { pos: [0, 1], handleOut: [0.33, 0] },
        { pos: [1, 0], handleIn: [-0.33, 0] },
      ],
    },
    {
      name: 'ease',
      points: [
        { pos: [0, 1], handleOut: [0.25, -0.1] },
        { pos: [1, 0], handleIn: [-0.25, 0] },
      ],
    },
    {
      name: 'ease-in',
      points: [
        { pos: [0, 1], handleOut: [0.42, 0] },
        { pos: [1, 0], handleIn: [0, 0] },
      ],
    },
    {
      name: 'ease-out',
      points: [
        { pos: [0, 1], handleOut: [0, 0] },
        { pos: [1, 0], handleIn: [-0.58, 0] },
      ],
    },
    {
      name: 'ease-in-out',
      points: [
        { pos: [0, 1], handleOut: [0.42, 0] },
        { pos: [1, 0], handleIn: [-0.58, 0] },
      ],
    },
    // Fade IN presets (0→1): start at zero, end full
    {
      name: 'fade-in',
      points: [
        { pos: [0, 0], handleOut: [0.33, 0.33] },
        { pos: [1, 1], handleIn: [-0.33, 0] },
      ],
    },
    {
      name: 'bounce',
      points: [
        // Bounce out - ball dropping and bouncing, sharp peaks at value 1
        { pos: [0, 0], handleOut: [0.12, 0] },
        { pos: [0.36, 1], handleIn: [0, 0], handleOut: [0, 0] },
        { pos: [0.54, 0.75], handleIn: [-0.04, 0], handleOut: [0.04, 0] },
        { pos: [0.72, 1], handleIn: [0, 0], handleOut: [0, 0] },
        { pos: [0.82, 0.94], handleIn: [-0.02, 0], handleOut: [0.02, 0] },
        { pos: [0.91, 1], handleIn: [0, 0], handleOut: [0, 0] },
        { pos: [1, 1], handleIn: [0, 0] },
      ],
    },
    {
      name: 'elastic',
      points: [
        // Elastic out - overshoots and oscillates
        { pos: [0, 0], handleOut: [0.15, 0.8] },
        { pos: [0.35, 1.15], handleIn: [-0.08, 0.1], handleOut: [0.08, -0.1] },
        {
          pos: [0.55, 0.92],
          handleIn: [-0.06, -0.05],
          handleOut: [0.06, 0.05],
        },
        {
          pos: [0.75, 1.03],
          handleIn: [-0.05, 0.02],
          handleOut: [0.05, -0.02],
        },
        { pos: [1, 1], handleIn: [-0.1, 0] },
      ],
    },
    {
      name: 'back',
      points: [
        // Back out - overshoots then settles
        { pos: [0, 0], handleOut: [0.2, 0.8] },
        { pos: [0.6, 1.1], handleIn: [-0.15, 0.1], handleOut: [0.15, -0.05] },
        { pos: [1, 1], handleIn: [-0.2, 0] },
      ],
    },
  ]

  // Parametric easing generators
  const [easingIntensity, setEasingIntensity] = useState(1)
  const [easingFrequency, setEasingFrequency] = useState(3)

  const generateBounce = useCallback((intensity, frequency) => {
    const points = [{ pos: [0, 0], handleOut: [0.1, 0] }]
    const bounces = Math.max(1, Math.round(frequency))
    let t = 0.36
    const tStep = (1 - t) / (bounces * 2)

    for (let i = 0; i < bounces; i++) {
      const decay = Math.pow(0.5, i) * intensity
      // Peak at 1
      points.push({
        pos: [t, 1],
        handleIn: [0, 0],
        handleOut: [0, 0],
      })
      t += tStep
      // Valley (except last)
      if (i < bounces - 1) {
        const valleyY = 1 - decay * 0.3
        points.push({
          pos: [t, valleyY],
          handleIn: [-tStep * 0.3, 0],
          handleOut: [tStep * 0.3, 0],
        })
        t += tStep
      }
    }
    points.push({ pos: [1, 1], handleIn: [0, 0] })
    return points
  }, [])

  // Generate elastic easing with direction: 'in', 'out', or 'inOut'
  const generateElastic = useCallback(
    (intensity, frequency, direction = 'out') => {
      const oscillations = Math.max(1, Math.round(frequency))
      const segmentWidth = 0.6 / (oscillations * 2)

      if (direction === 'in') {
        // Elastic In - oscillates around 0 at the start, then shoots to 1
        const points = [{ pos: [0, 0], handleOut: [0.05, 0] }]
        let t = 0.1

        for (let i = oscillations - 1; i >= 0; i--) {
          const decay = Math.pow(0.5, i) * intensity
          const undershoot = -decay * 0.2
          const overshoot = decay * 0.15

          // Undershoot (negative)
          points.push({
            pos: [t, undershoot],
            handleIn: [-segmentWidth * 0.4, -decay * 0.05],
            handleOut: [segmentWidth * 0.4, decay * 0.05],
          })
          t += segmentWidth

          // Overshoot (positive, small)
          if (i > 0) {
            points.push({
              pos: [t, overshoot],
              handleIn: [-segmentWidth * 0.4, decay * 0.03],
              handleOut: [segmentWidth * 0.4, -decay * 0.03],
            })
            t += segmentWidth
          }
        }
        points.push({ pos: [1, 1], handleIn: [-0.15, -0.5 * intensity] })
        return points
      } else if (direction === 'inOut') {
        // Elastic In-Out - oscillates at both ends
        const points = [{ pos: [0, 0], handleOut: [0.03, 0] }]
        const halfOsc = Math.max(1, Math.ceil(oscillations / 2))
        const segW = 0.25 / halfOsc
        let t = 0.05

        // In phase - small oscillations around 0
        for (let i = halfOsc - 1; i >= 0; i--) {
          const decay = Math.pow(0.6, i) * intensity * 0.5
          points.push({
            pos: [t, -decay * 0.15],
            handleIn: [-segW * 0.3, 0],
            handleOut: [segW * 0.3, 0],
          })
          t += segW
        }

        // Middle - smooth transition
        points.push({
          pos: [0.5, 0.5],
          handleIn: [-0.1, -0.3],
          handleOut: [0.1, 0.3],
        })
        t = 0.75

        // Out phase - oscillations around 1
        for (let i = 0; i < halfOsc; i++) {
          const decay = Math.pow(0.6, i) * intensity * 0.5
          points.push({
            pos: [t, 1 + decay * 0.15],
            handleIn: [-segW * 0.3, 0],
            handleOut: [segW * 0.3, 0],
          })
          t += segW
        }

        points.push({ pos: [1, 1], handleIn: [-0.05, 0] })
        return points
      } else {
        // Elastic Out (default) - shoots to 1, then oscillates around it
        const points = [{ pos: [0, 0], handleOut: [0.12, 0.6 * intensity] }]
        let t = 0.25

        for (let i = 0; i < oscillations; i++) {
          const decay = Math.pow(0.5, i) * intensity
          const overshoot = 1 + decay * 0.2
          const undershoot = 1 - decay * 0.15

          // Overshoot
          points.push({
            pos: [t, overshoot],
            handleIn: [-segmentWidth * 0.4, decay * 0.1],
            handleOut: [segmentWidth * 0.4, -decay * 0.1],
          })
          t += segmentWidth

          // Undershoot (except last)
          if (i < oscillations - 1) {
            points.push({
              pos: [t, undershoot],
              handleIn: [-segmentWidth * 0.4, -decay * 0.05],
              handleOut: [segmentWidth * 0.4, decay * 0.05],
            })
            t += segmentWidth
          }
        }
        points.push({ pos: [1, 1], handleIn: [-0.1, 0] })
        return points
      }
    },
    []
  )

  // Generate back easing with direction: 'in', 'out', or 'inOut'
  const generateBack = useCallback((intensity, direction = 'out') => {
    const overshoot = intensity * 0.15

    if (direction === 'in') {
      // Back In - goes negative first, then shoots to 1
      return [
        { pos: [0, 0], handleOut: [0.2, 0] },
        { pos: [0.4, -overshoot], handleIn: [-0.1, 0], handleOut: [0.1, 0] },
        { pos: [1, 1], handleIn: [-0.25, -0.5 * intensity] },
      ]
    } else if (direction === 'inOut') {
      // Back In-Out - negative start and overshoot end
      return [
        { pos: [0, 0], handleOut: [0.15, 0] },
        {
          pos: [0.2, -overshoot * 0.5],
          handleIn: [-0.08, 0],
          handleOut: [0.08, 0],
        },
        { pos: [0.5, 0.5], handleIn: [-0.12, -0.25], handleOut: [0.12, 0.25] },
        {
          pos: [0.8, 1 + overshoot * 0.5],
          handleIn: [-0.08, 0],
          handleOut: [0.08, 0],
        },
        { pos: [1, 1], handleIn: [-0.15, 0] },
      ]
    } else {
      // Back Out (default) - overshoots 1, then settles
      return [
        { pos: [0, 0], handleOut: [0.2, 0.6 * intensity] },
        {
          pos: [0.55, 1 + overshoot],
          handleIn: [-0.12, 0.1 * intensity],
          handleOut: [0.12, -0.05 * intensity],
        },
        { pos: [1, 1], handleIn: [-0.2, 0] },
      ]
    }
  }, [])

  return (
    <div style={{ marginBottom: '12px' }} ref={containerRef}>
      {label && (
        <div style={{ ...styles.label, marginBottom: '8px' }}>{label}</div>
      )}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '10px',
          padding: '14px',
          border: `1px solid ${wrapped.border}`,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Canvas container with explicit positioning */}
        <div
          style={{
            position: 'relative',
            width: SIZE,
            height: SIZE,
            margin: '0 auto',
            zIndex: 2,
          }}
        >
          <canvas
            ref={canvasRef}
            tabIndex={0}
            style={{
              width: SIZE,
              height: SIZE,
              borderRadius: '8px',
              cursor: isScaling
                ? 'ew-resize'
                : isRotating
                  ? 'grab'
                  : draggingRef.current !== null
                    ? 'grabbing'
                    : hoverItem !== null
                      ? 'grab'
                      : 'crosshair',
              display: 'block',
              outline: 'none', // Prevent focus outline
            }}
            onMouseDown={handleMouseDown}
            onContextMenu={handleContextMenu}
            onMouseLeave={handleMouseLeave}
            onBlur={() => {
              // Deselect when clicking elsewhere (unless in scaling/rotating mode)
              if (!isScaling && !isRotating) {
                setSelectedPoint(null)
              }
            }}
          />
        </div>
      </div>

      {/* UI Below the curve - separate container */}
      <div
        style={{
          marginTop: '10px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '10px',
          padding: '12px',
          border: `1px solid ${wrapped.border}`,
        }}
      >
        {/* Scaling mode indicator */}
        {isScaling && (
          <div
            style={{
              padding: '8px 12px',
              background: 'rgba(100, 200, 255, 0.15)',
              borderRadius: '6px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: '#64c8ff',
              textAlign: 'center',
              border: '1px solid rgba(100, 200, 255, 0.4)',
              marginBottom: '10px',
            }}
          >
            ⇔ <strong>SCALING</strong> · move mouse left/right · click to
            confirm · <span style={{ opacity: 0.7 }}>Esc</span> to cancel
          </div>
        )}

        {/* Rotating mode indicator */}
        {isRotating && (
          <div
            style={{
              padding: '8px 12px',
              background: 'rgba(200, 100, 255, 0.15)',
              borderRadius: '6px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: '#c864ff',
              textAlign: 'center',
              border: '1px solid rgba(200, 100, 255, 0.4)',
              marginBottom: '10px',
            }}
          >
            ↻ <strong>ROTATING</strong> · move mouse left/right · click to
            confirm · <span style={{ opacity: 0.7 }}>Esc</span> to cancel
          </div>
        )}

        {/* Selection info */}
        {selectedPoint !== null && !isScaling && !isRotating && (
          <div
            style={{
              padding: '6px 10px',
              background: 'rgba(100, 200, 255, 0.08)',
              borderRadius: '6px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#64c8ff',
              textAlign: 'center',
              border: '1px solid rgba(100, 200, 255, 0.25)',
              marginBottom: '10px',
            }}
          >
            Point {selectedPoint + 1} selected · <strong>S</strong> scale ·{' '}
            <strong>R</strong> rotate
          </div>
        )}

        {/* Instructions */}
        <div
          style={{
            padding: '6px 10px',
            background: 'rgba(249, 115, 22, 0.05)',
            borderRadius: '6px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: wrapped.textMuted,
            textAlign: 'center',
            border: `1px solid ${wrapped.border}`,
            marginBottom: '10px',
          }}
        >
          <span style={{ color: wrapped.accent }}>click</span> select ·{' '}
          <span style={{ color: '#64c8ff' }}>S</span> scale ·{' '}
          <span style={{ color: '#c864ff' }}>R</span> rotate ·{' '}
          <span style={{ color: wrapped.accent }}>double-click</span> add ·{' '}
          <span style={{ color: wrapped.accent }}>right-click</span> delete
        </div>

        {/* Preset buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            justifyContent: 'center',
          }}
        >
          {presets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => {
                const newPts = preset.points.map((p) => ({
                  ...p,
                  pos: [...p.pos],
                  handleIn: p.handleIn ? [...p.handleIn] : undefined,
                  handleOut: p.handleOut ? [...p.handleOut] : undefined,
                }))
                localDataRef.current = newPts
                onChange?.({ points: newPts })
                draw()
              }}
              style={{
                padding: '5px 10px',
                background: 'rgba(249, 115, 22, 0.1)',
                border: `1px solid ${wrapped.border}`,
                borderRadius: '5px',
                color: wrapped.textMuted,
                cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(249, 115, 22, 0.25)'
                e.currentTarget.style.color = wrapped.accent
                e.currentTarget.style.borderColor = wrapped.accent
                e.currentTarget.style.boxShadow =
                  '0 0 8px rgba(249, 115, 22, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(249, 115, 22, 0.1)'
                e.currentTarget.style.color = wrapped.textMuted
                e.currentTarget.style.borderColor = wrapped.border
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {preset.name}
            </button>
          ))}
          {/* Invert button */}
          <button
            onClick={() => {
              const pts = localDataRef.current
              // Invert the curve: 1 - y for all Y values
              const inverted = pts.map((p) => ({
                pos: [p.pos[0], 1 - p.pos[1]],
                // Negate handle Y offsets (flip direction)
                handleIn: p.handleIn
                  ? [p.handleIn[0], -p.handleIn[1]]
                  : undefined,
                handleOut: p.handleOut
                  ? [p.handleOut[0], -p.handleOut[1]]
                  : undefined,
              }))
              localDataRef.current = inverted
              onChange?.({ points: inverted })
              setSelectedPoint(null)
              draw()
            }}
            style={{
              padding: '5px 10px',
              background: 'rgba(100, 200, 255, 0.1)',
              border: '1px solid rgba(100, 200, 255, 0.3)',
              borderRadius: '5px',
              color: '#64c8ff',
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(100, 200, 255, 0.25)'
              e.currentTarget.style.borderColor = '#64c8ff'
              e.currentTarget.style.boxShadow =
                '0 0 8px rgba(100, 200, 255, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(100, 200, 255, 0.1)'
              e.currentTarget.style.borderColor = 'rgba(100, 200, 255, 0.3)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            ↕ invert
          </button>
        </div>

        {/* Parametric easing controls */}
        <div
          style={{
            marginTop: '12px',
            padding: '10px',
            background: 'rgba(168, 85, 247, 0.05)',
            borderRadius: '8px',
            border: '1px solid rgba(168, 85, 247, 0.2)',
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#a855f7',
              marginBottom: '8px',
              textAlign: 'center',
            }}
          >
            parametric easings
          </div>

          {/* Intensity slider */}
          <div style={{ marginBottom: '8px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: wrapped.textMuted,
                marginBottom: '4px',
              }}
            >
              <span>intensity</span>
              <span style={{ color: '#a855f7' }}>
                {easingIntensity.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.1"
              value={easingIntensity}
              onChange={(e) => setEasingIntensity(parseFloat(e.target.value))}
              style={{
                width: '100%',
                accentColor: '#a855f7',
                height: '4px',
              }}
            />
          </div>

          {/* Frequency slider */}
          <div style={{ marginBottom: '10px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: wrapped.textMuted,
                marginBottom: '4px',
              }}
            >
              <span>frequency</span>
              <span style={{ color: '#a855f7' }}>{easingFrequency}</span>
            </div>
            <input
              type="range"
              min="1"
              max="6"
              step="1"
              value={easingFrequency}
              onChange={(e) => setEasingFrequency(parseInt(e.target.value))}
              style={{
                width: '100%',
                accentColor: '#a855f7',
                height: '4px',
              }}
            />
          </div>

          {/* Generate buttons */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {/* Bounce - single button */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  const pts = generateBounce(easingIntensity, easingFrequency)
                  localDataRef.current = pts
                  onChange?.({ points: pts })
                  setSelectedPoint(null)
                  draw()
                }}
                style={{
                  padding: '5px 14px',
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  borderRadius: '5px',
                  color: '#a855f7',
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '10px',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(168, 85, 247, 0.3)'
                  e.currentTarget.style.borderColor = '#a855f7'
                  e.currentTarget.style.boxShadow =
                    '0 0 8px rgba(168, 85, 247, 0.4)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(168, 85, 247, 0.15)'
                  e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                bounce
              </button>
            </div>

            {/* Elastic variants */}
            <div
              style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}
            >
              {[
                { name: 'elastic in', dir: 'in' },
                { name: 'elastic out', dir: 'out' },
                { name: 'elastic in-out', dir: 'inOut' },
              ].map(({ name, dir }) => (
                <button
                  key={name}
                  onClick={() => {
                    const pts = generateElastic(
                      easingIntensity,
                      easingFrequency,
                      dir
                    )
                    localDataRef.current = pts
                    onChange?.({ points: pts })
                    setSelectedPoint(null)
                    draw()
                  }}
                  style={{
                    padding: '5px 8px',
                    background: 'rgba(168, 85, 247, 0.15)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: '5px',
                    color: '#a855f7',
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '9px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(168, 85, 247, 0.3)'
                    e.currentTarget.style.borderColor = '#a855f7'
                    e.currentTarget.style.boxShadow =
                      '0 0 8px rgba(168, 85, 247, 0.4)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      'rgba(168, 85, 247, 0.15)'
                    e.currentTarget.style.borderColor =
                      'rgba(168, 85, 247, 0.3)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* Back variants */}
            <div
              style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}
            >
              {[
                { name: 'back in', dir: 'in' },
                { name: 'back out', dir: 'out' },
                { name: 'back in-out', dir: 'inOut' },
              ].map(({ name, dir }) => (
                <button
                  key={name}
                  onClick={() => {
                    const pts = generateBack(easingIntensity, dir)
                    localDataRef.current = pts
                    onChange?.({ points: pts })
                    setSelectedPoint(null)
                    draw()
                  }}
                  style={{
                    padding: '5px 8px',
                    background: 'rgba(168, 85, 247, 0.15)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: '5px',
                    color: '#a855f7',
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '9px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(168, 85, 247, 0.3)'
                    e.currentTarget.style.borderColor = '#a855f7'
                    e.currentTarget.style.boxShadow =
                      '0 0 8px rgba(168, 85, 247, 0.4)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      'rgba(168, 85, 247, 0.15)'
                    e.currentTarget.style.borderColor =
                      'rgba(168, 85, 247, 0.3)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Points info */}
        <div
          style={{
            marginTop: '10px',
            padding: '6px 10px',
            background: wrapped.bgInput,
            borderRadius: '6px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: wrapped.textMuted,
            border: `1px solid ${wrapped.border}`,
            textAlign: 'center',
          }}
        >
          {points.length} point{points.length !== 1 ? 's' : ''} · handles
          control curve shape
        </div>
      </div>
    </div>
  )
}

// Main Debug Panel Component - minimal React state, only for UI
// Circular loading spinner component
const LoadingSpinner = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    style={{
      animation: 'spin 1s linear infinite',
    }}
  >
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="rgba(249, 115, 22, 0.3)"
      strokeWidth="3"
      fill="none"
    />
    <path
      d="M12 2a10 10 0 0 1 10 10"
      stroke="rgba(249, 115, 22, 1)"
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
)

const DebugPanelContent = ({ initialValues, onUpdate, mode = 'r3f' }) => {
  'use no memo' // prevent react compiler issues when there are multiple versions of react
  const [isMinimized, setIsMinimized] = useState(false)
  const [panelSize, setPanelSize] = useState({ width: 380, height: null }) // null = full height
  const [copySuccess, setCopySuccess] = useState(false)
  const [bakeSuccess, setBakeSuccess] = useState(false)
  const [hasPendingChanges, setHasPendingChanges] = useState(false)
  const valuesRef = useRef(initialValues)
  const dirtyKeysRef = useRef(new Set()) // Track which keys have changed since last flush
  const [, forceUpdate] = useState(0)
  const isResizing = useRef(false)
  const resizeType = useRef(null)
  const debounceTimerRef = useRef(null)
  const DEBOUNCE_DELAY = 500 // 0.5s

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState('')

  // Undo/Redo state
  const historyRef = useRef([JSON.parse(JSON.stringify(initialValues))]) // Stack of past states
  const [historyIndex, setHistoryIndex] = useState(0) // Current position in history
  const [historyLength, setHistoryLength] = useState(1) // Track length for canRedo calculation
  const MAX_HISTORY = 50 // Limit history size
  const isUndoingRef = useRef(false) // Flag to prevent recording during undo/redo

  // Track previous initialValues to detect external updates
  const prevInitialValuesRef = useRef(initialValues)

  // When initialValues changes from parent (e.g., after state changes),
  // merge new values but preserve dirty (unsaved) changes
  useEffect(() => {
    if (initialValues !== prevInitialValuesRef.current) {
      // Merge new initialValues into valuesRef, but preserve dirty keys
      const merged = { ...valuesRef.current }
      for (const key in initialValues) {
        // Only update keys that aren't dirty (user hasn't changed them yet)
        if (!dirtyKeysRef.current.has(key)) {
          merged[key] = initialValues[key]
        }
      }
      valuesRef.current = merged
      prevInitialValuesRef.current = initialValues
      forceUpdate((n) => n + 1)
    }
  }, [initialValues])

  // Flush pending changes to parent - only send dirty keys
  const flushChanges = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    setHasPendingChanges(false)

    // Only send the keys that actually changed
    const changedValues = {}
    for (const key of dirtyKeysRef.current) {
      changedValues[key] = valuesRef.current[key]
    }
    dirtyKeysRef.current.clear()

    if (Object.keys(changedValues).length > 0) {
      onUpdate(changedValues)
    }
  }, [onUpdate])

  // Schedule a debounced update
  const scheduleUpdate = useCallback(() => {
    setHasPendingChanges(true)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      flushChanges()
    }, DEBOUNCE_DELAY)
  }, [flushChanges])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Copy code to clipboard
  const handleCopyCode = useCallback(async () => {
    // Flush any pending changes first
    if (hasPendingChanges) {
      flushChanges()
    }
    const code =
      mode === 'vanilla'
        ? generateVanillaCode(valuesRef.current)
        : mode === 'tres'
          ? generateVueTemplate(valuesRef.current)
          : generateVFXParticlesJSX(valuesRef.current)
    try {
      await navigator.clipboard.writeText(code)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [hasPendingChanges, flushChanges, mode])

  // Bake and export curve texture as binary
  const handleBakeCurves = useCallback(async () => {
    if (hasPendingChanges) {
      flushChanges()
    }

    const values = valuesRef.current

    // Build .bin with header containing channel bitmask
    // Only curves that are set (non-null) are marked as active
    const binBuffer = buildCurveTextureBin(
      values.fadeSizeCurve || null,
      values.fadeOpacityCurve || null,
      values.velocityCurve || null,
      values.rotationSpeedCurve || null
    )

    // Generate filename from VFX name or timestamp
    const vfxName = values.name || `vfx-curves-${Date.now()}`
    const filename = `${vfxName.replace(/[^a-zA-Z0-9-_]/g, '-')}.bin`

    // Export as binary .bin file with header
    const blob = new Blob([binBuffer], { type: 'application/octet-stream' })
    const link = document.createElement('a')
    link.download = filename
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)

    setBakeSuccess(true)
    setTimeout(() => setBakeSuccess(false), 2000)

    // Also copy the prop to clipboard for convenience
    const texturePath = `/vfx/curves/${filename}`
    try {
      await navigator.clipboard.writeText(`curveTexturePath="${texturePath}"`)
    } catch (err) {
      console.error('Failed to copy texture path:', err)
    }
  }, [hasPendingChanges, flushChanges])

  // Record state for undo/redo (debounced to batch rapid changes)
  const recordHistoryTimeoutRef = useRef(null)
  const recordHistory = useCallback(() => {
    if (isUndoingRef.current) return

    // Debounce history recording to batch rapid changes
    if (recordHistoryTimeoutRef.current) {
      clearTimeout(recordHistoryTimeoutRef.current)
    }
    recordHistoryTimeoutRef.current = setTimeout(() => {
      const currentState = JSON.parse(JSON.stringify(valuesRef.current))
      const lastState = historyRef.current[historyIndex]

      // Only record if state actually changed
      if (JSON.stringify(currentState) !== JSON.stringify(lastState)) {
        // Remove any future states if we're not at the end
        historyRef.current = historyRef.current.slice(0, historyIndex + 1)

        // Add new state
        historyRef.current.push(currentState)
        const newLength = historyRef.current.length
        const newIndex = newLength - 1

        // Limit history size
        if (newLength > MAX_HISTORY) {
          historyRef.current.shift()
          setHistoryIndex(newIndex - 1)
          setHistoryLength(newLength - 1)
        } else {
          setHistoryIndex(newIndex)
          setHistoryLength(newLength)
        }
      }
    }, 300) // 300ms debounce
  }, [historyIndex])

  // Undo function
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoingRef.current = true
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      const previousState = JSON.parse(
        JSON.stringify(historyRef.current[newIndex])
      )
      valuesRef.current = previousState

      // Mark all keys as dirty and flush
      for (const key in previousState) {
        dirtyKeysRef.current.add(key)
      }
      flushChanges()
      forceUpdate((n) => n + 1)

      setTimeout(() => {
        isUndoingRef.current = false
      }, 50)
    }
  }, [flushChanges, historyIndex])

  // Redo function
  const redo = useCallback(() => {
    if (historyIndex < historyRef.current.length - 1) {
      isUndoingRef.current = true
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      const nextState = JSON.parse(JSON.stringify(historyRef.current[newIndex]))
      valuesRef.current = nextState

      // Mark all keys as dirty and flush
      for (const key in nextState) {
        dirtyKeysRef.current.add(key)
      }
      flushChanges()
      forceUpdate((n) => n + 1)

      setTimeout(() => {
        isUndoingRef.current = false
      }, 50)
    }
  }, [flushChanges, historyIndex])

  // Check if undo/redo is available (use state instead of refs for render)
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < historyLength - 1

  // Reset to default values (not initial - the actual component defaults)
  const resetToDefaults = useCallback(() => {
    isUndoingRef.current = true
    const defaultState = JSON.parse(JSON.stringify(DEFAULT_VALUES))
    valuesRef.current = defaultState

    // Mark all keys as dirty and flush
    for (const key in defaultState) {
      dirtyKeysRef.current.add(key)
    }
    flushChanges()

    // Record this reset in history
    historyRef.current = historyRef.current.slice(0, historyIndex + 1)
    historyRef.current.push(defaultState)
    const newLength = historyRef.current.length
    const newIndex = newLength - 1

    if (newLength > MAX_HISTORY) {
      historyRef.current.shift()
      setHistoryIndex(newIndex - 1)
      setHistoryLength(newLength - 1)
    } else {
      setHistoryIndex(newIndex)
      setHistoryLength(newLength)
    }

    forceUpdate((n) => n + 1)
    setTimeout(() => {
      isUndoingRef.current = false
    }, 50)
  }, [flushChanges, historyIndex])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
        return

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  const update = useCallback(
    (key, value) => {
      valuesRef.current = { ...valuesRef.current, [key]: value }
      dirtyKeysRef.current.add(key)
      scheduleUpdate()
      recordHistory()
      forceUpdate((n) => n + 1)
    },
    [scheduleUpdate, recordHistory]
  )

  const updateNested = useCallback(
    (parentKey, childKey, value) => {
      // Get the existing parent object, defaulting to empty object if null/undefined
      const existingParent = valuesRef.current[parentKey] || {}
      valuesRef.current = {
        ...valuesRef.current,
        [parentKey]: {
          ...existingParent,
          [childKey]: value,
        },
      }
      dirtyKeysRef.current.add(parentKey)
      scheduleUpdate()
      recordHistory()
      forceUpdate((n) => n + 1)
    },
    [scheduleUpdate, recordHistory]
  )

  // Helper to update geometry args and trigger geometry recreation
  const updateGeometryArg = useCallback(
    (key, value) => {
      const newArgs = {
        ...valuesRef.current.geometryArgs,
        [key]: value,
      }
      valuesRef.current = {
        ...valuesRef.current,
        geometryArgs: newArgs,
      }
      dirtyKeysRef.current.add('geometryArgs')
      scheduleUpdate()
      recordHistory()
      forceUpdate((n) => n + 1)
    },
    [scheduleUpdate, recordHistory]
  )

  // Set flushChanges ref in store for child components to access
  useEffect(() => {
    setFlushChanges(flushChanges)
    return () => setFlushChanges(null)
  }, [flushChanges])

  // Resize handlers
  const handleResizeStart = useCallback(
    (e, type) => {
      e.preventDefault()
      isResizing.current = true
      resizeType.current = type
      const startX = e.clientX
      const startY = e.clientY
      const startWidth = panelSize.width
      // If height is null (full height), calculate current height from window
      const startHeight = panelSize.height || window.innerHeight - 32

      document.body.style.cursor =
        type === 'corner'
          ? 'sw-resize'
          : type === 'left'
            ? 'ew-resize'
            : 'ns-resize'
      document.body.style.userSelect = 'none'

      const handleMouseMove = (e) => {
        if (!isResizing.current) return

        let newWidth = startWidth
        let newHeight = startHeight

        if (type === 'corner' || type === 'left') {
          // Dragging left edge - increase width when moving left
          newWidth = startWidth - (e.clientX - startX)
        }
        if (type === 'corner' || type === 'bottom') {
          newHeight = startHeight + (e.clientY - startY)
        }

        // Clamp dimensions
        newWidth = Math.max(280, Math.min(600, newWidth))
        newHeight = Math.max(200, Math.min(window.innerHeight - 32, newHeight))

        setPanelSize({ width: newWidth, height: newHeight })
      }

      const handleMouseUp = () => {
        isResizing.current = false
        resizeType.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [panelSize]
  )

  const values = valuesRef.current

  // Search filter helper - maps section titles to their searchable keywords
  const sectionKeywords = {
    Basic: [
      'basic',
      'max particles',
      'position',
      'emit',
      'count',
      'delay',
      'auto start',
    ],
    Size: ['size', 'range', 'fade', 'scale'],
    Colors: [
      'color',
      'colors',
      'start',
      'end',
      'opacity',
      'fade',
      'intensity',
      'rgb',
      'hex',
    ],
    Physics: [
      'physics',
      'gravity',
      'speed',
      'lifetime',
      'velocity',
      'friction',
      'curve',
    ],
    'Direction & Start Position': [
      'direction',
      'position',
      'offset',
      'start',
      'startPositionAsDirection',
    ],
    Rotation: [
      'rotation',
      'rotate',
      'spin',
      'orient',
      'stretch',
      'axis',
      'curve',
      'rotationSpeedCurve',
    ],
    Geometry: [
      'geometry',
      'mesh',
      'box',
      'sphere',
      'cylinder',
      'cone',
      'torus',
      'plane',
      'capsule',
    ],
    Rendering: [
      'rendering',
      'appearance',
      'blending',
      'lighting',
      'shadow',
      'material',
    ],
    'Emitter Shape': [
      'emitter',
      'shape',
      'radius',
      'angle',
      'height',
      'direction',
      'surface',
    ],
    Turbulence: ['turbulence', 'noise', 'frequency', 'intensity', 'speed'],
    Collision: ['collision', 'bounce', 'plane', 'friction', 'die', 'gravity'],
    Effects: [
      'effects',
      'soft',
      'particles',
      'attract',
      'center',
      'soft particles',
      'distance',
    ],
  }

  // Check if a section should be visible based on search query
  const matchesSearch = (sectionTitle) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    const keywords = sectionKeywords[sectionTitle] || [
      sectionTitle.toLowerCase(),
    ]
    return (
      keywords.some((keyword) => keyword.includes(query)) ||
      sectionTitle.toLowerCase().includes(query)
    )
  }

  const containerStyle = {
    ...styles.container,
    width: `${panelSize.width}px`,
    height: isMinimized
      ? 'auto'
      : panelSize.height
        ? `${panelSize.height}px`
        : undefined,
  }

  return (
    <div style={containerStyle}>
      {/* Resize handles */}
      {!isMinimized && (
        <>
          <div
            style={styles.resizeHandle}
            onMouseDown={(e) => handleResizeStart(e, 'corner')}
            title="Drag to resize"
          />
          <div
            style={styles.resizeHandleRight}
            onMouseDown={(e) => handleResizeStart(e, 'left')}
          />
          <div
            style={styles.resizeHandleBottom}
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          />
        </>
      )}

      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <div style={styles.headerDot} />
          <span>particles</span>
        </div>
        <div style={styles.headerButtons}>
          {/* Undo/Redo buttons */}
          <button
            style={{
              ...styles.iconBtn,
              opacity: canUndo ? 1 : 0.3,
              cursor: canUndo ? 'pointer' : 'default',
            }}
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            style={{
              ...styles.iconBtn,
              opacity: canRedo ? 1 : 0.3,
              cursor: canRedo ? 'pointer' : 'default',
            }}
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            ↷
          </button>
          <button
            style={{
              ...styles.iconBtn,
              marginLeft: '4px',
            }}
            onClick={resetToDefaults}
            title="Reset to defaults"
          >
            ⟲
          </button>
          {hasPendingChanges && <LoadingSpinner />}
          <button
            style={{
              ...styles.copyBtn,
              ...(copySuccess ? styles.copyBtnSuccess : {}),
            }}
            onClick={handleCopyCode}
            onMouseEnter={(e) => {
              if (!copySuccess) {
                Object.assign(e.currentTarget.style, {
                  background: `linear-gradient(135deg, rgba(249, 115, 22, 0.25) 0%, rgba(251, 146, 60, 0.15) 100%)`,
                  borderColor: wrapped.accent,
                  boxShadow: `0 0 20px rgba(249, 115, 22, 0.4), 0 0 40px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
                  color: wrapped.accentLight,
                  textShadow: `0 0 12px rgba(249, 115, 22, 0.8)`,
                })
              }
            }}
            onMouseLeave={(e) => {
              if (!copySuccess) {
                Object.assign(e.currentTarget.style, {
                  background: `linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(251, 146, 60, 0.1) 100%)`,
                  borderColor: wrapped.borderLit,
                  boxShadow: `0 0 12px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
                  color: wrapped.accent,
                  textShadow: `0 0 8px rgba(249, 115, 22, 0.5)`,
                })
              }
            }}
          >
            {copySuccess ? '✓ copied' : 'copy code'}
          </button>
          <button
            style={{
              ...styles.copyBtn,
              ...(bakeSuccess ? styles.copyBtnSuccess : {}),
              marginLeft: '4px',
            }}
            onClick={handleBakeCurves}
          >
            {bakeSuccess ? '✓ exported' : 'bake curves'}
          </button>
          <button
            style={styles.minimizeBtn}
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? '+' : '−'}
          </button>
        </div>
      </div>

      {/* Search/Filter bar */}
      {!isMinimized && (
        <div
          style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${wrapped.border}`,
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: '10px',
                color: 'rgba(255, 255, 255, 0.3)',
                fontSize: '12px',
                pointerEvents: 'none',
              }}
            >
              🔍
            </span>
            <input
              type="text"
              placeholder="Search properties..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: `1px solid ${wrapped.border}`,
                borderRadius: '6px',
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', monospace",
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.4)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '2px 6px',
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {!isMinimized && (
        <div style={styles.content}>
          {/* Basic Settings */}
          <Section
            title="Basic"
            defaultOpen={true}
            hidden={!matchesSearch('Basic')}
          >
            <NumberInput
              label="Max Particles"
              value={values.maxParticles || 10000}
              onChange={(v) => update('maxParticles', v)}
              min={1}
              max={100000}
              step={100}
            />
            <Vec3Input
              label="Position"
              value={values.position}
              onChange={(v) => update('position', v)}
            />
            <NumberInput
              label="Emit Count"
              value={values.emitCount || 1}
              onChange={(v) => update('emitCount', v)}
              min={1}
              max={1000}
              step={1}
            />
            <NumberInput
              label="Delay (s)"
              value={values.delay || 0}
              onChange={(v) => update('delay', v)}
              min={0}
              max={10}
              step={0.01}
            />
            <CheckboxInput
              label="Auto Start"
              value={values.autoStart}
              onChange={(v) => update('autoStart', v)}
            />
          </Section>

          {/* Size */}
          <Section
            title="Size"
            defaultOpen={false}
            hidden={!matchesSearch('Size')}
          >
            <RangeInput
              label="Size Range"
              value={values.size}
              onChange={(v) => update('size', v)}
              min={0}
              max={10}
            />
            <RangeInput
              label="Fade Size (start → end)"
              value={values.fadeSize}
              onChange={(v) => update('fadeSize', v)}
              min={0}
              max={5}
            />
            <div style={styles.row}>
              <label style={styles.label}>Use Curve</label>
              <input
                type="checkbox"
                checked={!!values.fadeSizeCurve}
                onChange={(e) =>
                  update(
                    'fadeSizeCurve',
                    e.target.checked
                      ? {
                          points: [
                            { pos: [0, 1], handleOut: [0.33, 0] },
                            { pos: [1, 0], handleIn: [-0.33, 0] },
                          ],
                        }
                      : null
                  )
                }
                style={{ accentColor: wrapped.accent }}
              />
            </div>
            {values.fadeSizeCurve && (
              <EasingCurveEditor
                label=""
                value={values.fadeSizeCurve}
                onChange={(v) => update('fadeSizeCurve', v)}
              />
            )}
          </Section>

          {/* Colors */}
          <Section
            title="Colors"
            defaultOpen={false}
            hidden={!matchesSearch('Colors')}
          >
            <ColorArrayInput
              label="Start Colors"
              value={values.colorStart}
              onChange={(v) => update('colorStart', v)}
            />
            <div style={styles.row}>
              <label style={styles.label}>End Colors</label>
              <input
                type="checkbox"
                checked={!!values.colorEnd}
                onChange={(e) =>
                  update('colorEnd', e.target.checked ? ['#ffffff'] : null)
                }
                style={{ accentColor: wrapped.accent }}
              />
            </div>
            {values.colorEnd && (
              <ColorArrayInput
                label=""
                value={values.colorEnd}
                onChange={(v) => update('colorEnd', v)}
              />
            )}
            <RangeInput
              label="Fade Opacity (start → end)"
              value={values.fadeOpacity}
              onChange={(v) => update('fadeOpacity', v)}
              min={0}
              max={1}
            />
            <div style={styles.row}>
              <label style={styles.label}>Use Opacity Curve</label>
              <input
                type="checkbox"
                checked={!!values.fadeOpacityCurve}
                onChange={(e) =>
                  update(
                    'fadeOpacityCurve',
                    e.target.checked
                      ? {
                          points: [
                            { pos: [0, 1], handleOut: [0.33, 0] },
                            { pos: [1, 0], handleIn: [-0.33, 0] },
                          ],
                        }
                      : null
                  )
                }
                style={{ accentColor: wrapped.accent }}
              />
            </div>
            {values.fadeOpacityCurve && (
              <EasingCurveEditor
                label=""
                value={values.fadeOpacityCurve}
                onChange={(v) => update('fadeOpacityCurve', v)}
              />
            )}
            <NumberInput
              label="Intensity"
              value={values.intensity || 1}
              onChange={(v) => update('intensity', v)}
              min={0}
              max={50}
              step={0.1}
            />
          </Section>

          {/* Physics */}
          <Section
            title="Physics"
            defaultOpen={false}
            hidden={!matchesSearch('Physics')}
          >
            <Vec3Input
              label="Gravity"
              value={values.gravity}
              onChange={(v) => update('gravity', v)}
            />
            <RangeInput
              label="Speed Range"
              value={values.speed}
              onChange={(v) => update('speed', v)}
              min={0}
              max={10}
            />
            <RangeInput
              label="Lifetime (s)"
              value={values.lifetime}
              onChange={(v) => update('lifetime', v)}
              min={0.1}
              max={60}
            />
            <div style={styles.row}>
              <label style={styles.label}>Use Velocity Curve</label>
              <input
                type="checkbox"
                checked={!!values.velocityCurve}
                onChange={(e) =>
                  update(
                    'velocityCurve',
                    e.target.checked
                      ? {
                          points: [
                            { pos: [0, 1], handleOut: [0.33, 0] },
                            { pos: [1, 1], handleIn: [-0.33, 0] },
                          ],
                        }
                      : null
                  )
                }
                style={{ accentColor: wrapped.accent }}
              />
            </div>
            {values.velocityCurve ? (
              <EasingCurveEditor
                label="Velocity over Lifetime (1=full, 0=stopped)"
                value={values.velocityCurve}
                onChange={(v) => update('velocityCurve', v)}
              />
            ) : (
              <>
                <RangeInput
                  label="Friction Intensity"
                  value={values.friction?.intensity}
                  onChange={(v) => updateNested('friction', 'intensity', v)}
                  min={-1}
                  max={1}
                />
                <SelectInput
                  label="Friction Easing"
                  value={values.friction?.easing || 'linear'}
                  onChange={(v) => updateNested('friction', 'easing', v)}
                  options={{
                    Linear: 'linear',
                    'Ease In': 'easeIn',
                    'Ease Out': 'easeOut',
                    'Ease In-Out': 'easeInOut',
                  }}
                />
              </>
            )}
          </Section>

          {/* Direction & Position */}
          <Section
            title="Direction & Start Position"
            defaultOpen={false}
            hidden={!matchesSearch('Direction & Start Position')}
          >
            <CheckboxInput
              label="Start Position as Direction"
              value={values.startPositionAsDirection}
              onChange={(v) => update('startPositionAsDirection', v)}
            />
            {!values.startPositionAsDirection && (
              <Range3DInput
                label="Direction (XYZ ranges)"
                value={values.direction}
                onChange={(v) => update('direction', v)}
              />
            )}
            <Range3DInput
              label="Start Position Offset (XYZ)"
              value={values.startPosition}
              onChange={(v) => update('startPosition', v)}
            />
          </Section>

          {/* Rotation */}
          <Section
            title="Rotation"
            defaultOpen={false}
            hidden={!matchesSearch('Rotation')}
          >
            <Range3DInput
              label="Rotation (rad)"
              value={values.rotation}
              onChange={(v) => update('rotation', v)}
            />
            <Range3DInput
              label="Rotation Speed (rad/s)"
              value={values.rotationSpeed}
              onChange={(v) => update('rotationSpeed', v)}
            />
            <div style={styles.row}>
              <label style={styles.label}>Use Rotation Speed Curve</label>
              <input
                type="checkbox"
                checked={!!values.rotationSpeedCurve}
                onChange={(e) =>
                  update(
                    'rotationSpeedCurve',
                    e.target.checked
                      ? {
                          points: [
                            { pos: [0, 1], handleOut: [0.33, 0] },
                            { pos: [1, 0], handleIn: [-0.33, 0] },
                          ],
                        }
                      : null
                  )
                }
                style={{ accentColor: wrapped.accent }}
              />
            </div>
            {values.rotationSpeedCurve && (
              <EasingCurveEditor
                label="Rotation Speed over Lifetime (1=full, 0=stopped)"
                value={values.rotationSpeedCurve}
                onChange={(v) => update('rotationSpeedCurve', v)}
              />
            )}
            <CheckboxInput
              label="Orient to Direction"
              value={values.orientToDirection}
              onChange={(v) => update('orientToDirection', v)}
            />
            {(values.orientToDirection || values.stretchBySpeed) && (
              <SelectInput
                label="Orient/Stretch Axis"
                value={values.orientAxis || 'z'}
                onChange={(v) => update('orientAxis', v)}
                options={{
                  '+X': 'x',
                  '+Y': 'y',
                  '+Z': 'z',
                  '-X': '-x',
                  '-Y': '-y',
                  '-Z': '-z',
                }}
              />
            )}
            <div style={styles.row}>
              <label style={styles.label}>Stretch by Speed</label>
              <input
                type="checkbox"
                checked={!!values.stretchBySpeed}
                onChange={(e) =>
                  update(
                    'stretchBySpeed',
                    e.target.checked ? { factor: 2, maxStretch: 5 } : null
                  )
                }
                style={{ accentColor: wrapped.accent }}
              />
            </div>
            {values.stretchBySpeed && (
              <>
                <NumberInput
                  label="Stretch Factor"
                  value={values.stretchBySpeed?.factor || 2}
                  onChange={(v) =>
                    update('stretchBySpeed', {
                      ...values.stretchBySpeed,
                      factor: v,
                    })
                  }
                  min={0}
                  max={20}
                  step={0.1}
                />
                <NumberInput
                  label="Max Stretch"
                  value={values.stretchBySpeed?.maxStretch || 5}
                  onChange={(v) =>
                    update('stretchBySpeed', {
                      ...values.stretchBySpeed,
                      maxStretch: v,
                    })
                  }
                  min={1}
                  max={20}
                  step={0.5}
                />
              </>
            )}
          </Section>

          {/* Geometry */}
          <Section
            title="Geometry"
            defaultOpen={false}
            hidden={!matchesSearch('Geometry')}
          >
            <SelectInput
              label="Type"
              value={values.geometryType || GeometryType.NONE}
              onChange={(v) => {
                update('geometryType', v)
                // Reset geometry args to defaults when changing type
                if (v !== GeometryType.NONE) {
                  update('geometryArgs', { ...geometryDefaults[v] })
                } else {
                  update('geometryArgs', null)
                }
              }}
              options={{
                'None (Sprite)': GeometryType.NONE,
                Box: GeometryType.BOX,
                Sphere: GeometryType.SPHERE,
                Cylinder: GeometryType.CYLINDER,
                Cone: GeometryType.CONE,
                Torus: GeometryType.TORUS,
                Plane: GeometryType.PLANE,
                Circle: GeometryType.CIRCLE,
                Ring: GeometryType.RING,
                Dodecahedron: GeometryType.DODECAHEDRON,
                Icosahedron: GeometryType.ICOSAHEDRON,
                Octahedron: GeometryType.OCTAHEDRON,
                Tetrahedron: GeometryType.TETRAHEDRON,
                Capsule: GeometryType.CAPSULE,
              }}
            />
            {/* Box args */}
            {values.geometryType === GeometryType.BOX && (
              <>
                <NumberInput
                  label="Width"
                  value={values.geometryArgs?.width || 1}
                  onChange={(v) => updateGeometryArg('width', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Height"
                  value={values.geometryArgs?.height || 1}
                  onChange={(v) => updateGeometryArg('height', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Depth"
                  value={values.geometryArgs?.depth || 1}
                  onChange={(v) => updateGeometryArg('depth', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Width Segments"
                  value={values.geometryArgs?.widthSegments || 1}
                  onChange={(v) =>
                    updateGeometryArg('widthSegments', Math.floor(v))
                  }
                  min={1}
                  max={32}
                  step={1}
                />
                <NumberInput
                  label="Height Segments"
                  value={values.geometryArgs?.heightSegments || 1}
                  onChange={(v) =>
                    updateGeometryArg('heightSegments', Math.floor(v))
                  }
                  min={1}
                  max={32}
                  step={1}
                />
                <NumberInput
                  label="Depth Segments"
                  value={values.geometryArgs?.depthSegments || 1}
                  onChange={(v) =>
                    updateGeometryArg('depthSegments', Math.floor(v))
                  }
                  min={1}
                  max={32}
                  step={1}
                />
              </>
            )}
            {/* Sphere args */}
            {values.geometryType === GeometryType.SPHERE && (
              <>
                <NumberInput
                  label="Radius"
                  value={values.geometryArgs?.radius || 0.5}
                  onChange={(v) => updateGeometryArg('radius', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Width Segments"
                  value={values.geometryArgs?.widthSegments || 16}
                  onChange={(v) =>
                    updateGeometryArg('widthSegments', Math.floor(v))
                  }
                  min={3}
                  max={64}
                  step={1}
                />
                <NumberInput
                  label="Height Segments"
                  value={values.geometryArgs?.heightSegments || 12}
                  onChange={(v) =>
                    updateGeometryArg('heightSegments', Math.floor(v))
                  }
                  min={2}
                  max={64}
                  step={1}
                />
              </>
            )}
            {/* Cylinder args */}
            {values.geometryType === GeometryType.CYLINDER && (
              <>
                <NumberInput
                  label="Radius Top"
                  value={values.geometryArgs?.radiusTop || 0.5}
                  onChange={(v) => updateGeometryArg('radiusTop', v)}
                  min={0}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Radius Bottom"
                  value={values.geometryArgs?.radiusBottom || 0.5}
                  onChange={(v) => updateGeometryArg('radiusBottom', v)}
                  min={0}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Height"
                  value={values.geometryArgs?.height || 1}
                  onChange={(v) => updateGeometryArg('height', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Radial Segments"
                  value={values.geometryArgs?.radialSegments || 16}
                  onChange={(v) =>
                    updateGeometryArg('radialSegments', Math.floor(v))
                  }
                  min={3}
                  max={64}
                  step={1}
                />
                <NumberInput
                  label="Height Segments"
                  value={values.geometryArgs?.heightSegments || 1}
                  onChange={(v) =>
                    updateGeometryArg('heightSegments', Math.floor(v))
                  }
                  min={1}
                  max={32}
                  step={1}
                />
              </>
            )}
            {/* Cone args */}
            {values.geometryType === GeometryType.CONE && (
              <>
                <NumberInput
                  label="Radius"
                  value={values.geometryArgs?.radius || 0.5}
                  onChange={(v) => updateGeometryArg('radius', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Height"
                  value={values.geometryArgs?.height || 1}
                  onChange={(v) => updateGeometryArg('height', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Radial Segments"
                  value={values.geometryArgs?.radialSegments || 16}
                  onChange={(v) =>
                    updateGeometryArg('radialSegments', Math.floor(v))
                  }
                  min={3}
                  max={64}
                  step={1}
                />
                <NumberInput
                  label="Height Segments"
                  value={values.geometryArgs?.heightSegments || 1}
                  onChange={(v) =>
                    updateGeometryArg('heightSegments', Math.floor(v))
                  }
                  min={1}
                  max={32}
                  step={1}
                />
              </>
            )}
            {/* Torus args */}
            {values.geometryType === GeometryType.TORUS && (
              <>
                <NumberInput
                  label="Radius"
                  value={values.geometryArgs?.radius || 0.5}
                  onChange={(v) => updateGeometryArg('radius', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Tube"
                  value={values.geometryArgs?.tube || 0.2}
                  onChange={(v) => updateGeometryArg('tube', v)}
                  min={0.01}
                  max={5}
                  step={0.05}
                />
                <NumberInput
                  label="Radial Segments"
                  value={values.geometryArgs?.radialSegments || 12}
                  onChange={(v) =>
                    updateGeometryArg('radialSegments', Math.floor(v))
                  }
                  min={3}
                  max={64}
                  step={1}
                />
                <NumberInput
                  label="Tubular Segments"
                  value={values.geometryArgs?.tubularSegments || 24}
                  onChange={(v) =>
                    updateGeometryArg('tubularSegments', Math.floor(v))
                  }
                  min={3}
                  max={128}
                  step={1}
                />
              </>
            )}
            {/* Plane args */}
            {values.geometryType === GeometryType.PLANE && (
              <>
                <NumberInput
                  label="Width"
                  value={values.geometryArgs?.width || 1}
                  onChange={(v) => updateGeometryArg('width', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Height"
                  value={values.geometryArgs?.height || 1}
                  onChange={(v) => updateGeometryArg('height', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Width Segments"
                  value={values.geometryArgs?.widthSegments || 1}
                  onChange={(v) =>
                    updateGeometryArg('widthSegments', Math.floor(v))
                  }
                  min={1}
                  max={32}
                  step={1}
                />
                <NumberInput
                  label="Height Segments"
                  value={values.geometryArgs?.heightSegments || 1}
                  onChange={(v) =>
                    updateGeometryArg('heightSegments', Math.floor(v))
                  }
                  min={1}
                  max={32}
                  step={1}
                />
              </>
            )}
            {/* Circle args */}
            {values.geometryType === GeometryType.CIRCLE && (
              <>
                <NumberInput
                  label="Radius"
                  value={values.geometryArgs?.radius || 0.5}
                  onChange={(v) => updateGeometryArg('radius', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Segments"
                  value={values.geometryArgs?.segments || 16}
                  onChange={(v) => updateGeometryArg('segments', Math.floor(v))}
                  min={3}
                  max={64}
                  step={1}
                />
              </>
            )}
            {/* Ring args */}
            {values.geometryType === GeometryType.RING && (
              <>
                <NumberInput
                  label="Inner Radius"
                  value={values.geometryArgs?.innerRadius || 0.25}
                  onChange={(v) => updateGeometryArg('innerRadius', v)}
                  min={0}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Outer Radius"
                  value={values.geometryArgs?.outerRadius || 0.5}
                  onChange={(v) => updateGeometryArg('outerRadius', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Theta Segments"
                  value={values.geometryArgs?.thetaSegments || 16}
                  onChange={(v) =>
                    updateGeometryArg('thetaSegments', Math.floor(v))
                  }
                  min={3}
                  max={64}
                  step={1}
                />
              </>
            )}
            {/* Polyhedra args (Dodecahedron, Icosahedron, Octahedron, Tetrahedron) */}
            {(values.geometryType === GeometryType.DODECAHEDRON ||
              values.geometryType === GeometryType.ICOSAHEDRON ||
              values.geometryType === GeometryType.OCTAHEDRON ||
              values.geometryType === GeometryType.TETRAHEDRON) && (
              <>
                <NumberInput
                  label="Radius"
                  value={values.geometryArgs?.radius || 0.5}
                  onChange={(v) => updateGeometryArg('radius', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Detail"
                  value={values.geometryArgs?.detail || 0}
                  onChange={(v) => updateGeometryArg('detail', Math.floor(v))}
                  min={0}
                  max={5}
                  step={1}
                />
              </>
            )}
            {/* Capsule args */}
            {values.geometryType === GeometryType.CAPSULE && (
              <>
                <NumberInput
                  label="Radius"
                  value={values.geometryArgs?.radius || 0.25}
                  onChange={(v) => updateGeometryArg('radius', v)}
                  min={0.01}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Length"
                  value={values.geometryArgs?.length || 0.5}
                  onChange={(v) => updateGeometryArg('length', v)}
                  min={0}
                  max={10}
                  step={0.1}
                />
                <NumberInput
                  label="Cap Segments"
                  value={values.geometryArgs?.capSegments || 4}
                  onChange={(v) =>
                    updateGeometryArg('capSegments', Math.floor(v))
                  }
                  min={1}
                  max={32}
                  step={1}
                />
                <NumberInput
                  label="Radial Segments"
                  value={values.geometryArgs?.radialSegments || 8}
                  onChange={(v) =>
                    updateGeometryArg('radialSegments', Math.floor(v))
                  }
                  min={3}
                  max={64}
                  step={1}
                />
              </>
            )}
          </Section>

          {/* Appearance */}
          <Section
            title="Rendering"
            defaultOpen={false}
            hidden={!matchesSearch('Rendering')}
          >
            <SelectInput
              label="Appearance"
              value={values.appearance || Appearance.GRADIENT}
              onChange={(v) => update('appearance', v)}
              options={Appearance}
            />
            <SelectInput
              label="Blending"
              value={values.blending || Blending.NORMAL}
              onChange={(v) => update('blending', parseInt(v))}
              options={{
                Normal: Blending.NORMAL,
                Additive: Blending.ADDITIVE,
                Multiply: Blending.MULTIPLY,
                Subtractive: Blending.SUBTRACTIVE,
              }}
            />
            <SelectInput
              label="Lighting"
              value={values.lighting || Lighting.STANDARD}
              onChange={(v) => update('lighting', v)}
              options={Lighting}
            />
            <CheckboxInput
              label="Shadow"
              value={values.shadow}
              onChange={(v) => update('shadow', v)}
            />
          </Section>

          {/* Emitter Shape */}
          <Section
            title="Emitter Shape"
            defaultOpen={false}
            hidden={!matchesSearch('Emitter Shape')}
          >
            <SelectInput
              label="Shape"
              value={values.emitterShape || EmitterShape.BOX}
              onChange={(v) => update('emitterShape', parseInt(v))}
              options={{
                Point: EmitterShape.POINT,
                Box: EmitterShape.BOX,
                Sphere: EmitterShape.SPHERE,
                Cone: EmitterShape.CONE,
                Disk: EmitterShape.DISK,
                Edge: EmitterShape.EDGE,
              }}
            />
            <RangeInput
              label="Emitter Radius (inner → outer)"
              value={values.emitterRadius}
              onChange={(v) => update('emitterRadius', v)}
              min={0}
              max={10}
            />
            <NumberInput
              label="Emitter Angle (rad)"
              value={values.emitterAngle || Math.PI / 4}
              onChange={(v) => update('emitterAngle', v)}
              min={0}
              max={Math.PI}
              step={0.01}
            />
            <RangeInput
              label="Emitter Height"
              value={values.emitterHeight}
              onChange={(v) => update('emitterHeight', v)}
              min={0}
              max={10}
            />
            <Vec3Input
              label="Emitter Direction"
              value={values.emitterDirection}
              onChange={(v) => update('emitterDirection', v)}
            />
            <CheckboxInput
              label="Surface Only"
              value={values.emitterSurfaceOnly}
              onChange={(v) => update('emitterSurfaceOnly', v)}
            />
          </Section>

          {/* Turbulence (Optional) */}
          <Section
            title="Turbulence"
            defaultOpen={false}
            optional={true}
            enabled={!!values.turbulence}
            onToggleEnabled={(enabled) =>
              update(
                'turbulence',
                enabled ? { intensity: 0.5, frequency: 1, speed: 1 } : null
              )
            }
            hidden={!matchesSearch('Turbulence')}
          >
            <NumberInput
              label="Intensity"
              value={values.turbulence?.intensity || 0.5}
              onChange={(v) => updateNested('turbulence', 'intensity', v)}
              min={0}
              max={5}
            />
            <NumberInput
              label="Frequency"
              value={values.turbulence?.frequency || 1}
              onChange={(v) => updateNested('turbulence', 'frequency', v)}
              min={0.1}
              max={10}
            />
            <NumberInput
              label="Speed"
              value={values.turbulence?.speed || 1}
              onChange={(v) => updateNested('turbulence', 'speed', v)}
              min={0}
              max={5}
            />
          </Section>

          {/* Collision (Optional) */}
          <Section
            title="Collision"
            defaultOpen={false}
            optional={true}
            enabled={!!values.collision}
            onToggleEnabled={(enabled) =>
              update(
                'collision',
                enabled
                  ? {
                      plane: { y: 0 },
                      bounce: 0.3,
                      friction: 0.8,
                      die: false,
                      sizeBasedGravity: 0,
                    }
                  : null
              )
            }
            hidden={!matchesSearch('Collision')}
          >
            <NumberInput
              label="Plane Y"
              value={values.collision?.plane?.y || 0}
              onChange={(v) =>
                update('collision', {
                  ...values.collision,
                  plane: { ...values.collision?.plane, y: v },
                })
              }
              min={-100}
              max={100}
            />
            <NumberInput
              label="Bounce"
              value={values.collision?.bounce || 0.3}
              onChange={(v) => updateNested('collision', 'bounce', v)}
              min={0}
              max={1}
            />
            <NumberInput
              label="Friction"
              value={values.collision?.friction || 0.8}
              onChange={(v) => updateNested('collision', 'friction', v)}
              min={0}
              max={1}
            />
            <NumberInput
              label="Size-Based Gravity"
              value={values.collision?.sizeBasedGravity || 0}
              onChange={(v) => updateNested('collision', 'sizeBasedGravity', v)}
              min={0}
              max={10}
            />
            <CheckboxInput
              label="Die on Collision"
              value={values.collision?.die}
              onChange={(v) => updateNested('collision', 'die', v)}
            />
          </Section>

          {/* Soft Particles (Optional) */}
          <Section
            title="Soft Particles"
            defaultOpen={false}
            optional={true}
            enabled={values.softParticles}
            onToggleEnabled={(enabled) => update('softParticles', enabled)}
            hidden={!matchesSearch('Effects')}
          >
            <NumberInput
              label="Soft Distance"
              value={values.softDistance || 0.5}
              onChange={(v) => update('softDistance', v)}
              min={0.01}
              max={10}
            />
          </Section>

          {/* Attract to Center */}
          <Section
            title="Effects"
            defaultOpen={false}
            hidden={!matchesSearch('Effects')}
          >
            <CheckboxInput
              label="Attract to Center"
              value={values.attractToCenter}
              onChange={(v) => update('attractToCenter', v)}
            />
          </Section>
        </div>
      )}
    </div>
  )
}

// Exported functions for imperative rendering (outside R3F)
export function renderDebugPanel(values, onChange, mode = 'r3f') {
  currentValues = values
  currentOnChange = onChange

  if (!debugContainer) {
    debugContainer = document.createElement('div')
    debugContainer.id = 'vfx-debug-panel-root'
    document.body.appendChild(debugContainer)

    // Inject scrollbar and wrapped theme styles
    const styleId = 'vfx-debug-scrollbar-styles'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

        @keyframes dotPulse {
          0%, 100% {
            box-shadow: 0 0 4px rgba(249, 115, 22, 0.4), 0 0 8px rgba(249, 115, 22, 0.2);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 8px rgba(249, 115, 22, 0.6), 0 0 16px rgba(249, 115, 22, 0.3), 0 0 24px rgba(249, 115, 22, 0.1);
            transform: scale(1.1);
          }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        #vfx-debug-panel-root *::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        #vfx-debug-panel-root *::-webkit-scrollbar-track {
          background: transparent;
        }
        #vfx-debug-panel-root *::-webkit-scrollbar-thumb {
          background: rgba(249, 115, 22, 0.4);
          border-radius: 3px;
        }
        #vfx-debug-panel-root *::-webkit-scrollbar-thumb:hover {
          background: rgba(249, 115, 22, 0.6);
        }
        #vfx-debug-panel-root *::-webkit-scrollbar-corner {
          background: transparent;
        }
        #vfx-debug-panel-root input:focus,
        #vfx-debug-panel-root select:focus {
          border-color: rgba(249, 115, 22, 0.5) !important;
          box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15), 0 0 20px rgba(249, 115, 22, 0.1) !important;
        }
        #vfx-debug-panel-root input:hover,
        #vfx-debug-panel-root select:hover {
          border-color: rgba(255, 255, 255, 0.15);
        }
        #vfx-debug-panel-root input[type="color"] {
          cursor: pointer;
        }
        #vfx-debug-panel-root input[type="color"]:hover {
          transform: scale(1.08);
          box-shadow: 0 0 12px rgba(249, 115, 22, 0.3);
        }
        #vfx-debug-panel-root input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }
        #vfx-debug-panel-root input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
          margin-top: -1px;
        }
        #vfx-debug-panel-root input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        #vfx-debug-panel-root button:hover {
          background: rgba(249, 115, 22, 0.1) !important;
          border-color: rgba(249, 115, 22, 0.3) !important;
          color: #fb923c !important;
        }
        #vfx-debug-panel-root select option {
          background: rgb(18, 18, 22);
          color: rgba(255, 255, 255, 0.95);
        }
        #vfx-debug-panel-root input[type="checkbox"] {
          appearance: none;
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          background: rgba(0, 0, 0, 0.3);
          cursor: pointer;
          position: relative;
          transition: all 0.15s ease;
        }
        #vfx-debug-panel-root input[type="checkbox"]:checked {
          background: #f97316;
          border-color: #f97316;
          box-shadow: 0 0 8px rgba(249, 115, 22, 0.4);
        }
        #vfx-debug-panel-root input[type="checkbox"]:checked::after {
          content: '✓';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #000;
          font-size: 10px;
          font-weight: bold;
        }
        #vfx-debug-panel-root input[type="checkbox"]:hover {
          border-color: rgba(249, 115, 22, 0.5);
        }
      `
      document.head.appendChild(style)
    }
  }

  if (!debugRoot) {
    debugRoot = createRoot(debugContainer)
  }

  debugRoot.render(
    <DebugPanelContent initialValues={values} onUpdate={onChange} mode={mode} />
  )
}

export function updateDebugPanel(values, onChange, mode = 'r3f') {
  currentValues = values
  currentOnChange = onChange
  if (debugRoot) {
    debugRoot.render(
      <DebugPanelContent
        initialValues={values}
        onUpdate={onChange}
        mode={mode}
      />
    )
  }
}

export function destroyDebugPanel() {
  if (debugRoot) {
    debugRoot.unmount()
    debugRoot = null
  }
  if (debugContainer && debugContainer.parentNode) {
    debugContainer.parentNode.removeChild(debugContainer)
    debugContainer = null
  }
  // Clean up injected styles
  const style = document.getElementById('vfx-debug-scrollbar-styles')
  if (style) {
    style.parentNode.removeChild(style)
  }
  currentValues = null
  currentOnChange = null
}

export default { renderDebugPanel, updateDebugPanel, destroyDebugPanel }
