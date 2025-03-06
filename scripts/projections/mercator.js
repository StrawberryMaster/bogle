// ─────────── Mercator projection ─────────────
import Projection from './base.js';
import { toRad, normalizeLon } from '../utils.js';
export default class MercatorProjection extends Projection {
    constructor(centerLat, centerLon, maxLat) {
        const clampedMaxLat = Math.min(Math.max(maxLat, 45), 89.9);
        super(centerLat, centerLon, clampedMaxLat);
        this.maxLatRad = toRad(clampedMaxLat);
    }

    forward(lat, lon, canvasWidth, canvasHeight) {
        lon = normalizeLon(lon);

        const mercatorY = Math.log(Math.tan(Math.PI / 4 + lat / 2));
        const maxMercatorY = Math.log(Math.tan(Math.PI / 4 + this.maxLatRad / 2));

        const scale = Math.min(canvasWidth, canvasHeight) / 2;

        // for infinite horizontal wrapping
        const x = canvasWidth / 2 + scale * (lon - this.centerLon) / maxMercatorY;
        const y = canvasHeight / 2 - scale * mercatorY / maxMercatorY;

        return { x, y, visible: true };
    }

    inverse(x, y, canvasWidth, canvasHeight) {
        const scale = Math.min(canvasWidth, canvasHeight) / 2;
        const maxMercatorY = Math.log(Math.tan(Math.PI / 4 + this.maxLatRad / 2));


        const lon = normalizeLon(
            this.centerLon + ((x - canvasWidth / 2) / scale) * maxMercatorY
        );

        const mercatorY = -((y - canvasHeight / 2) / scale) * maxMercatorY;
        const lat = 2 * Math.atan(Math.exp(mercatorY)) - Math.PI / 2;

        return { lat, lon, visible: true };
    }

    needsCircularClipping() { return false; }
}