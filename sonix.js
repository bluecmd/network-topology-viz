// Network topology data
const networkData = {
  nodes: [
    // Main connected components - clustered closer together
    { 
      id: "IXN",
      sphericalPosition: { latitude: 20, longitude: -30 }    // Upper left
    },
    { 
      id: "KG",
      sphericalPosition: { latitude: 40, longitude: 0 }      // Top center
    },
    { 
      id: "SK1",
      sphericalPosition: { latitude: 20, longitude: 30 }     // Upper right
    },
    { 
      id: "KN7",
      sphericalPosition: { latitude: -10, longitude: 15 }    // Lower right
    },
    { 
      id: "CH",
      sphericalPosition: { latitude: -25, longitude: 30 }    // Bottom right
    },
    
    // Isolated nodes - positioned far from the cluster
    { 
      id: "VG4",
      sphericalPosition: { latitude: -60, longitude: -120 }  // Lower left, far
    },
    { 
      id: "SHG5",
      sphericalPosition: { latitude: 60, longitude: -150 }   // Upper left, far
    }
  ],
  links: [
    { source: "IXN", target: "KG", trafficIntensity: "high" },
    { source: "KG", target: "SK1", trafficIntensity: "medium" },
    { source: "KG", target: "KN7", trafficIntensity: "medium" },
    { source: "KN7", target: "CH", trafficIntensity: "low" }
  ]
};

// Initialize the topology when the window loads
window.addEventListener('load', function() {
  // Check if the initialization function exists
  if (typeof window.nettopology !== 'undefined' && typeof window.nettopology.init === 'function') {
    // Initialize with the network data and default options
    window.nettopology.init({
      data: networkData,
      isDarkMode: false,
      showControlPanel: false
    });
  } else {
    console.error('Network topology visualization library not loaded');
  }
}); 