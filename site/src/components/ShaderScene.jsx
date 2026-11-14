import { ShaderGradient, ShaderGradientCanvas } from '@shadergradient/react'

const presets = {
  fog: {
    color1: '#342547',
    color2: '#09080c',
    color3: '#37243b',
    brightness: 0.7,
    uSpeed: 0.06,
    uStrength: 0.9,
    uDensity: 1.25,
    uFrequency: 4.6,
  },
  aurora: {
    color1: '#3e2755',
    color2: '#08070c',
    color3: '#442840',
    brightness: 0.9,
    uSpeed: 0.11,
    uStrength: 1.2,
    uDensity: 1.4,
    uFrequency: 5.4,
  },
}

export default function ShaderScene({ atmosphere }) {
  const preset = presets[atmosphere] ?? presets.fog

  return (
    <ShaderGradientCanvas
      className="backdrop-canvas"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      pixelDensity={1}
      fov={45}
      pointerEvents="none"
      powerPreference="low-power"
    >
      <ShaderGradient
        key={atmosphere}
        control="props"
        type="plane"
        animate="on"
        color1={preset.color1}
        color2={preset.color2}
        color3={preset.color3}
        brightness={preset.brightness}
        uSpeed={preset.uSpeed}
        uStrength={preset.uStrength}
        uDensity={preset.uDensity}
        uFrequency={preset.uFrequency}
        uAmplitude={0.1}
        grain="on"
        grainBlending={0.08}
        lightType="env"
        envPreset="city"
        reflection={0.08}
        range="disabled"
        cAzimuthAngle={160}
        cPolarAngle={82}
        cDistance={4.2}
        cameraZoom={1}
        enableCameraUpdate={false}
        enableTransition={false}
        zoomOut={false}
        toggleAxis={false}
        positionX={0}
        positionY={0}
        positionZ={0}
        rotationX={0}
        rotationY={0}
        rotationZ={0}
      />
    </ShaderGradientCanvas>
  )
}
