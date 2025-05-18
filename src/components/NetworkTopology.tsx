import { useRef, useState, useEffect, createRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { TrafficFlow } from './TrafficFlow';
import { NetworkTooltip, useTooltipAutoMovement } from './NetworkTooltip';
import { NetworkNode } from './NetworkNode';
import type { NetworkNodeHandle } from './NetworkNode';
import TWEEN from '@tweenjs/tween.js';

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

interface TooltipData {
  position: [number, number, number];
  targetPosition: [number, number, number];
  data: {
    type: 'node';
    title: string;
    details: string[];
  } | {
    type: 'link';
    title: string;
    details: string[];
  };
}

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
  onClick: (sourceId: string, targetId: string) => void;
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

// Camera animation component
const CameraController: React.FC<{
  targetPosition?: [number, number, number];
  tooltipPosition?: [number, number, number];
}> = ({ targetPosition, tooltipPosition }) => {
  const { camera, controls: orbitControls } = useThree();
  const controls = orbitControls as unknown as { target: THREE.Vector3 };
  
  useEffect(() => {
    if (!targetPosition || !tooltipPosition || !controls) return;
    
    // Calculate vectors from center to our points of interest
    const targetVec = new THREE.Vector3(...targetPosition);
    const tooltipVec = new THREE.Vector3(...tooltipPosition);
    
    // Calculate the direction we want to view from
    const midpoint = new THREE.Vector3().addVectors(targetVec, tooltipVec).multiplyScalar(0.5);
    const viewDirection = midpoint.clone().normalize();
    
    // Calculate the camera position - move back along the view direction
    const distance = 25; // Distance from center
    const cameraPosition = viewDirection.multiplyScalar(-distance); // Negative to move back
    
    // Add some height for a better view angle
    cameraPosition.y += 10;
    
    // Create tweens for smooth animation
    const currentPosition = camera.position.clone();
    const posTween = new TWEEN.Tween(currentPosition)
      .to({ x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z }, 1500)
      .easing(TWEEN.Easing.Cubic.InOut)
      .onUpdate(() => {
        camera.position.copy(currentPosition);
      });

    // Always keep the controls target at the center
    controls.target.set(0, 0, 0);

    // Start the animation
    posTween.start();

    // Cleanup
    return () => {
      posTween.stop();
    };
  }, [targetPosition, tooltipPosition, camera, controls]);

  // Animate tweens
  useEffect(() => {
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      TWEEN.update();
    };
    animate();
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  return null;
};

// Add this component before NetworkTopology
const AutoRotate: React.FC = () => {
  const { controls: orbitControls } = useThree();
  const controls = orbitControls as unknown as { target: THREE.Vector3; autoRotate: boolean; autoRotateSpeed: number };
  const lastInteraction = useRef<number>(Date.now());
  const isAutoRotating = useRef<boolean>(true);

  useEffect(() => {
    const handleInteraction = () => {
      lastInteraction.current = Date.now();
      if (controls.autoRotate) {
        controls.autoRotate = false;
        isAutoRotating.current = false;
      }
    };

    // Add event listeners for user interaction
    window.addEventListener('mousedown', handleInteraction);
    window.addEventListener('wheel', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);

    return () => {
      window.removeEventListener('mousedown', handleInteraction);
      window.removeEventListener('wheel', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [controls]);

  useFrame(() => {
    // Check if 5 seconds have passed since last interaction
    if (!isAutoRotating.current && Date.now() - lastInteraction.current > 5000) {
      controls.autoRotate = true;
      isAutoRotating.current = true;
    }
  });

  // Set initial auto-rotation
  useEffect(() => {
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.0;
    }
  }, [controls]);

  return null;
};

export interface NetworkTopologyProps {
  initialData: NetworkData;
}

export const NetworkTopology: React.FC<NetworkTopologyProps> = ({ initialData }) => {
  const SPHERE_RADIUS = 8;
  
  const [networkData, setNetworkData] = useState<NetworkData>({
    ...initialData,
    nodes: initialData.nodes.map(node => ({
      ...node,
      position: [
        node.position[0] * SPHERE_RADIUS,
        node.position[1] * SPHERE_RADIUS,
        node.position[2] * SPHERE_RADIUS
      ]
    }))
  });

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
  const lastInteraction = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const autoTooltipData = useTooltipAutoMovement(networkData.nodes, networkData.links);

  const [isControlsPanelExpanded, setIsControlsPanelExpanded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [selectedTarget, setSelectedTarget] = useState<[number, number, number] | undefined>();
  const [selectedTooltip, setSelectedTooltip] = useState<[number, number, number] | undefined>();

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

  const handleNodeClick = useCallback((nodeId: string) => {
    const node = networkData.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const radius = Math.sqrt(
      node.position[0] * node.position[0] +
      node.position[1] * node.position[1] +
      node.position[2] * node.position[2]
    );

    // Ensure we're setting new positions to trigger the camera animation
    const tooltipPosition = ensureOutsideSphere(node.position, radius);
    setSelectedTarget(node.position);
    setSelectedTooltip(tooltipPosition);
    setHoveredNode(nodeId);
    setHoveredLink(null);
    setAutoTooltip(false);
  }, [networkData.nodes]);

  const handleLinkClick = useCallback((sourceId: string, targetId: string) => {
    const sourceNode = networkData.nodes.find(n => n.id === sourceId);
    const targetNode = networkData.nodes.find(n => n.id === targetId);
    if (!sourceNode || !targetNode) return;

    const sourcePos = new THREE.Vector3(...sourceNode.position);
    const targetPos = new THREE.Vector3(...targetNode.position);
    const radius = sourcePos.length();

    const midpoint: [number, number, number] = [
      (sourceNode.position[0] + targetNode.position[0]) / 2,
      (sourceNode.position[1] + targetNode.position[1]) / 2,
      (sourceNode.position[2] + targetNode.position[2]) / 2,
    ];

    const tooltipPos = ensureOutsideSphere(midpoint, radius);
    const closestPoint = findClosestPointOnGreatCircle(
      sourcePos,
      targetPos,
      new THREE.Vector3(...midpoint),
      radius
    );

    setSelectedTarget([closestPoint.x, closestPoint.y, closestPoint.z]);
    setSelectedTooltip(tooltipPos);
    setHoveredNode(null);
    setHoveredLink({ source: sourceId, target: targetId });
    setAutoTooltip(false);
  }, [networkData.nodes]);

  const getHoverTooltipData = (): TooltipData | null => {
    if (hoveredNode) {
      const node = networkData.nodes.find(n => n.id === hoveredNode);
      if (!node) return null;

      const radius = Math.sqrt(
        node.position[0] * node.position[0] +
        node.position[1] * node.position[1] +
        node.position[2] * node.position[2]
      );

      // Position tooltip outside sphere
      const offsetPosition = ensureOutsideSphere(node.position, radius);

      return {
        position: offsetPosition,
        targetPosition: node.position,
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
      
      const sourcePos = new THREE.Vector3(...sourceNode.position);
      const radius = sourcePos.length();
      
      const midpoint: [number, number, number] = [
        (sourceNode.position[0] + targetNode.position[0]) / 2,
        (sourceNode.position[1] + targetNode.position[1]) / 2,
        (sourceNode.position[2] + targetNode.position[2]) / 2,
      ];
      
      // Position tooltip outside sphere
      const offsetPosition = ensureOutsideSphere(midpoint, radius);
      
      const link = networkData.links.find(
        l => l.source === hoveredLink.source && l.target === hoveredLink.target
      );

      // Find closest point on the curved line
      const closestPoint = findClosestPointOnGreatCircle(
        sourcePos,
        new THREE.Vector3(...targetNode.position),
        new THREE.Vector3(...midpoint),
        radius
      );
      
      return {
        position: offsetPosition,
        targetPosition: [closestPoint.x, closestPoint.y, closestPoint.z] as [number, number, number],
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
        const sourcePos = new THREE.Vector3(...sourceNode.position);
        const targetPos = new THREE.Vector3(...targetNode.position);
        const tooltipPos = new THREE.Vector3(
          (sourceNode.position[0] + targetNode.position[0]) / 2,
          (sourceNode.position[1] + targetNode.position[1]) / 2,
          (sourceNode.position[2] + targetNode.position[2]) / 2
        );
        
        // Find the closest point on the curved line
        const radius = sourcePos.length(); // Assuming all nodes are on same sphere
        const closestPoint = findClosestPointOnGreatCircle(sourcePos, targetPos, tooltipPos, radius);
        
        return [closestPoint.x, closestPoint.y, closestPoint.z] as [number, number, number];
      }
    }
    
    return undefined;
  };

  const tooltipData = autoTooltip ? autoTooltipData : getHoverTooltipData();
  const tooltipTarget = getTooltipTargetPosition();

  useEffect(() => {
    const handleMouseMove = () => {
      lastInteraction.current = Date.now();
      setAutoTooltip(false);
    };

    const handleMouseLeave = () => {
      lastInteraction.current = Date.now();
    };

    const checkInactivity = () => {
      if (Date.now() - lastInteraction.current > 5000) {
        setAutoTooltip(true);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    // Check every second if we should enable auto-tooltip
    const interval = setInterval(checkInactivity, 1000);

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
      clearInterval(interval);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="network-topology-container"
      style={{
        background: isDarkMode ? '#1a1a1a' : '#ffffff',
        transition: 'background 0.3s ease'
      }}
    >
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
        <AutoRotate />
        <CameraController 
          targetPosition={selectedTarget}
          tooltipPosition={selectedTooltip}
        />
        <color attach="background" args={[isDarkMode ? '#1a1a1a' : '#ffffff']} />
        <PerspectiveCamera makeDefault position={[0, 15, 25]} />
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05}
          minDistance={15}
          maxDistance={40}
          target={[0, 0, 0]}
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          makeDefault
          autoRotate={false}
          autoRotateSpeed={1.0}
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
              onClick={handleNodeClick}
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
                  onClick={handleLinkClick}
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
              targetPosition={autoTooltip ? tooltipData.targetPosition : tooltipTarget}
              isDarkMode={isDarkMode}
            />
          )}
        </scene>
      </Canvas>
    </div>
  );
}; 