import { useRef, useState, useEffect, createRef } from 'react';
import type { RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { TrafficFlow } from './TrafficFlow';
import { NetworkTooltip, useTooltipAutoMovement } from './NetworkTooltip';
import { NetworkNode } from './NetworkNode';
import type { NetworkNodeHandle } from './NetworkNode';

interface Node {
  id: string;
  position: [number, number, number];
}

interface Link {
  source: string;
  target: string;
  trafficIntensity: 'low' | 'medium' | 'high';
}

interface NetworkData {
  nodes: Node[];
  links: Link[];
}

// Function to distribute points evenly on a sphere's surface
const distributePointsOnSphere = (count: number, radius: number): [number, number, number][] => {
  const points: [number, number, number][] = [];
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle in radians

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
    const radius_at_y = Math.sqrt(1 - y * y); // radius at y
    
    const theta = phi * i; // golden angle increment

    const x = Math.cos(theta) * radius_at_y;
    const z = Math.sin(theta) * radius_at_y;

    points.push([x * radius, y * radius, z * radius]);
  }

  return points;
};

const SEGMENTS_PER_CURVE = 32; // Number of segments to create smooth curves

// Quaternion-based spherical interpolation for accurate great circle paths
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

const NetworkLink: React.FC<{ 
  start: THREE.Vector3;
  end: THREE.Vector3;
  trafficIntensity: 'low' | 'medium' | 'high';
  sourceId: string;
  targetId: string;
  onHover: (sourceId: string, targetId: string | null) => void;
  isHighlighted?: boolean;
}> = ({
  start,
  end,
  trafficIntensity,
  sourceId,
  targetId,
  onHover,
  isHighlighted = false
}) => {
  // Calculate sphere radius from start point (assuming both points are on same sphere)
  const radius = start.length();
  
  // Create points along the great circle path
  const curvePoints: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGMENTS_PER_CURVE; i++) {
    const t = i / SEGMENTS_PER_CURVE;
    const point = getGreatCirclePoint(start, end, t, radius);
    curvePoints.push(point);
  }
  
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);

  return (
    <group
      onPointerEnter={() => onHover(sourceId, targetId)}
      onPointerLeave={() => onHover(sourceId, null)}
    >
      <primitive object={new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ 
          color: '#ffffff', 
          linewidth: 2, 
          opacity: isHighlighted ? 0.8 : 0.3, 
          transparent: true 
        })
      )} />
      <TrafficFlow 
        start={[start.x, start.y, start.z]}
        end={[end.x, end.y, end.z]}
        intensity={trafficIntensity}
      />
    </group>
  );
};

export const NetworkTopology: React.FC = () => {
  const SPHERE_RADIUS = 8;
  const positions = distributePointsOnSphere(8, SPHERE_RADIUS);
  
  const [networkData, setNetworkData] = useState<NetworkData>({
    nodes: [
      // Nodes distributed on sphere surface
      { id: 'core1', position: positions[0] },
      { id: 'core2', position: positions[1] },
      { id: 'core3', position: positions[2] },
      { id: 'core4', position: positions[3] },
      { id: 'chain1-1', position: positions[4] },
      { id: 'chain1-2', position: positions[5] },
      { id: 'chain2-1', position: positions[6] },
      { id: 'chain2-2', position: positions[7] },
    ],
    links: [
      // Full mesh between core nodes
      { source: 'core1', target: 'core2', trafficIntensity: 'high' },
      { source: 'core1', target: 'core3', trafficIntensity: 'high' },
      { source: 'core1', target: 'core4', trafficIntensity: 'high' },
      { source: 'core2', target: 'core3', trafficIntensity: 'high' },
      { source: 'core2', target: 'core4', trafficIntensity: 'high' },
      { source: 'core3', target: 'core4', trafficIntensity: 'high' },
      
      // Chain links
      { source: 'core1', target: 'chain1-1', trafficIntensity: 'medium' },
      { source: 'chain1-1', target: 'chain1-2', trafficIntensity: 'low' },
      { source: 'core4', target: 'chain2-1', trafficIntensity: 'medium' },
      { source: 'chain2-1', target: 'chain2-2', trafficIntensity: 'low' },
    ],
  });

  // Create refs map at component level
  const nodeRefs = useRef<Map<string, RefObject<NetworkNodeHandle | null>>>(
    new Map(networkData.nodes.map(node => [
      node.id,
      createRef<NetworkNodeHandle | null>()
    ]))
  );

  const [nodePositions, setNodePositions] = useState<Map<string, THREE.Vector3>>(new Map());

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<{ source: string; target: string } | null>(null);
  const [autoTooltip, setAutoTooltip] = useState(true);

  const autoTooltipData = useTooltipAutoMovement(networkData.nodes, networkData.links);

  // Update node positions
  useEffect(() => {
    const updatePositions = () => {
      const newPositions = new Map<string, THREE.Vector3>();
      nodeRefs.current.forEach((ref, id) => {
        if (ref.current) {
          newPositions.set(id, ref.current.getCenter());
        }
      });
      setNodePositions(newPositions);
    };

    // Update positions every frame
    const interval = setInterval(updatePositions, 16); // ~60fps
    return () => clearInterval(interval);
  }, []);

  const updateTrafficIntensity = (sourceId: string, targetId: string, intensity: 'low' | 'medium' | 'high') => {
    setNetworkData(prev => ({
      ...prev,
      links: prev.links.map(link => 
        link.source === sourceId && link.target === targetId
          ? { ...link, trafficIntensity: intensity }
          : link
      )
    }));
  };

  const handleNodeHover = (nodeId: string | null) => {
    if (autoTooltip) return;
    setHoveredNode(nodeId);
    setHoveredLink(null);
  };

  const handleLinkHover = (sourceId: string, targetId: string | null) => {
    if (autoTooltip) return;
    setHoveredNode(null);
    setHoveredLink(targetId ? { source: sourceId, target: targetId } : null);
  };

  const getHoverTooltipData = () => {
    if (hoveredNode) {
      const node = networkData.nodes.find(n => n.id === hoveredNode);
      if (!node) return null;
      return {
        position: node.position,
        data: {
          type: 'node' as const,
          title: `Node ${node.id}`,
          details: [
            'Status: Active',
            'Uptime: 99.9%',
            'Load: Normal'
          ]
        }
      };
    }
    
    if (hoveredLink) {
      const sourceNode = networkData.nodes.find(n => n.id === hoveredLink.source);
      const targetNode = networkData.nodes.find(n => n.id === hoveredLink.target);
      if (!sourceNode || !targetNode) return null;
      
      const midpoint: [number, number, number] = [
        (sourceNode.position[0] + targetNode.position[0]) / 2,
        (sourceNode.position[1] + targetNode.position[1]) / 2,
        (sourceNode.position[2] + targetNode.position[2]) / 2,
      ];
      
      const link = networkData.links.find(
        l => l.source === hoveredLink.source && l.target === hoveredLink.target
      );
      
      return {
        position: midpoint,
        data: {
          type: 'link' as const,
          title: `Link ${hoveredLink.source} → ${hoveredLink.target}`,
          details: [
            'Status: Connected',
            'Latency: 5ms',
            `Traffic: ${link?.trafficIntensity || 'unknown'}`
          ]
        }
      };
    }
    
    return null;
  };

  const getTooltipTargetPosition = (): [number, number, number] | undefined => {
    if (hoveredNode) {
      const node = networkData.nodes.find(n => n.id === hoveredNode);
      if (node) return node.position;
    }
    
    if (hoveredLink) {
      const sourceNode = networkData.nodes.find(n => n.id === hoveredLink.source);
      const targetNode = networkData.nodes.find(n => n.id === hoveredLink.target);
      if (sourceNode && targetNode) {
        // Return midpoint of the link
        return [
          (sourceNode.position[0] + targetNode.position[0]) / 2,
          (sourceNode.position[1] + targetNode.position[1]) / 2,
          (sourceNode.position[2] + targetNode.position[2]) / 2,
        ];
      }
    }
    
    return undefined;
  };

  const tooltipData = autoTooltip ? autoTooltipData : getHoverTooltipData();
  const tooltipTarget = getTooltipTargetPosition();

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'rgba(0,0,0,0.8)',
        padding: 20,
        borderRadius: 8,
        color: 'white',
        zIndex: 1000,
      }}>
        <h3 style={{ marginBottom: 10 }}>Network Controls</h3>
        <div style={{ marginBottom: 15 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={autoTooltip}
              onChange={(e) => setAutoTooltip(e.target.checked)}
            />
            Auto-moving tooltip
          </label>
        </div>
        <h4 style={{ marginBottom: 8 }}>Traffic Intensity</h4>
        {networkData.links.map((link) => (
          <div key={`${link.source}-${link.target}`} style={{ marginBottom: 10 }}>
            <div>Link {link.source} → {link.target}</div>
            <select
              value={link.trafficIntensity}
              onChange={(e) => updateTrafficIntensity(
                link.source, 
                link.target, 
                e.target.value as 'low' | 'medium' | 'high'
              )}
              style={{
                background: '#333',
                color: 'white',
                border: '1px solid #666',
                padding: '4px 8px',
                borderRadius: 4,
                marginTop: 4,
              }}
            >
              <option value="low">Low Traffic</option>
              <option value="medium">Medium Traffic</option>
              <option value="high">High Traffic</option>
            </select>
          </div>
        ))}
      </div>
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 15, 25]} />
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05}
          minDistance={15}
          maxDistance={40}
          target={[0, 0, 0]}
        />
        
        {/* Core sphere */}
        <Sphere args={[SPHERE_RADIUS, 64, 64]}>
          <meshPhongMaterial
            color="#1a237e"
            transparent
            opacity={0.1}
            wireframe
          />
        </Sphere>
        
        {/* Ambient glow for the sphere */}
        <pointLight position={[0, 0, 0]} intensity={2} color="#4fc3f7" distance={SPHERE_RADIUS * 2} />
        
        {/* Main lighting setup */}
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          color="#ffffff"
        />
        <directionalLight
          position={[-10, 5, -5]}
          intensity={1}
          color="#7ab8ff"
        />
        <directionalLight
          position={[0, -5, -10]}
          intensity={0.4}
          color="#e4b5ff"
        />
        <hemisphereLight
          intensity={0.4}
          color="#ffffff"
          groundColor="#444444"
        />
        <scene>
          {networkData.nodes.map((node) => (
            <NetworkNode
              key={node.id}
              ref={nodeRefs.current.get(node.id)}
              position={node.position}
              id={node.id}
              onHover={handleNodeHover}
              scale={0.8}
              isHighlighted={hoveredNode === node.id}
            />
          ))}
          {networkData.links.map((link) => {
            const sourcePos = nodePositions.get(link.source);
            const targetPos = nodePositions.get(link.target);
            if (sourcePos && targetPos) {
              return (
                <NetworkLink
                  key={`${link.source}-${link.target}`}
                  start={sourcePos}
                  end={targetPos}
                  trafficIntensity={link.trafficIntensity}
                  sourceId={link.source}
                  targetId={link.target}
                  onHover={handleLinkHover}
                  isHighlighted={hoveredLink?.source === link.source && hoveredLink?.target === link.target}
                />
              );
            }
            return null;
          })}
          {tooltipData && (
            <NetworkTooltip
              position={tooltipData.position}
              data={tooltipData.data}
              visible={true}
              targetPosition={tooltipTarget}
            />
          )}
        </scene>
      </Canvas>
    </div>
  );
}; 