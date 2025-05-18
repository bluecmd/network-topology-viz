import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TrafficFlowProps {
  start: [number, number, number];
  end: [number, number, number];
  intensity: 'low' | 'medium' | 'high';
  color?: string;
  isDarkMode?: boolean;
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
  radius: number,
  offset: THREE.Vector3 | null = null
): THREE.Vector3 => {
  // Create quaternions from the start and end points
  const startQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.clone().normalize());
  const endQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
  
  // Perform spherical interpolation between quaternions
  const slerpQuat = new THREE.Quaternion();
  slerpQuat.slerpQuaternions(startQuat, endQuat, t);
  
  // Create the interpolated point using the quaternion
  const point = new THREE.Vector3(0, 1, 0).applyQuaternion(slerpQuat);
  point.multiplyScalar(radius);

  // Apply offset if provided
  if (offset) {
    // Create a perpendicular vector for consistent offset direction
    const tangent = end.clone().sub(start).normalize();
    const perpendicular = new THREE.Vector3().crossVectors(point, tangent).normalize();
    point.add(perpendicular.multiplyScalar(offset.length() * 0.1)); // Reduced offset scale
    // Project back onto sphere surface
    point.normalize().multiplyScalar(radius);
  }
  
  return point;
};

// Function to create a random offset vector for particle spread
const createRandomOffset = (maxOffset: number): THREE.Vector3 => {
  return new THREE.Vector3(
    (Math.random() - 0.5) * maxOffset,
    (Math.random() - 0.5) * maxOffset,
    (Math.random() - 0.5) * maxOffset
  );
};

export const TrafficFlow: React.FC<TrafficFlowProps> = ({ 
  start, 
  end, 
  intensity,
  isDarkMode = true
}) => {
  const points = useRef<THREE.Points>(null);
  const startVec = useMemo(() => new THREE.Vector3(...start), [start]);
  const endVec = useMemo(() => new THREE.Vector3(...end), [end]);
  const lastTime = useRef<number>(0);
  const progress = useRef<Float32Array>(null);
  const offsets = useRef<THREE.Vector3[]>(null);
  const { count, speed, size } = getIntensityParams(intensity);
    
  // Calculate sphere radius from start point
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
        createRandomOffset(0.5)
      );
    }
    
    for (let i = 0; i < count; i++) {
      const point = getGreatCirclePoint(
        startVec,
        endVec,
        progress.current[i],
        sphereRadius,
        offsets.current[i]
      );
      
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
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
        offsets.current[i] = createRandomOffset(0.5);
      }

      const point = getGreatCirclePoint(
        startVec,
        endVec,
        progress.current[i],
        sphereRadius,
        offsets.current[i]
      );

      const idx = i * 3;
      positions[idx] = point.x;
      positions[idx + 1] = point.y;
      positions[idx + 2] = point.z;
    }

    points.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={particles.geometry}>
      <pointsMaterial
        color={'#0068ff'}
        size={size}
        transparent
        opacity={isDarkMode ? 0.8 : 0.2}
        blending={isDarkMode ? THREE.AdditiveBlending : THREE.NormalBlending}
        depthWrite={false}
      />
    </points>
  );
}; 