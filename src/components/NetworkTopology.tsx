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
  isDarkMode?: boolean;
}> = ({
  start,
  end,
  trafficIntensity,
  sourceId,
  targetId,
  onHover,
  isHighlighted = false,
  isDarkMode = true
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
          color: isDarkMode ? '#ffffff' : '#000000', 
          linewidth: 2, 
          opacity: isHighlighted ? 0.8 : isDarkMode ? 0.3 : 0.4, 
          transparent: true 
        })
      )} />
      <TrafficFlow 
        start={[start.x, start.y, start.z]}
        end={[end.x, end.y, end.z]}
        intensity={trafficIntensity}
        isDarkMode={isDarkMode}
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

  const [isControlsPanelExpanded, setIsControlsPanelExpanded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

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
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      position: 'relative',
      background: isDarkMode ? '#1a1a1a' : '#ffffff',
      transition: 'background 0.3s ease'
    }}>
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
        borderRadius: 8,
        color: isDarkMode ? 'white' : 'black',
        zIndex: 1000,
        transition: 'all 0.3s ease',
        width: isControlsPanelExpanded ? 'auto' : '48px',
        height: isControlsPanelExpanded ? 'auto' : '48px',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: isDarkMode 
          ? '0 4px 12px rgba(0,0,0,0.3)' 
          : '0 4px 12px rgba(0,0,0,0.1)',
      }}>
        <div 
          style={{
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderBottom: isControlsPanelExpanded 
              ? isDarkMode 
                ? '1px solid rgba(255,255,255,0.2)'
                : '1px solid rgba(0,0,0,0.1)'
              : 'none',
          }}
          onClick={() => setIsControlsPanelExpanded(!isControlsPanelExpanded)}
        >
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{
              transform: isControlsPanelExpanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.3s ease'
            }}
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
          <span style={{ 
            whiteSpace: 'nowrap',
            opacity: isControlsPanelExpanded ? 1 : 0,
            transition: 'opacity 0.3s ease'
          }}>
            Network Controls
          </span>
        </div>
        
        <div style={{
          padding: isControlsPanelExpanded ? '20px' : '0',
          opacity: isControlsPanelExpanded ? 1 : 0,
          transition: 'all 0.3s ease',
        }}>
          <div style={{ 
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: 'space-between'
          }}>
            <span>Theme</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDarkMode(!isDarkMode);
              }}
              style={{
                background: 'none',
                border: isDarkMode 
                  ? '1px solid rgba(255,255,255,0.3)'
                  : '1px solid rgba(0,0,0,0.2)',
                borderRadius: '20px',
                padding: '4px 12px',
                color: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease'
              }}
            >
              {isDarkMode ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              {isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>

          <div style={{ marginBottom: 15 }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              color: isDarkMode ? 'white' : 'black'
            }}>
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
                  background: isDarkMode ? '#333' : '#f0f0f0',
                  color: isDarkMode ? 'white' : 'black',
                  border: isDarkMode 
                    ? '1px solid #666'
                    : '1px solid #ccc',
                  padding: '4px 8px',
                  borderRadius: 4,
                  marginTop: 4,
                  width: '100%',
                }}
              >
                <option value="low">Low Traffic</option>
                <option value="medium">Medium Traffic</option>
                <option value="high">High Traffic</option>
              </select>
            </div>
          ))}
        </div>
      </div>
      <Canvas>
        <color attach="background" args={[isDarkMode ? '#1a1a1a' : '#ffffff']} />
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
            color={isDarkMode ? "#35393f" : "#e3f2fd"}
            transparent
            opacity={0.1}
            wireframe
          />
        </Sphere>
        
        {/* Ambient glow for the sphere */}
        <pointLight 
          position={[0, 0, 0]} 
          intensity={isDarkMode ? 2 : 1} 
          color={isDarkMode ? "#4fc3f7" : "#2196f3"} 
          distance={SPHERE_RADIUS * 2} 
        />
        
        {/* Main lighting setup */}
        <ambientLight intensity={isDarkMode ? 0.6 : 0.8} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={isDarkMode ? 8 : 4}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          color={isDarkMode ? "#ffffff" : "#fafafa"}
        />
        <directionalLight
          position={[-10, 5, -5]}
          intensity={isDarkMode ? 1 : 0.5}
          color={isDarkMode ? "#7ab8ff" : "#bbdefb"}
        />
        <directionalLight
          position={[0, -5, -10]}
          intensity={isDarkMode ? 0.4 : 0.2}
          color={isDarkMode ? "#e4b5ff" : "#f3e5f5"}
        />
        <hemisphereLight
          intensity={isDarkMode ? 0.4 : 0.6}
          color={isDarkMode ? "#ffffff" : "#e3f2fd"}
          groundColor={isDarkMode ? "#444444" : "#eceff1"}
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
                  isDarkMode={isDarkMode}
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
              isDarkMode={isDarkMode}
            />
          )}
        </scene>
      </Canvas>
    </div>
  );
}; 