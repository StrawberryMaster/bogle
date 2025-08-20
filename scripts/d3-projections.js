// ─────────── D3.js-based projection system ─────────────

/**
 * Configuration for different projection types using D3.js
 */
const projectionConfigs = {
    'ortho': {
        name: 'Orthographic',
        edgeAngleName: 'Edge angle (°)',
        min: 0,
        max: 90,
        createProjection: (centerLat, centerLon, edgeAngle) => {
            return d3.geoOrthographic()
                .rotate([-centerLon, -centerLat])
                .clipAngle(edgeAngle);
        }
    },
    'mercator': {
        name: 'Mercator',
        edgeAngleName: 'Max latitude (°)',
        min: 45,
        max: 89.9,
        createProjection: (centerLat, centerLon, maxLat) => {
            return d3.geoMercator()
                .center([centerLon, centerLat]);
                // Remove clipExtent as it interferes with graticule rendering
        }
    },
    'stereo': {
        name: 'Stereographic',
        edgeAngleName: 'Edge angle (°)',
        min: 0,
        max: 150,
        createProjection: (centerLat, centerLon, edgeAngle) => {
            return d3.geoStereographic()
                .rotate([-centerLon, -centerLat])
                .clipAngle(edgeAngle);
        }
    }
};

// Cache for projection instances
const projectionCache = new Map();
const MAX_CACHE_SIZE = 20;

/**
 * Creates a D3.js projection based on type and parameters
 * @param {string} type - Projection type ('ortho', 'mercator', 'stereo')
 * @param {number} centerLat - Center latitude in degrees
 * @param {number} centerLon - Center longitude in degrees
 * @param {number} edgeAngleOrMaxLat - Edge angle or max latitude depending on projection
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {object} D3.js projection instance
 */
export function createProjection(type, centerLat, centerLon, edgeAngleOrMaxLat, width, height) {
    // Normalize inputs
    type = projectionConfigs[type] ? type : 'ortho';
    centerLat = Number.isFinite(centerLat) ? centerLat : 0;
    centerLon = Number.isFinite(centerLon) ? centerLon : 0;
    edgeAngleOrMaxLat = Number.isFinite(edgeAngleOrMaxLat) ? edgeAngleOrMaxLat : 90;

    const cacheKey = `${type}:${centerLat.toFixed(2)}:${centerLon.toFixed(2)}:${edgeAngleOrMaxLat.toFixed(2)}:${width}:${height}`;
    
    if (projectionCache.has(cacheKey)) {
        return projectionCache.get(cacheKey);
    }

    const config = projectionConfigs[type];
    const projection = config.createProjection(centerLat, centerLon, edgeAngleOrMaxLat);
    
    // Set up projection-specific scaling for optimal canvas coverage
    let scale;
    if (type === 'mercator') {
        // Mercator: scale to show reasonable latitude range and make center changes more visible
        scale = width / 4; // Increased from /6 to /4 for better visibility of center changes
    } else {
        // Orthographic & Stereographic: scale to fill the entire canvas
        scale = Math.min(width, height) / 2; // Fill the entire canvas (radius = canvas/2)
    }
    
    projection
        .scale(scale)
        .translate([width / 2, height / 2]);
    
    // Manage cache size
    if (projectionCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = projectionCache.keys().next().value;
        projectionCache.delete(oldestKey);
    }
    
    projectionCache.set(cacheKey, projection);
    return projection;
}

/**
 * Create a D3.js graticule generator
 * @param {object} options - Graticule options
 * @returns {object} D3.js graticule generator
 */
export function createGraticule(options = {}) {
    const lonSpacing = options.lonSpacing || 15;
    const latSpacing = options.latSpacing || 15;
    const offset = options.offset || 0;
    const projectionType = options.projectionType || 'ortho';
    const centerLon = options.centerLon || 0;
    const centerLat = options.centerLat || 0;
    
    if (projectionType === 'mercator') {
        // For Mercator, create extended graticule that appears infinite
        // Extend the longitude range well beyond the visible area
        const lonRange = 120; // degrees on each side of center
        const minLon = centerLon - lonRange;
        const maxLon = centerLon + lonRange;
        
        return d3.geoGraticule()
            .step([lonSpacing, latSpacing])
            .extent([[minLon, -90 + offset], [maxLon, 89.9]]);
    } else {
        // Use global extent for circular projections
        return d3.geoGraticule()
            .step([lonSpacing, latSpacing])
            .extent([[-180, -90 + offset], [180, 90]]);
    }
}

/**
 * Check if a projection needs circular clipping
 * @param {string} type - Projection type
 * @returns {boolean} Whether circular clipping is needed
 */
export function needsCircularClipping(type) {
    return type === 'ortho' || type === 'stereo';
}

/**
 * Project geographic coordinates to screen coordinates
 * @param {object} projection - D3.js projection
 * @param {Array} coordinates - [longitude, latitude] in degrees
 * @returns {Array|null} [x, y] screen coordinates or null if not visible
 */
export function projectCoordinates(projection, coordinates) {
    return projection(coordinates);
}

/**
 * Inverse project screen coordinates to geographic coordinates
 * @param {object} projection - D3.js projection
 * @param {Array} point - [x, y] screen coordinates
 * @returns {Array|null} [longitude, latitude] in degrees or null if outside bounds
 */
export function invertCoordinates(projection, point) {
    return projection.invert(point);
}

// Export the projection configurations for UI updates
export { projectionConfigs };