// ─────────── Module imports ─────────────
import Graticule from './graticule.js';
import OrthographicProjection from './projections/orthographic.js';
import MercatorProjection from './projections/mercator.js';
import StereographicProjection from './projections/stereographic.js';

// ─────────── Projections ─────────────
const projectionTypes = {
    'ortho': {
        name: 'Orthographic',
        class: OrthographicProjection,
        edgeAngleName: 'Edge angle (°)',
        min: 0,
        max: 90
    },
    'mercator': {
        name: 'Mercator',
        class: MercatorProjection,
        edgeAngleName: 'Max latitude (°)',
        min: 45,
        max: 89.9
    },
    'stereo': {
        name: 'Stereographic',
        class: StereographicProjection,
        edgeAngleName: 'Edge angle (°)',
        min: 0,
        max: 150
    }
};

const projectionCache = new Map();
const MAX_CACHE_SIZE = 20;

// this is a factory function that creates a projection based on the type
// should be quite useful when adding more projections
function createProjection(type, centerLat, centerLon, edgeAngleOrMaxLat) {
    type = projectionTypes[type] ? type : 'ortho';
    centerLat = Number.isFinite(centerLat) ? centerLat : 0;
    centerLon = Number.isFinite(centerLon) ? centerLon : 0;
    edgeAngleOrMaxLat = Number.isFinite(edgeAngleOrMaxLat) ? edgeAngleOrMaxLat : 90;

    const cacheKey = `${type}:${centerLat.toFixed(2)}:${centerLon.toFixed(2)}:${edgeAngleOrMaxLat.toFixed(2)}`;

    if (projectionCache.has(cacheKey)) {
        return projectionCache.get(cacheKey);
    }

    const projectionType = projectionTypes[type] || projectionTypes.ortho;
    const projection = new projectionType.class(centerLat, centerLon, edgeAngleOrMaxLat);

    if (projectionCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = projectionCache.keys().next().value;
        projectionCache.delete(oldestKey);
    }

    projectionCache.set(cacheKey, projection);
    return projection;
}

// ─────────── Global variables and offscreen canvases ─────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let originalImage = null;

// we reuse this offscreen canvas for rendering the original image
const offCanvas = document.createElement('canvas');
offCanvas.style.display = 'none';
document.body.appendChild(offCanvas);

const projCanvas = document.createElement('canvas');
const projCtx = projCanvas.getContext('2d');

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
    const projConfig = projectionTypes[projectionType] || projectionTypes['ortho'];

    const edgeLabel = document.querySelector('label[for="edgeAngle"]');
    edgeLabel.textContent = `${projConfig.edgeAngleName} (${projConfig.min}-${projConfig.max}°):`;

    edgeAngleInput.min = projConfig.min;
    edgeAngleInput.max = projConfig.max;

    // make sure the current value is within the bounds
    const currentValue = parseFloat(edgeAngleInput.value);
    if (currentValue < projConfig.min) edgeAngleInput.value = projConfig.min;
    if (currentValue > projConfig.max) edgeAngleInput.value = projConfig.max;

    updateAndDraw();
});

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

    if (projCanvas.width !== width || projCanvas.height !== height) {
        projCanvas.width = width;
        projCanvas.height = height;
    }

    const projection = createProjection(projectionType, centerLat, centerLon, edgeAngle);

    // preparing an ImageData buffer for the projected image
    const output = projCtx.createImageData(width, height);
    const data32 = new Uint32Array(output.data.buffer);

    const offCtx = offCanvas.getContext('2d');
    const offImageData = offCtx.getImageData(0, 0, originalImage.width, originalImage.height);
    const offData32 = new Uint32Array(offImageData.data.buffer);

    const imgWidth = originalImage.width;
    const imgHeight = originalImage.height;
    const xScale = imgWidth / (2 * Math.PI);
    const yScale = imgHeight / Math.PI;

    // for every pixel in the output canvas, find the corresponding
    // pixel in the input image and copy the color
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const inv = projection.inverse(x, y, width, height);
            const idx = y * width + x;

            if (!inv.visible) {
                data32[idx] = 0xFFFFFFFF;
                continue;
            }

            const imgX = (inv.lon + Math.PI) * xScale;
            const imgY = (Math.PI / 2 - inv.lat) * yScale;

            const x0 = Math.floor(imgX);
            const y0 = Math.floor(imgY);

            if (x0 >= 0 && x0 < imgWidth && y0 >= 0 && y0 < imgHeight) {
                data32[idx] = offData32[y0 * imgWidth + x0];
            } else {
                data32[idx] = 0xFFFFFFFF;
            }
        }
    }

    projCtx.putImageData(output, 0, 0);

    // draw the projected image onto the main canvas
    ctx.clearRect(0, 0, width, height);

    // checks if the projection needs a circular mask
    if (projection.needsCircularClipping()) {
        const R = Math.min(width, height) / 2;
        ctx.save();
        ctx.beginPath();
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