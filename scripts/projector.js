// ─────────── Utility functions ──────────────
const toRad = deg => deg * Math.PI / 180;
const normalizeLon = lon => {
    lon = lon % (2 * Math.PI);
    if (lon > Math.PI) { lon -= 2 * Math.PI; }
    else if (lon <= -Math.PI) { lon += 2 * Math.PI; }
    return lon;
};

// ─────────── Projection classes ─────────────
// this is the base class for all projections
class Projection {
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
}

// orthographic projection
// @todo move this and future projections to separate files
class OrthographicProjection extends Projection {
    constructor(centerLat, centerLon, edgeAngle) {
        super(centerLat, centerLon, edgeAngle);
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
}

// mercator projection
class MercatorProjection extends Projection {
    constructor(centerLat, centerLon, maxLat) {
        const clampedMaxLat = Math.min(Math.max(maxLat, 45), 89.9);
        super(centerLat, centerLon, clampedMaxLat);
        this.maxLatRad = toRad(clampedMaxLat);
    }

    forward(lat, lon, canvasWidth, canvasHeight) {
        lat = Math.max(Math.min(lat, this.maxLatRad), -this.maxLatRad);

        lon = normalizeLon(lon);

        const mercatorY = Math.log(Math.tan(Math.PI / 4 + lat / 2));
        const maxMercatorY = Math.log(Math.tan(Math.PI / 4 + this.maxLatRad / 2));

        const scale = Math.min(canvasWidth, canvasHeight) / 2;

        const x = canvasWidth / 2 + scale * (lon - this.centerLon) / maxMercatorY;

        const y = canvasHeight / 2 - scale * mercatorY / maxMercatorY;

        return { x, y, visible: true };
    }

    inverse(x, y, canvasWidth, canvasHeight) {
        const scale = Math.min(canvasWidth, canvasHeight) / 2;
        const maxMercatorY = Math.log(Math.tan(Math.PI / 4 + this.maxLatRad / 2));

        const lon = this.centerLon + ((x - canvasWidth / 2) / scale) * maxMercatorY;

        const mercatorY = -((y - canvasHeight / 2) / scale) * maxMercatorY;
        const lat = 2 * Math.atan(Math.exp(mercatorY)) - Math.PI / 2;

        if (lat < -this.maxLatRad || lat > this.maxLatRad) {
            return { visible: false };
        }

        return { lat, lon, visible: true };
    }
}

// stereographic projection
class StereographicProjection extends Projection {
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
}

// this is a factory function that creates a projection based on the type
// should be quite useful when adding more projections
function createProjection(type, centerLat, centerLon, edgeAngleOrMaxLat) {
    switch (type) {
        case 'mercator':
            return new MercatorProjection(centerLat, centerLon, edgeAngleOrMaxLat);
        case 'stereo':
            return new StereographicProjection(centerLat, centerLon, edgeAngleOrMaxLat);
        case 'ortho':
        default:
            return new OrthographicProjection(centerLat, centerLon, edgeAngleOrMaxLat);
    }
}

// ─────────── Graticule class ─────────────
class Graticule {
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

// ─────────── Global variables and offscreen canvases ─────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let originalImage = null;
// we reuse this offscreen canvas for rendering the original image
let offCanvas = document.getElementById('offCanvas');
if (!offCanvas) {
    offCanvas = document.createElement('canvas');
    offCanvas.id = 'offCanvas';
    offCanvas.style.display = 'none';
    document.body.appendChild(offCanvas);
}

// ─────────── DOM elements ─────────────
const uploadInput = document.getElementById('upload');
const centerLonInput = document.getElementById('centerLon');
const centerLatInput = document.getElementById('centerLat');
const edgeAngleInput = document.getElementById('edgeAngle');
const updateBtn = document.getElementById('updateBtn');
const projectionSelect = document.getElementById('projection');

const graticuleLonSpacingInput = document.getElementById('graticuleLonSpacing');
const graticuleLatSpacingInput = document.getElementById('graticuleLatSpacing');
const graticuleOffsetInput = document.getElementById('graticuleOffset');
const graticuleColorInput = document.getElementById('graticuleColor');
const graticuleLineWidthInput = document.getElementById('graticuleLineWidth');
const graticuleStyleInput = document.getElementById('graticuleStyle');

// default values - New York City
let centerLon = -74.01;
let centerLat = 40.71;
let edgeAngle = 90;
let projectionType = projectionSelect.value;

// ─────────── Event handlers ─────────────
uploadInput.addEventListener('change', handleFileUpload);
updateBtn.addEventListener('click', updateAndDraw);

// so we can update the projection type and edge angle
projectionSelect.addEventListener('change', function () {
    projectionType = this.value;

    const edgeLabel = document.querySelector('label[for="edgeAngle"]');

    if (projectionType === 'mercator') {
        // mercator
        edgeLabel.textContent = 'Max latitude (°) (45-89.9°):';
        edgeAngleInput.min = 45;
        edgeAngleInput.max = 89.9;
        if (parseFloat(edgeAngleInput.value) < 45) edgeAngleInput.value = 45;
        if (parseFloat(edgeAngleInput.value) > 89.9) edgeAngleInput.value = 89.9;
    } else if (projectionType === 'stereo') {
        // stereographic
        edgeLabel.textContent = 'Edge angle (°) (≤150.0°):';
        edgeAngleInput.min = 0;
        edgeAngleInput.max = 150;
        if (parseFloat(edgeAngleInput.value) > 150) edgeAngleInput.value = 150;
    } else {
        // orthographic & others 
        edgeLabel.textContent = 'Edge angle (°) (≤90.0):';
        edgeAngleInput.min = 0;
        edgeAngleInput.max = 90;
        if (parseFloat(edgeAngleInput.value) > 90) edgeAngleInput.value = 90;
    }

    updateAndDraw();
});

// @todo: we could add some debouncing here ig?
let debounceTimer;
function debounceDraw() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(drawEverything, 100);
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            offCanvas.width = img.width;
            offCanvas.height = img.height;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(originalImage, 0, 0);
            drawEverything();
        };
        img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
}

function updateAndDraw() {
    centerLon = parseFloat(centerLonInput.value) || centerLon;
    centerLat = parseFloat(centerLatInput.value) || centerLat;
    edgeAngle = parseFloat(edgeAngleInput.value) || edgeAngle;
    projectionType = projectionSelect.value;
    drawEverything();
}

// ─────────── Main drawing function ─────────────
// yeah i know. it's a funny name. it is what it is
function drawEverything() {
    if (!originalImage) return;
    const width = canvas.width;
    const height = canvas.height;

    const projection = createProjection(projectionType, centerLat, centerLon, edgeAngle);

    const projCanvas = document.createElement('canvas');
    projCanvas.width = width;
    projCanvas.height = height;
    const projCtx = projCanvas.getContext('2d');

    // preparing an ImageData buffer for the projected image
    const output = projCtx.createImageData(width, height);
    const data = output.data;
    const offCtx = offCanvas.getContext('2d');
    const offImageData = offCtx.getImageData(0, 0, originalImage.width, originalImage.height);
    const offData = offImageData.data;

    // for every pixel on the output canvas, use the inverse projection to sample the source image
    // this may not be very efficient but it's simple and works well for small images
    for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
            const idx = (j * width + i) * 4;
            const inv = projection.inverse(i, j, width, height);
            if (!inv.visible) {
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
                data[idx + 3] = 255;
                continue;
            }

            const imgX = ((inv.lon + Math.PI) / (2 * Math.PI)) * originalImage.width;
            const imgY = ((Math.PI / 2 - inv.lat) / Math.PI) * originalImage.height;
            const sampleX = Math.floor(imgX);
            const sampleY = Math.floor(imgY);
            if (sampleX >= 0 && sampleX < originalImage.width && sampleY >= 0 && sampleY < originalImage.height) {
                const offIndex = (sampleY * originalImage.width + sampleX) * 4;
                data[idx] = offData[offIndex];
                data[idx + 1] = offData[offIndex + 1];
                data[idx + 2] = offData[offIndex + 2];
                data[idx + 3] = offData[offIndex + 3];
            } else {
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
                data[idx + 3] = 255;
            }
        }
    }
    projCtx.putImageData(output, 0, 0);

    // draw the projected image onto the main canvas
    ctx.clearRect(0, 0, width, height);

    // adds a circular mask for orthographic and stereographic projections
    if (projectionType === 'ortho' || projectionType === 'stereo') {
        ctx.save();
        ctx.beginPath();
        const R = Math.min(width, height) / 2;
        ctx.arc(width / 2, height / 2, R, 0, 2 * Math.PI);
        ctx.clip();
        ctx.drawImage(projCanvas, 0, 0);
        ctx.restore();

        // outline
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, R, 0, 2 * Math.PI);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
    } else {
        // for other projections, just draw the image
        ctx.drawImage(projCanvas, 0, 0);
    }

    // graticules! on top
    const graticuleOptions = {
        lonSpacing: parseFloat(graticuleLonSpacingInput.value) || 15,
        latSpacing: parseFloat(graticuleLatSpacingInput.value) || 15,
        offset: parseFloat(graticuleOffsetInput.value) || 0,
        color: graticuleColorInput.value || '#ffffff',
        lineWidth: parseFloat(graticuleLineWidthInput.value) || 1,
        strokeStyle: graticuleStyleInput.value || 'solid'
    };
    const graticule = new Graticule(projection, graticuleOptions);
    graticule.draw(ctx, width, height);
}