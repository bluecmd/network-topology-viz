import { useRef, useState, useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface TooltipData {
  type: 'node' | 'link';
  title: string;
  details: string[];
}

interface NetworkTooltipProps {
  position: [number, number, number];
  data: TooltipData;
  visible?: boolean;
  targetPosition?: [number, number, number]; // Position to draw line to
  isDarkMode?: boolean;
}

export function NetworkTooltip({ 
  position, 
  data, 
  visible = true, 
  targetPosition,
  isDarkMode = true
}: NetworkTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Create line geometry if targetPosition is provided
  const lineGeometry = useMemo(() => {
    if (!targetPosition) return null;
    
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      position[0], position[1], position[2],
      targetPosition[0], targetPosition[1], targetPosition[2]
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    return geometry;
  }, [position, targetPosition]);

  return (
    <group>
      {lineGeometry && (
        <>
          {/* Main line */}
          <primitive object={new THREE.Line(
            lineGeometry,
            new THREE.LineBasicMaterial({ 
              color: isDarkMode ? '#ffffff' : '#000000', 
              opacity: isDarkMode ? 0.8 : 0.6, 
              transparent: true,
              linewidth: 3
            })
          )} />
          {/* Glow effect */}
          <primitive object={new THREE.Line(
            lineGeometry,
            new THREE.LineBasicMaterial({ 
              color: isDarkMode ? '#4fc3f7' : '#2196f3',
              opacity: 0.4,
              transparent: true,
              linewidth: 6
            })
          )} />
        </>
      )}
      <Html
        ref={tooltipRef}
        position={position}
        style={{
          display: visible ? 'block' : 'none',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          padding: '160px 200px',
          borderRadius: '64px',
          color: 'white',
          fontSize: '256px',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          boxShadow: '0 32px 128px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          minWidth: '3200px',
          border: '8px solid rgba(255,255,255,0.15)',
          transform: 'translateY(-50%)'
        }}
        transform={false}
        distanceFactor={1}
      >
        <div style={{ 
          fontWeight: 'bold', 
          marginBottom: '120px',
          fontSize: '312px',
          lineHeight: '1.2',
          borderBottom: '12px solid rgba(255,255,255,0.2)',
          paddingBottom: '80px',
          textShadow: '0 8px 16px rgba(0,0,0,0.4)',
          letterSpacing: '4px'
        }}>
          {data.title}
        </div>
        {data.details.map((detail, index) => (
          <div 
            key={index} 
            style={{ 
              fontSize: '256px', 
              opacity: 0.9,
              lineHeight: '1.4',
              marginTop: '80px',
              display: 'flex',
              alignItems: 'center',
              gap: '80px',
              textShadow: '0 8px 16px rgba(0,0,0,0.3)',
              letterSpacing: '2px'
            }}
          >
            <span style={{ 
              width: '96px', 
              height: '96px', 
              borderRadius: '50%', 
              backgroundColor: '#00ff88',
              display: 'inline-block',
              marginRight: '100px',
              boxShadow: '0 0 80px rgba(0,255,136,0.6)',
              border: '8px solid rgba(0,255,136,0.3)'
            }}></span>
            {detail}
          </div>
        ))}
      </Html>
    </group>
  );
}

interface AutoTooltipState {
  position: [number, number, number];
  data: TooltipData;
  targetPosition: [number, number, number];
}

// Function to find closest point on the great circle path
const findClosestPointOnGreatCircle = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  point: THREE.Vector3,
  radius: number
): THREE.Vector3 => {
  // Create a set of points along the great circle path
  const numPoints = 32;
  let closestPoint = new THREE.Vector3();
  let minDistance = Infinity;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const pathPoint = getGreatCirclePoint(start, end, t, radius);
    const distance = point.distanceTo(pathPoint);
    
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint.copy(pathPoint);
    }
  }

  return closestPoint;
};

// Function to get point on great circle path
const getGreatCirclePoint = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  t: number,
  radius: number
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
  
  return point;
};

// Function to ensure position is outside sphere
const ensureOutsideSphere = (
  position: [number, number, number],
  radius: number,
  offset: number = 1.5
): [number, number, number] => {
  const vec = new THREE.Vector3(...position);
  const normalizedVec = vec.normalize();
  const finalVec = normalizedVec.multiplyScalar(radius * offset);
  return [finalVec.x, finalVec.y, finalVec.z];
};

export function useTooltipAutoMovement(
  nodes: { id: string; position: [number, number, number] }[],
  links: { source: string; target: string }[],
  intervalMs: number = 3000
): AutoTooltipState | null {
  const [tooltipData, setTooltipData] = useState<AutoTooltipState | null>(null);
  const currentIndex = useRef(0);

  useEffect(() => {
    if (nodes.length === 0 && links.length === 0) return;

    const moveTooltip = () => {
      const totalPoints = nodes.length + links.length;
      currentIndex.current = (currentIndex.current + 1) % totalPoints;

      if (currentIndex.current < nodes.length) {
        const node = nodes[currentIndex.current];
        const radius = Math.sqrt(
          node.position[0] * node.position[0] +
          node.position[1] * node.position[1] +
          node.position[2] * node.position[2]
        );
        
        // Position tooltip outside sphere
        const offsetPosition = ensureOutsideSphere(node.position, radius);

        setTooltipData({
          position: offsetPosition,
          targetPosition: node.position,
          data: {
            type: 'node',
            title: `Node ${node.id}`,
            details: [
              'Status: Active',
              'Uptime: 99.99%',
              'Load: Normal'
            ]
          }
        });
      } else {
        const linkIndex = currentIndex.current - nodes.length;
        const link = links[linkIndex];
        const sourceNode = nodes.find(n => n.id === link.source);
        const targetNode = nodes.find(n => n.id === link.target);
        
        if (sourceNode && targetNode) {
          const sourcePos = new THREE.Vector3(...sourceNode.position);
          const targetPos = new THREE.Vector3(...targetNode.position);
          const radius = sourcePos.length(); // Assuming all nodes are on same sphere
          
          // Calculate midpoint
          const midpoint: [number, number, number] = [
            (sourceNode.position[0] + targetNode.position[0]) / 2,
            (sourceNode.position[1] + targetNode.position[1]) / 2,
            (sourceNode.position[2] + targetNode.position[2]) / 2
          ];
          
          // Position tooltip outside sphere
          const offsetPosition = ensureOutsideSphere(midpoint, radius);
          
          // Find closest point on the curved line
          const closestPoint = findClosestPointOnGreatCircle(
            sourcePos,
            targetPos,
            new THREE.Vector3(...midpoint),
            radius
          );
          
          setTooltipData({
            position: offsetPosition,
            targetPosition: [closestPoint.x, closestPoint.y, closestPoint.z],
            data: {
              type: 'link',
              title: `Link ${link.source} → ${link.target}`,
              details: [
                'Status: Online',
                'Latency: low',
              ]
            }
          });
        }
      }
    };

    // Initial tooltip position
    moveTooltip();

    const interval = setInterval(moveTooltip, intervalMs);
    return () => clearInterval(interval);
  }, [nodes, links, intervalMs]);

  return tooltipData;
} 