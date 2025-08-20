// ─────────── Modern projection system inspired by D3.js ─────────────

// Utility functions
const toRadians = deg => deg * Math.PI / 180;
const toDegrees = rad => rad * 180 / Math.PI;
const normalizeLon = lon => {
    lon = lon % 360;
    if (lon > 180) lon -= 360;
    else if (lon <= -180) lon += 360;
    return lon;
};

// Base projection class with D3-like interface
class ModernProjection {
    constructor() {
        this.scale = 250;
        this.translate = [250, 250];
        this.rotate = [0, 0, 0];
        this.clipAngle = null;
        this.clipExtent = null;
    }

    // D3-like chainable setters
    setScale(scale) {
        this.scale = scale;
        return this;
    }

    setTranslate(translate) {
        this.translate = translate;
        return this;
    }

    setRotate(rotate) {
        this.rotate = rotate;
        return this;
    }

    setClipAngle(angle) {
        this.clipAngle = angle;
        return this;
    }

    setClipExtent(extent) {
        this.clipExtent = extent;
        return this;
    }

    fitSize(size, object) {
        // Simple implementation for fitting to canvas size
        const [width, height] = size;
        this.scale = Math.min(width, height) / 4;
        this.translate = [width / 2, height / 2];
        return this;
    }

    // Forward projection: [lon, lat] -> [x, y]
    project(coordinates) {
        throw new Error('project() must be implemented by subclass');
    }

    // Inverse projection: [x, y] -> [lon, lat]
    invert(point) {
        throw new Error('invert() must be implemented by subclass');
    }

    // Check if point is visible (within clip bounds)
    isVisible(lon, lat) {
        if (this.clipAngle !== null) {
            // Spherical distance clipping
            const [centerLon, centerLat] = [-this.rotate[0], -this.rotate[1]];
            const distance = this.sphericalDistance(lon, lat, centerLon, centerLat);
            if (distance > toRadians(this.clipAngle)) return false;
        }
        
        if (this.clipExtent !== null) {
            const [[minLon, minLat], [maxLon, maxLat]] = this.clipExtent;
            if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return false;
        }
        
        return true;
    }

    sphericalDistance(lon1, lat1, lon2, lat2) {
        const dLon = toRadians(lon2 - lon1);
        const lat1Rad = toRadians(lat1);
        const lat2Rad = toRadians(lat2);
        const dLat = lat2Rad - lat1Rad;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
}

// Orthographic projection
class OrthographicProjection extends ModernProjection {
    project(coordinates) {
        const [lambda, phi] = coordinates.map(toRadians);
        const [lambda0, phi0] = this.rotate.slice(0, 2).map(d => -toRadians(d));
        
        const cosPhi = Math.cos(phi);
        const cosLambda = Math.cos(lambda - lambda0);
        const sinPhi0 = Math.sin(phi0);
        const cosPhi0 = Math.cos(phi0);
        
        const cosC = sinPhi0 * Math.sin(phi) + cosPhi0 * cosPhi * cosLambda;
        if (cosC < 0) return null; // Back hemisphere
        
        const x = this.translate[0] + this.scale * cosPhi * Math.sin(lambda - lambda0);
        const y = this.translate[1] - this.scale * (cosPhi0 * Math.sin(phi) - sinPhi0 * cosPhi * cosLambda);
        
        return [x, y];
    }

    invert(point) {
        const [x, y] = point;
        const [lambda0, phi0] = this.rotate.slice(0, 2).map(d => -toRadians(d));
        
        const dx = x - this.translate[0];
        const dy = this.translate[1] - y;
        const rho = Math.sqrt(dx * dx + dy * dy);
        
        if (rho > this.scale) return null;
        
        const c = Math.asin(rho / this.scale);
        const sinC = Math.sin(c);
        const cosC = Math.cos(c);
        const sinPhi0 = Math.sin(phi0);
        const cosPhi0 = Math.cos(phi0);
        
        const phi = Math.asin(cosC * sinPhi0 + (dy * sinC * cosPhi0) / rho);
        const lambda = lambda0 + Math.atan2(dx * sinC, rho * cosPhi0 * cosC - dy * sinPhi0 * sinC);
        
        return [toDegrees(lambda), toDegrees(phi)];
    }
}

// Mercator projection
class MercatorProjection extends ModernProjection {
    project(coordinates) {
        const [lambda, phi] = coordinates.map(toRadians);
        const [lambda0, phi0] = this.rotate.slice(0, 2).map(d => -toRadians(d));
        
        const x = this.translate[0] + this.scale * (lambda - lambda0);
        const y = this.translate[1] - this.scale * Math.log(Math.tan(Math.PI / 4 + phi / 2));
        
        return [x, y];
    }

    invert(point) {
        const [x, y] = point;
        const [lambda0, phi0] = this.rotate.slice(0, 2).map(d => -toRadians(d));
        
        const lambda = lambda0 + (x - this.translate[0]) / this.scale;
        const phi = 2 * Math.atan(Math.exp((this.translate[1] - y) / this.scale)) - Math.PI / 2;
        
        return [toDegrees(lambda), toDegrees(phi)];
    }
}

// Stereographic projection
class StereographicProjection extends ModernProjection {
    project(coordinates) {
        const [lambda, phi] = coordinates.map(toRadians);
        const [lambda0, phi0] = this.rotate.slice(0, 2).map(d => -toRadians(d));
        
        const cosPhi = Math.cos(phi);
        const cosLambda = Math.cos(lambda - lambda0);
        const sinPhi0 = Math.sin(phi0);
        const cosPhi0 = Math.cos(phi0);
        
        const cosC = sinPhi0 * Math.sin(phi) + cosPhi0 * cosPhi * cosLambda;
        const k = 2 / (1 + cosC);
        
        const x = this.translate[0] + this.scale * k * cosPhi * Math.sin(lambda - lambda0);
        const y = this.translate[1] - this.scale * k * (cosPhi0 * Math.sin(phi) - sinPhi0 * cosPhi * cosLambda);
        
        return [x, y];
    }

    invert(point) {
        const [x, y] = point;
        const [lambda0, phi0] = this.rotate.slice(0, 2).map(d => -toRadians(d));
        
        const dx = x - this.translate[0];
        const dy = this.translate[1] - y;
        const rho = Math.sqrt(dx * dx + dy * dy);
        const c = 2 * Math.atan(rho / (2 * this.scale));
        
        const sinC = Math.sin(c);
        const cosC = Math.cos(c);
        const sinPhi0 = Math.sin(phi0);
        const cosPhi0 = Math.cos(phi0);
        
        const phi = Math.asin(cosC * sinPhi0 + (dy * sinC * cosPhi0) / rho);
        const lambda = lambda0 + Math.atan2(dx * sinC, rho * cosPhi0 * cosC - dy * sinPhi0 * sinC);
        
        return [toDegrees(lambda), toDegrees(phi)];
    }
}

// Configuration for projections that matches our current system
const projectionConfigs = {
    'ortho': {
        name: 'Orthographic',
        edgeAngleName: 'Edge angle (°)',
        min: 0,
        max: 90,
        createProjection: (centerLat, centerLon, edgeAngle) => {
            return new OrthographicProjection()
                .setRotate([centerLon, -centerLat])
                .setClipAngle(edgeAngle);
        }
    },
    'mercator': {
        name: 'Mercator',
        edgeAngleName: 'Max latitude (°)',
        min: 45,
        max: 89.9,
        createProjection: (centerLat, centerLon, maxLat) => {
            return new MercatorProjection()
                .setRotate([centerLon, centerLat])
                .setClipExtent([[-180, -maxLat], [180, maxLat]]);
        }
    },
    'stereo': {
        name: 'Stereographic',
        edgeAngleName: 'Edge angle (°)',
        min: 0,
        max: 150,
        createProjection: (centerLat, centerLon, edgeAngle) => {
            return new StereographicProjection()
                .setRotate([centerLon, -centerLat])
                .setClipAngle(edgeAngle);
        }
    }
};

// Cache for projection instances
const projectionCache = new Map();
const MAX_CACHE_SIZE = 20;

/**
 * Creates a projection based on type and parameters
 * @param {string} type - Projection type ('ortho', 'mercator', 'stereo')
 * @param {number} centerLat - Center latitude in degrees
 * @param {number} centerLon - Center longitude in degrees
 * @param {number} edgeAngleOrMaxLat - Edge angle or max latitude depending on projection
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {object} Projection instance
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
    
    // Set up the projection for the canvas size
    projection.fitSize([width, height], null);
    
    // Manage cache size
    if (projectionCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = projectionCache.keys().next().value;
        projectionCache.delete(oldestKey);
    }
    
    projectionCache.set(cacheKey, projection);
    return projection;
}

/**
 * Create a graticule generator
 * @param {object} options - Graticule options
 * @returns {object} Graticule data
 */
export function createGraticule(options = {}) {
    const lonSpacing = options.lonSpacing || 15;
    const latSpacing = options.latSpacing || 15;
    const offset = options.offset || 0;
    
    const lines = [];
    
    // Longitude lines (meridians)
    for (let lon = -180; lon <= 180; lon += lonSpacing) {
        const line = [];
        for (let lat = -90; lat <= 90; lat += 1) {
            line.push([lon, lat]);
        }
        lines.push(line);
    }
    
    // Latitude lines (parallels)
    for (let lat = -90 + offset; lat <= 90; lat += latSpacing) {
        const line = [];
        for (let lon = -180; lon <= 180; lon += 1) {
            line.push([lon, lat]);
        }
        lines.push(line);
    }
    
    return lines;
}

/**
 * Check if a projection needs circular clipping
 * @param {string} type - Projection type
 * @returns {boolean} Whether circular clipping is needed
 */
export function needsCircularClipping(type) {
    return type === 'ortho' || type === 'stereo';
}

// Export the projection configurations for UI updates
export { projectionConfigs };