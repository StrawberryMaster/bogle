// ─────────── Stereographic projection ─────────────
import Projection from './base.js';
import { normalizeLon } from '../utils.js';

export default class StereographicProjection extends Projection {
    constructor(centerLat, centerLon, edgeAngle) {
        const clampedEdgeAngle = Math.min(Math.max(edgeAngle, 0), 150);
        super(centerLat, centerLon, clampedEdgeAngle);
    }

    forward(lat, lon, canvasWidth, canvasHeight) {
        const R = Math.min(canvasWidth, canvasHeight) / 2;
        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);
        const sinLat0 = Math.sin(this.centerLat);
        const cosLat0 = Math.cos(this.centerLat);
        const dLon = lon - this.centerLon;
        
        const cosC = sinLat0 * sinLat + cosLat0 * cosLat * Math.cos(dLon);
        
        if (cosC < -0.0001) {
            return { visible: false };
        }
        
        const k = 2 / (1 + cosC);
        
        const c = Math.acos(Math.min(Math.max(cosC, -1), 1));
        if (c > this.edgeAngleRad) {
            return { visible: false };
        }
        
        const xFactor = cosLat * Math.sin(dLon);
        const yFactor = cosLat0 * sinLat - sinLat0 * cosLat * Math.cos(dLon);
        
        const scaleFactor = R * (k / 2) * (Math.PI / this.edgeAngleRad);
        
        const x = canvasWidth / 2 + scaleFactor * xFactor;
        const y = canvasHeight / 2 - scaleFactor * yFactor;
        
        return { x, y, visible: true };
    }

    inverse(x, y, canvasWidth, canvasHeight) {
        const R = Math.min(canvasWidth, canvasHeight) / 2;
        const xPrime = x - canvasWidth / 2;
        const yPrime = -(y - canvasHeight / 2);
        
        const rho = Math.sqrt(xPrime * xPrime + yPrime * yPrime);
        
        const maxRho = R * (Math.PI / this.edgeAngleRad) * 2;
        if (rho > maxRho) {
            return { visible: false };
        }
        
        const c = 2 * Math.atan2(rho, 2 * R * (Math.PI / this.edgeAngleRad));
        
        if (rho < 1e-10) {
            return { lat: this.centerLat, lon: this.centerLon, visible: true };
        }
        
        const sinC = Math.sin(c);
        const cosC = Math.cos(c);
        const sinLat0 = Math.sin(this.centerLat);
        const cosLat0 = Math.cos(this.centerLat);
        
        const lat = Math.asin(cosC * sinLat0 + (yPrime * sinC * cosLat0) / rho);
        
        const lon = this.centerLon + Math.atan2(
            xPrime * sinC,
            rho * cosLat0 * cosC - yPrime * sinLat0 * sinC
        );
        
        return { lat, lon: normalizeLon(lon), visible: true };
    }
    
    needsCircularClipping() {
        return true;
    }
}
