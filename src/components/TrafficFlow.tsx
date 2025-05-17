import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TrafficFlowProps {
  start: [number, number, number];
  end: [number, number, number];
  intensity: 'low' | 'medium' | 'high';
  color?: string;
}

const getIntensityParams = (intensity: 'low' | 'medium' | 'high') => {
  switch (intensity) {
    case 'low':
      return { count: 10, speed: 0.1, size: 0.05 };
    case 'medium':
      return { count: 20, speed: 0.2, size: 0.08 };
    case 'high':
      return { count: 40, speed: 0.5, size: 0.1 };
  }
};

// Function to create a random control point for the parabolic path
const createRandomControlPoint = (start: [number, number, number], end: [number, number, number]): THREE.Vector3 => {
  const midPoint = new THREE.Vector3(
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2
  );
  
  // Calculate direction vector between points to create perpendicular offset
  const direction = new THREE.Vector3(
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2]
  ).normalize();

  // Create a random perpendicular vector for balanced distribution
  const perpVector = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5
  ).normalize();
  perpVector.crossVectors(perpVector, direction);
  
  // Add random offset in all directions
  const randomOffset = 2; // Maximum offset distance
  return new THREE.Vector3(
    midPoint.x + perpVector.x * randomOffset * (Math.random() - 0.5) * 2,
    midPoint.y + perpVector.y * randomOffset * (Math.random() - 0.5) * 2,
    midPoint.z + perpVector.z * randomOffset * (Math.random() - 0.5) * 2
  );
};

// Function to get point on quadratic Bezier curve
const getQuadraticBezierPoint = (
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  t: number
): THREE.Vector3 => {
  const point = new THREE.Vector3();
  point.x = Math.pow(1 - t, 2) * start.x + 2 * (1 - t) * t * control.x + Math.pow(t, 2) * end.x;
  point.y = Math.pow(1 - t, 2) * start.y + 2 * (1 - t) * t * control.y + Math.pow(t, 2) * end.y;
  point.z = Math.pow(1 - t, 2) * start.z + 2 * (1 - t) * t * control.z + Math.pow(t, 2) * end.z;
  return point;
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
  const controlPoints = useRef<THREE.Vector3[]>(null);
  const { count, speed, size } = getIntensityParams(intensity);

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    
    // Initialize progress if not already done
    if (!progress.current || progress.current.length !== count) {
      progress.current = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        progress.current[i] = Math.random();
      }
    }

    // Initialize control points if not already done
    if (!controlPoints.current || controlPoints.current.length !== count) {
      controlPoints.current = Array(count).fill(null).map(() => 
        createRandomControlPoint(start, end)
      );
    }
    
    for (let i = 0; i < count; i++) {
      // Use existing control point
      const point = getQuadraticBezierPoint(
        startVec,
        controlPoints.current[i],
        endVec,
        progress.current[i]
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
  }, [start, end, count, startVec, endVec]);

  useFrame((state) => {
    if (!points.current || !progress.current || !controlPoints.current) return;

    // Get actual time delta
    const time = state.clock.getElapsedTime();
    const delta = lastTime.current === 0 ? 0 : time - lastTime.current;
    lastTime.current = time;

    const positions = points.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      // Update progress based on actual time delta
      progress.current[i] += speed * delta;
      if (progress.current[i] > 1) progress.current[i] = 0;

      const point = getQuadraticBezierPoint(
        startVec,
        controlPoints.current[i],
        endVec,
        progress.current[i]
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