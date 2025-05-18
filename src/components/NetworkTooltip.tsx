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
}

export function NetworkTooltip({ position, data, visible = true, targetPosition }: NetworkTooltipProps) {
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
        <primitive object={new THREE.Line(
          lineGeometry,
          new THREE.LineBasicMaterial({ 
            color: '#ffffff', 
            opacity: 0.4, 
            transparent: true,
            linewidth: 1
          })
        )} />
      )}
      <Html
        ref={tooltipRef}
        position={position}
        style={{
          display: visible ? 'block' : 'none',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          padding: '80px 100px',
          borderRadius: '32px',
          color: 'white',
          fontSize: '128px',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          minWidth: '1600px',
          border: '4px solid rgba(255,255,255,0.15)',
          transform: 'translateY(-50%)'
        }}
        transform={false}
        distanceFactor={1}
      >
        <div style={{ 
          fontWeight: 'bold', 
          marginBottom: '60px',
          fontSize: '156px',
          lineHeight: '1.2',
          borderBottom: '6px solid rgba(255,255,255,0.2)',
          paddingBottom: '40px',
          textShadow: '0 4px 8px rgba(0,0,0,0.4)',
          letterSpacing: '2px'
        }}>
          {data.title}
        </div>
        {data.details.map((detail, index) => (
          <div 
            key={index} 
            style={{ 
              fontSize: '128px', 
              opacity: 0.9,
              lineHeight: '1.4',
              marginTop: '40px',
              display: 'flex',
              alignItems: 'center',
              gap: '40px',
              textShadow: '0 4px 8px rgba(0,0,0,0.3)',
              letterSpacing: '1px'
            }}
          >
            <span style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '50%', 
              backgroundColor: '#00ff88',
              display: 'inline-block',
              marginRight: '50px',
              boxShadow: '0 0 40px rgba(0,255,136,0.6)',
              border: '4px solid rgba(0,255,136,0.3)'
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
}

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
        setTooltipData({
          position: node.position,
          data: {
            type: 'node',
            title: `Node ${node.id}`,
            details: [
              'Status: Active',
              'Uptime: 99.9%',
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
          const midpoint: [number, number, number] = [
            (sourceNode.position[0] + targetNode.position[0]) / 2,
            (sourceNode.position[1] + targetNode.position[1]) / 2,
            (sourceNode.position[2] + targetNode.position[2]) / 2,
          ];
          
          setTooltipData({
            position: midpoint,
            data: {
              type: 'link',
              title: `Link ${link.source} → ${link.target}`,
              details: [
                'Status: Connected',
                'Latency: 5ms',
                'Bandwidth: 1Gbps'
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