// ─────────── Base class for map projections ───────────
import { toRad } from '../utils.js';

export default class Projection {
    constructor(centerLat, centerLon, edgeAngle) {
        this.centerLat = toRad(centerLat);
        this.centerLon = toRad(centerLon);
        this.edgeAngleRad = toRad(edgeAngle);
    }
    
    // given canvas (x,y), compute lat/lon
    inverse(x, y, canvasWidth, canvasHeight) {
        throw new Error('inverse() not implemented');
    }
    
    // given lat/lon, compute canvas (x,y)
    forward(lat, lon, canvasWidth, canvasHeight) {
        throw new Error('forward() not implemented');
    }
    
    // whether the projection needs circular clipping
    needsCircularClipping() {
        return false;
    }
}
