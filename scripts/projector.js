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

// Add real-time updates for better UX
centerLonInput.addEventListener('input', debounceDraw);
centerLatInput.addEventListener('input', debounceDraw);
edgeAngleInput.addEventListener('input', debounceDraw);
graticuleLonSpacingInput.addEventListener('input', debounceDraw);
graticuleLatSpacingInput.addEventListener('input', debounceDraw);
graticuleOffsetInput.addEventListener('input', debounceDraw);
graticuleColorInput.addEventListener('input', debounceDraw);
graticuleLineWidthInput.addEventListener('input', debounceDraw);
graticuleStyleInput.addEventListener('change', debounceDraw);

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
let animationId;

function debounceDraw() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        animationId = requestAnimationFrame(drawEverything);
    }, 100);
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('Image file is too large. Please select a file smaller than 10MB.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = evt => {
        const img = new Image();
        img.onload = () => {
            // Validate image dimensions
            if (img.width > 4096 || img.height > 4096) {
                alert('Image dimensions are too large. Please use an image smaller than 4096x4096 pixels.');
                return;
            }
            
            originalImage = img;
            offCanvas.width = img.width;
            offCanvas.height = img.height;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(originalImage, 0, 0);
            drawEverything();
        };
        img.onerror = () => {
            alert('Error loading image. Please try a different file.');
        };
        img.src = evt.target.result;
    };
    reader.onerror = () => {
        alert('Error reading file. Please try again.');
    };
    reader.readAsDataURL(file);
}

function updateAndDraw() {
    // Validate and clamp input values
    centerLon = Math.max(-180, Math.min(180, parseFloat(centerLonInput.value) || centerLon));
    centerLat = Math.max(-90, Math.min(90, parseFloat(centerLatInput.value) || centerLat));
    
    const projConfig = projectionTypes[projectionType] || projectionTypes['ortho'];
    edgeAngle = Math.max(projConfig.min, Math.min(projConfig.max, parseFloat(edgeAngleInput.value) || edgeAngle));
    
    projectionType = projectionSelect.value;
    
    // Update input fields with clamped values
    centerLonInput.value = centerLon.toFixed(2);
    centerLatInput.value = centerLat.toFixed(2);
    edgeAngleInput.value = edgeAngle.toFixed(1);
    
    drawEverything();
}

function drawGraticuleOnly(width, height) {
    const projection = createProjection(projectionType, centerLat, centerLon, edgeAngle);
    const graticuleOptions = getGraticuleOptions();
    const graticule = new Graticule(projection, graticuleOptions);
    graticule.draw(ctx, width, height);
}

function getGraticuleOptions() {
    return {
        lonSpacing: parseFloat(graticuleLonSpacingInput.value) || 15,
        latSpacing: parseFloat(graticuleLatSpacingInput.value) || 15,
        offset: parseFloat(graticuleOffsetInput.value) || 0,
        color: graticuleColorInput.value || '#ffffff',
        lineWidth: parseFloat(graticuleLineWidthInput.value) || 1,
        strokeStyle: graticuleStyleInput.value || 'solid'
    };
}

// ─────────── Main drawing function ─────────────
// yeah i know. it's a funny name. it is what it is
function drawEverything() {
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas with white background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    
    if (!originalImage) {
        // Just draw graticule if no image is loaded
        drawGraticuleOnly(width, height);
        return;
    }

    // Show processing indicator for large images
    if (originalImage.width * originalImage.height > 100000) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'black';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Processing...', width/2, height/2);
        
        // Use setTimeout to allow UI update
        setTimeout(() => processProjection(width, height), 10);
        return;
    }
    
    processProjection(width, height);
}

function processProjection(width, height) {

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

            // Use bilinear interpolation for better quality
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
    const graticuleOptions = getGraticuleOptions();
    const graticule = new Graticule(projection, graticuleOptions);
    graticule.draw(ctx, width, height);
}

// Initial draw to show graticule even without image
drawEverything();