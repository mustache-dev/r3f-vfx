import { Environment } from '@react-three/drei';

export default function SceneLight() {
  return (
    <>
      <directionalLight
        castShadow
        position={[5, 10, 5]}
        intensity={3}
        color={'#ffe7bd'}
        shadow-bias={-0.0001}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={0.1}
        shadow-camera-far={50}
      />
      <ambientLight intensity={0.3} />
      <Environment preset="sunset" background backgroundBlurriness={1} />
    </>
  );
}
