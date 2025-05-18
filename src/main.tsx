import React from 'react';
import ReactDOM from 'react-dom/client';
import { NetworkTopology } from './components/NetworkTopology';
import './main.css';

interface NetworkData {
  nodes: Array<{
    id: string;
    position: [number, number, number];
  }>;
  links: Array<{
    source: string;
    target: string;
    trafficIntensity: 'low' | 'medium' | 'high';
  }>;
}

interface NetworkConfig {
  data?: NetworkData;
  isDarkMode?: boolean;
  showControlPanel?: boolean;
}

// Function to distribute points evenly on a sphere's surface
const distributePointsOnSphere = (count: number): [number, number, number][] => {
  const points: [number, number, number][] = [];
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle in radians

  for (let i = 0; i < count; i++) { 
    const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
    const radius_at_y = Math.sqrt(1 - y * y); // radius at y
    
    const theta = phi * i; // golden angle increment

    const x = Math.cos(theta) * radius_at_y;
    const z = Math.sin(theta) * radius_at_y;

    points.push([x, y, z]);
  }

  return points;
};

const positions = distributePointsOnSphere(8);

const defaultData: NetworkData = {
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
};

// Global API
const nettopology = {
  init: (config: NetworkConfig = {}) => {
    const container = document.getElementById('nettopology');
    if (!container) {
      console.error('Could not find element with id "nettopology"');
      return;
    }

    // Clear any existing content
    container.innerHTML = '';

    ReactDOM.createRoot(container).render(
      <React.StrictMode>
        <NetworkTopology 
          data={config.data || defaultData}
          isDarkMode={config.isDarkMode}
          showControlPanel={config.showControlPanel}
        />
      </React.StrictMode>
    );
  }
};

// Flag to track if manual initialization has occurred
let manualInitCalled = false;

// Expose global API with initialization tracking
declare global {
  interface Window {
    nettopology: typeof nettopology & { _manualInitCalled?: boolean };
  }
}

const wrappedNettopology = {
  ...nettopology,
  init: (config: NetworkConfig = {}) => {
    manualInitCalled = true;
    window.nettopology._manualInitCalled = true;
    nettopology.init(config);
  }
};

// Auto-initialize only if no manual init has been called
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  if (!manualInitCalled) {
    nettopology.init();
  }
} else {
  document.addEventListener('DOMContentLoaded', () => {
    if (!manualInitCalled && !window.nettopology._manualInitCalled) {
      nettopology.init();
    }
  });
}

window.nettopology = wrappedNettopology;
