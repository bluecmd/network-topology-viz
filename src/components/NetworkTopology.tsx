import { useRef, useState, useEffect, createRef } from 'react';
import type { RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
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

const NetworkLink: React.FC<{ 
  start: THREE.Vector3;
  end: THREE.Vector3;
  trafficIntensity: 'low' | 'medium' | 'high';
  sourceId: string;
  targetId: string;
  onHover: (sourceId: string, targetId: string | null) => void;
}> = ({
  start,
  end,
  trafficIntensity,
  sourceId,
  targetId,
  onHover
}) => {
  const points = [start, end];
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  return (
    <group
      position={midpoint}
      onPointerEnter={() => onHover(sourceId, targetId)}
      onPointerLeave={() => onHover(sourceId, null)}
    >
      <primitive object={new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: '#ffffff', linewidth: 2, opacity: 0.3, transparent: true })
      )} position={midpoint.clone().multiplyScalar(-1)} />
      <TrafficFlow 
        start={[
          start.x - midpoint.x,
          start.y - midpoint.y,
          start.z - midpoint.z
        ]}
        end={[
          end.x - midpoint.x,
          end.y - midpoint.y,
          end.z - midpoint.z
        ]}
        intensity={trafficIntensity}
      />
    </group>
  );
};

export const NetworkTopology: React.FC = () => {
  const [networkData, setNetworkData] = useState<NetworkData>({
    nodes: [
      // Core mesh nodes (in a square formation)
      { id: 'core1', position: [-2, 2, -2] },
      { id: 'core2', position: [2, 2, -2] },
      { id: 'core3', position: [-2, 2, 2] },
      { id: 'core4', position: [2, 2, 2] },
      
      // Chain 1 extending from core1
      { id: 'chain1-1', position: [-4, 0, -4] },
      { id: 'chain1-2', position: [-6, 0, -6] },
      
      // Chain 2 extending from core4
      { id: 'chain2-1', position: [4, 0, 4] },
      { id: 'chain2-2', position: [6, 0, 6] },
    ],
    links: [
      // Full mesh between core nodes
      { source: 'core1', target: 'core2', trafficIntensity: 'high' },
      { source: 'core1', target: 'core3', trafficIntensity: 'high' },
      { source: 'core1', target: 'core4', trafficIntensity: 'high' },
      { source: 'core2', target: 'core3', trafficIntensity: 'high' },
      { source: 'core2', target: 'core4', trafficIntensity: 'high' },
      { source: 'core3', target: 'core4', trafficIntensity: 'high' },
      
      // Chain 1 links
      { source: 'core1', target: 'chain1-1', trafficIntensity: 'medium' },
      { source: 'chain1-1', target: 'chain1-2', trafficIntensity: 'low' },
      
      // Chain 2 links
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

  const tooltipData = autoTooltip ? autoTooltipData : getHoverTooltipData();

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
        <PerspectiveCamera makeDefault position={[0, 10, 15]} />
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={30}
        />
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
            />
          )}
        </scene>
      </Canvas>
    </div>
  );
}; 