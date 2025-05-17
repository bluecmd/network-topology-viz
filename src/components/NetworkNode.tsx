import { useRef, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface NetworkNodeProps {
  position: [number, number, number];
  id: string;
  onHover: (id: string | null) => void;
  scale?: number;
}

export interface NetworkNodeHandle {
  getCenter: () => THREE.Vector3;
}

export const NetworkNode = forwardRef<NetworkNodeHandle, NetworkNodeProps>(({ 
  position, 
  id, 
  onHover,
  scale = 1 
}, ref) => {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('vintage_terminal.glb');
  
  // Clone the scene to avoid sharing materials between instances
  const model = scene.clone(true);

  useImperativeHandle(ref, () => ({
    getCenter: () => {
      if (!groupRef.current) return new THREE.Vector3(...position);
      
      // Calculate the center of the model in world space
      const center = new THREE.Vector3();
      const boundingBox = new THREE.Box3().setFromObject(groupRef.current);
      boundingBox.getCenter(center);
      return center;
    }
  }));

  useFrame((state) => {
    if (groupRef.current) {
      
      // Floating motion
      const t = state.clock.getElapsedTime();
      groupRef.current.position.y = position[1] + Math.sin(t * 0.5) * 0.1;
    }
  });

  return (
    <group 
      ref={groupRef}
      position={position}
      scale={[scale, scale, scale]}
      onPointerEnter={() => onHover(id)}
      onPointerLeave={() => onHover(null)}
    >
      <primitive 
        object={model} 
        // Add a slight tilt to make it more visually interesting
        rotation={[0, 0.5, 0]}
        scale={[0.5,0.5,0.5]}
      />
      {/* Add a subtle glow effect */}
      <pointLight
        color="#00ff88"
        intensity={1}
        distance={2}
        decay={2}
      />
    </group>
  );
});

// Preload the model to avoid loading delays
useGLTF.preload('vintage_terminal.glb'); 