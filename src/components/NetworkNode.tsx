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
  const { scene } = useGLTF('data_center_rack.glb');
  
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

  // Calculate rotation to face outward from sphere center
  const calculateRotation = () => {
    const pos = new THREE.Vector3(...position);
    const up = new THREE.Vector3(0, 1, 0);
    
    // Create a rotation matrix that orients the model to face outward
    const lookAt = new THREE.Matrix4();
    lookAt.lookAt(new THREE.Vector3(0, 0, 0), pos, up);
    
    // Convert to Euler angles
    const rotation = new THREE.Euler();
    rotation.setFromRotationMatrix(lookAt);
    
    // Add an additional rotation to make the model face outward instead of inward
    rotation.y += Math.PI;
    
    return rotation;
  };

  const rotation = calculateRotation();

  useFrame((state) => {
    if (groupRef.current) {
      // Get the current position vector
      const pos = new THREE.Vector3(...position);
      
      // Add floating motion along the radius
      const t = state.clock.getElapsedTime();
      const floatOffset = Math.sin(t * 0.5) * 0.1;
      const normalizedPos = pos.normalize();
      
      // Apply floating motion along the radius
      groupRef.current.position.set(
        position[0] + normalizedPos.x * floatOffset,
        position[1] + normalizedPos.y * floatOffset,
        position[2] + normalizedPos.z * floatOffset
      );
    }
  });

  return (
    <group 
      ref={groupRef}
      position={position}
      rotation={[rotation.x, rotation.y, rotation.z]}
      scale={[scale, scale, scale]}
      onPointerEnter={() => onHover(id)}
      onPointerLeave={() => onHover(null)}
    >
      <primitive 
        object={model} 
        // Add a slight tilt to make it more visually interesting
        rotation={[1.5, 0.5, 0]}
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
useGLTF.preload('data_center_rack.glb'); 