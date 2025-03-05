// ─────────── Graticules! ───────────

import { toRad } from './utils.js';

export default class Graticule {
    constructor(projection, options) {
        this.projection = projection;
        this.lonSpacing = options.lonSpacing || 15;
        this.latSpacing = options.latSpacing || 15;
        this.offset = options.offset || 0;
        this.strokeStyle = options.strokeStyle || 'solid';
        this.color = options.color || '#ffffff';
        this.lineWidth = options.lineWidth || 1;
    }

    draw(context, canvasWidth, canvasHeight) {
        context.save();
        context.strokeStyle = this.color;
        context.lineWidth = this.lineWidth;
        switch (this.strokeStyle) {
            case 'solid': context.setLineDash([]); break;
            case 'dash': context.setLineDash([8, 4]); break;
            case 'dot': context.setLineDash([2, 2]); break;
            case 'dashdot': context.setLineDash([10, 3, 2, 3]); break;
            default: context.setLineDash([]); break;
        }

        // latitude lines
        for (let latDeg = -90 + this.offset; latDeg <= 90; latDeg += this.latSpacing) {
            this.drawParallel(context, toRad(latDeg), canvasWidth, canvasHeight);
        }

        // longitude lines
        for (let lonDeg = -180; lonDeg < 180.0001; lonDeg += this.lonSpacing) {
            this.drawMeridian(context, toRad(lonDeg), canvasWidth, canvasHeight);
        }

        context.restore();
    }

    drawParallel(context, lat, canvasWidth, canvasHeight) {
        const segments = 60;
        context.beginPath();
        let started = false;
        for (let i = 0; i <= segments; i++) {
            const frac = i / segments;
            const lon = toRad(-180 + 360 * frac);
            const point = this.projection.forward(lat, lon, canvasWidth, canvasHeight);
            if (!point.visible) {
                if (!started) continue;
                else { context.stroke(); context.beginPath(); started = false; }
            } else {
                if (!started) { context.moveTo(point.x, point.y); started = true; }
                else { context.lineTo(point.x, point.y); }
            }
        }
        context.stroke();
    }

    drawMeridian(context, lon, canvasWidth, canvasHeight) {
        const segments = 60;
        context.beginPath();
        let started = false;
        for (let i = 0; i <= segments; i++) {
            const frac = i / segments;
            const lat = toRad(-90 + 180 * frac);
            const point = this.projection.forward(lat, lon, canvasWidth, canvasHeight);
            if (!point.visible) {
                if (!started) continue;
                else { context.stroke(); context.beginPath(); started = false; }
            } else {
                if (!started) { context.moveTo(point.x, point.y); started = true; }
                else { context.lineTo(point.x, point.y); }
            }
        }
        context.stroke();
    }
}
