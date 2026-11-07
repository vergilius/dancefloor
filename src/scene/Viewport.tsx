import { Canvas } from '@react-three/fiber';
import { CameraControls, Grid } from '@react-three/drei';

export function Viewport() {
  return (
    <Canvas camera={{ position: [20, 18, 20], fov: 45, near: 0.1, far: 2000 }}>
      <color attach="background" args={['#eef1f4']} />
      <ambientLight intensity={0.8} />
      <Grid args={[100, 100]} cellSize={1} sectionSize={10} infiniteGrid fadeDistance={150} />
      <axesHelper args={[2]} />
      <CameraControls makeDefault />
    </Canvas>
  );
}
