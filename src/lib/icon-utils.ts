// Utility to convert SVG icons to image data URLs for consistent rendering

export const svgToImageDataUrl = (svgElement: SVGElement, width: number, height: number, color: string): string => {
  // Clone the SVG
  const svgClone = svgElement.cloneNode(true) as SVGElement;
  
  // Set dimensions
  svgClone.setAttribute('width', String(width));
  svgClone.setAttribute('height', String(height));
  
  // Ensure viewBox exists
  if (!svgClone.getAttribute('viewBox')) {
    svgClone.setAttribute('viewBox', '0 0 24 24');
  }
  
  // Apply color to paths
  const paths = svgClone.querySelectorAll('path');
  paths.forEach((path) => {
    const pathEl = path as SVGPathElement;
    const fill = pathEl.getAttribute('fill');
    const stroke = pathEl.getAttribute('stroke');
    const strokeWidth = pathEl.getAttribute('stroke-width');
    
    // For stroke-based icons (like lucide-react), use stroke
    if (strokeWidth && (stroke === 'currentColor' || stroke === 'none' || !stroke)) {
      pathEl.setAttribute('stroke', color);
      if (!fill || fill === 'currentColor') {
        pathEl.setAttribute('fill', 'none');
      }
    } else {
      // For fill-based icons
      if (fill === 'currentColor' || fill === 'none' || !fill) {
        pathEl.setAttribute('fill', color);
      }
    }
  });
  
  // Convert to data URL
  const svgString = new XMLSerializer().serializeToString(svgClone);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
};

// Create an image element from an SVG icon component
export const createIconImage = (
  IconComponent: React.ComponentType<{ size?: number; style?: React.CSSProperties }>,
  size: number,
  color: string
): string => {
  // Create a temporary container
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  document.body.appendChild(container);
  
  // Render the icon
  const React = require('react');
  const ReactDOM = require('react-dom/client');
  const root = ReactDOM.createRoot(container);
  
  root.render(React.createElement(IconComponent, { size, style: { color } }));
  
  // Wait for render
  setTimeout(() => {
    const svg = container.querySelector('svg');
    if (svg) {
      const dataUrl = svgToImageDataUrl(svg as SVGElement, size, size, color);
      // Store in a way that can be retrieved
      (window as any).__lastIconDataUrl = dataUrl;
    }
    document.body.removeChild(container);
  }, 10);
  
  return (window as any).__lastIconDataUrl || '';
};

