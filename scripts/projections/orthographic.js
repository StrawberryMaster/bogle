// ─────────── Ortographic projection ─────────────
import Projection from './base.js';
import { normalizeLon } from '../utils.js';

export default class OrthographicProjection extends Projection {
    constructor(centerLat, centerLon, edgeAngle) {
        const clampedEdgeAngle = Math.min(Math.max(edgeAngle, 0), 90);
        super(centerLat, centerLon, clampedEdgeAngle);
    }
    
    inverse(x, y, canvasWidth, canvasHeight) {
        const R = Math.min(canvasWidth, canvasHeight) / 2;
        const xPrime = x - canvasWidth / 2;
        const yPrime = -(y - canvasHeight / 2);
        const rho = Math.sqrt(xPrime * xPrime + yPrime * yPrime);
        const c = this.edgeAngleRad * (rho / R);
        if (rho > R || c > Math.PI) { return { visible: false }; }
        let lat, lon;
        if (rho < 1e-10) {
            lat = this.centerLat;
            lon = this.centerLon;
        } else {
            const sinC = Math.sin(c);
            const cosC = Math.cos(c);
            const yNorm = yPrime / rho;
            lat = Math.asin(Math.sin(this.centerLat) * cosC + Math.cos(this.centerLat) * sinC * yNorm);
            const xNorm = xPrime / rho;
            const numerator = xNorm * sinC;
            const denominator = Math.cos(this.centerLat) * cosC - Math.sin(this.centerLat) * sinC * yNorm;
            lon = this.centerLon + Math.atan2(numerator, denominator);
        }
        lon = normalizeLon(lon);
        return { lat, lon, visible: true };
    }
    
    forward(lat, lon, canvasWidth, canvasHeight) {
        const R = Math.min(canvasWidth, canvasHeight) / 2;
        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);
        const sinLat0 = Math.sin(this.centerLat);
        const cosLat0 = Math.cos(this.centerLat);
        const dLon = lon - this.centerLon;
        const cosC = sinLat0 * sinLat + cosLat0 * cosLat * Math.cos(dLon);
        const c = Math.acos(Math.min(Math.max(cosC, -1), 1));
        if (c > this.edgeAngleRad) { return { visible: false }; }
        if (Math.abs(c) < 1e-12) { return { x: canvasWidth / 2, y: canvasHeight / 2, visible: true }; }
        const numerator = cosLat * Math.sin(dLon);
        const denominator = cosLat0 * sinLat - sinLat0 * cosLat * Math.cos(dLon);
        const alpha = Math.atan2(numerator, denominator);
        const radius = R * (c / this.edgeAngleRad);
        const x = canvasWidth / 2 + radius * Math.sin(alpha);
        const y = canvasHeight / 2 - radius * Math.cos(alpha);
        return { x, y, visible: true };
    }
    
    needsCircularClipping() {
        return true;
    }
}
