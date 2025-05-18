import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TrafficFlowProps {
  start: [number, number, number];
  end: [number, number, number];
  intensity: 'low' | 'medium' | 'high';
  color?: string;
}

interface IntensityParams {
  count: number;
  speed: number;
  size: number;
}

const getIntensityParams = (intensity: 'low' | 'medium' | 'high'): IntensityParams => ({
  count: intensity === 'low' ? 20 : intensity === 'medium' ? 40 : 60,
  speed: intensity === 'low' ? 0.3 : intensity === 'medium' ? 0.5 : 0.7,
  size: intensity === 'low' ? 0.1 : intensity === 'medium' ? 0.15 : 0.2,
});

// Function to get point on great circle path between two points on a sphere
const getGreatCirclePoint = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  t: number,
  radius: number
): THREE.Vector3 => {
  // Normalize the vectors to get points on unit sphere
  const startNorm = start.clone().normalize();
  const endNorm = end.clone().normalize();
  
  // Calculate the angle between vectors
  const angle = startNorm.angleTo(endNorm);
  
  // Use spherical interpolation (slerp)
  const point = new THREE.Vector3().lerpVectors(startNorm, endNorm, t);
  point.normalize().multiplyScalar(radius);
  
  return point;
};

// Function to create a random offset vector for particle spread
const createRandomOffset = (start: THREE.Vector3, end: THREE.Vector3, maxOffset: number): THREE.Vector3 => {
  const direction = end.clone().sub(start).normalize();
  const perpVector = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5
  ).normalize();
  perpVector.crossVectors(perpVector, direction);
  
  return perpVector.multiplyScalar(maxOffset * (Math.random() - 0.5));
};

export const TrafficFlow: React.FC<TrafficFlowProps> = ({ 
  start, 
  end, 
  intensity,
  color = '#00ff88'
}) => {
  const points = useRef<THREE.Points>(null);
  const startVec = useMemo(() => new THREE.Vector3(...start), [start]);
  const endVec = useMemo(() => new THREE.Vector3(...end), [end]);
  const lastTime = useRef<number>(0);
  const progress = useRef<Float32Array>(null);
  const offsets = useRef<THREE.Vector3[]>(null);
  const { count, speed, size } = getIntensityParams(intensity);
  
  // Calculate sphere radius from start point (assuming both points are on same sphere)
  const sphereRadius = useMemo(() => startVec.length(), [startVec]);

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    
    // Initialize progress if not already done
    if (!progress.current || progress.current.length !== count) {
      progress.current = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        progress.current[i] = Math.random();
      }
    }

    // Initialize offsets if not already done
    if (!offsets.current || offsets.current.length !== count) {
      offsets.current = Array(count).fill(null).map(() => 
        createRandomOffset(startVec, endVec, 0.5)
      );
    }
    
    for (let i = 0; i < count; i++) {
      const basePoint = getGreatCirclePoint(
        startVec,
        endVec,
        progress.current[i],
        sphereRadius
      );
      
      // Apply offset
      const offsetPoint = basePoint.clone().add(offsets.current[i]);
      // Project back onto sphere surface
      offsetPoint.normalize().multiplyScalar(sphereRadius);
      
      positions[i * 3] = offsetPoint.x;
      positions[i * 3 + 1] = offsetPoint.y;
      positions[i * 3 + 2] = offsetPoint.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    return {
      positions,
      geometry
    };
  }, [start, end, count, startVec, endVec, sphereRadius]);

  useFrame((state) => {
    if (!points.current || !progress.current || !offsets.current) return;

    const time = state.clock.getElapsedTime();
    const delta = lastTime.current === 0 ? 0 : time - lastTime.current;
    lastTime.current = time;

    const positions = points.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      progress.current[i] += speed * delta;
      if (progress.current[i] > 1) {
        progress.current[i] = 0;
        // Generate new random offset when particle restarts
        offsets.current[i] = createRandomOffset(startVec, endVec, 0.5);
      }

      const basePoint = getGreatCirclePoint(
        startVec,
        endVec,
        progress.current[i],
        sphereRadius
      );
      
      // Apply offset and project back onto sphere
      const offsetPoint = basePoint.clone().add(offsets.current[i]);
      offsetPoint.normalize().multiplyScalar(sphereRadius);

      const idx = i * 3;
      positions[idx] = offsetPoint.x;
      positions[idx + 1] = offsetPoint.y;
      positions[idx + 2] = offsetPoint.z;
    }

    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={particles.geometry}>
      <pointsMaterial
        color={color}
        size={size}
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}; 