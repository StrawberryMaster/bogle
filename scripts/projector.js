// ─────────── Module imports ─────────────
import { 
    createProjection, 
    createGraticule, 
    needsCircularClipping, 
    projectionConfigs,
    projectCoordinates,
    invertCoordinates
} from './d3-projections.js';

// Use D3.js projection configurations
const projectionTypes = projectionConfigs;

// this is a factory function that creates a projection based on the type
// now using D3.js projections for better maintainability
function createProjectionWrapper(type, centerLat, centerLon, edgeAngleOrMaxLat) {
    const width = canvas.width;
    const height = canvas.height;
    return createProjection(type, centerLat, centerLon, edgeAngleOrMaxLat, width, height);
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
const downloadBtn = document.getElementById('downloadBtn'); // added

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

// Performance optimization flags
let isInitialImageLoad = false;
let lastProjectionState = null;

// Cache for performance optimization
let projectionCache = {
    lastParams: null,
    lastResult: null,
    canvas: null,
    ctx: null
};

// Initialize cache canvas
function initProjectionCache() {
    if (!projectionCache.canvas) {
        projectionCache.canvas = document.createElement('canvas');
        projectionCache.ctx = projectionCache.canvas.getContext('2d');
    }
}

// ─────────── Mouse/Touch interaction for direct coordinate manipulation ─────────────
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };

canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);
canvas.addEventListener('mouseleave', handleMouseUp);

// Touch events for mobile support
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd);

function handleMouseDown(e) {
    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    lastMousePos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
    canvas.style.cursor = 'grabbing';
}

function handleMouseMove(e) {
    if (!isDragging) return;
    
    const rect = canvas.getBoundingClientRect();
    const currentPos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
    
    updateCenterFromDrag(lastMousePos, currentPos);
    lastMousePos = currentPos;
}

function handleMouseUp() {
    isDragging = false;
    canvas.style.cursor = 'grab';
}

function handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        isDragging = true;
        lastMousePos = {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    if (!isDragging || e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const currentPos = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
    };
    
    updateCenterFromDrag(lastMousePos, currentPos);
    lastMousePos = currentPos;
}

function handleTouchEnd(e) {
    e.preventDefault();
    isDragging = false;
}

function updateCenterFromDrag(lastPos, currentPos) {
    const deltaX = currentPos.x - lastPos.x;
    const deltaY = currentPos.y - lastPos.y;
    
    // Convert screen delta to geographic delta based on projection type
    let lonDelta = 0;
    let latDelta = 0;
    
    if (projectionType === 'mercator') {
        // For Mercator, simple linear mapping works well
        const sensitivity = 0.3; // Adjust sensitivity as needed
        lonDelta = -deltaX * sensitivity;
        latDelta = deltaY * sensitivity;
    } else if (projectionType === 'ortho' || projectionType === 'stereo') {
        // For spherical projections, use rotation logic
        const sensitivity = 0.5;
        lonDelta = -deltaX * sensitivity;
        latDelta = deltaY * sensitivity;
    }
    
    // Update center coordinates with bounds checking
    centerLon = Math.max(-180, Math.min(180, centerLon + lonDelta));
    centerLat = Math.max(-90, Math.min(90, centerLat + latDelta));
    
    // Update input fields
    centerLonInput.value = centerLon.toFixed(2);
    centerLatInput.value = centerLat.toFixed(2);
    
    // Redraw with debouncing for smooth interaction
    debounceDraw();
}

// Set initial cursor style
canvas.style.cursor = 'grab';
uploadInput.addEventListener('change', handleFileUpload);
updateBtn.addEventListener('click', updateAndDraw);
downloadBtn.addEventListener('click', handleDownload); // added

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
    }, 50); // Reduced from 100ms to 50ms for smoother interaction
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
            isInitialImageLoad = true; // Flag for showing processing indicator only on initial load
            
            // Clear cache when new image is loaded
            projectionCache.lastParams = null;
            projectionCache.sourceData = null;
            
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
    const projection = createProjectionWrapper(projectionType, centerLat, centerLon, edgeAngle);
    const graticuleOptions = getGraticuleOptions();
    
    // Create D3 graticule with projection-specific parameters
    const graticule = createGraticule({
        ...graticuleOptions,
        projectionType: projectionType,
        centerLon: centerLon,
        centerLat: centerLat
    });
    
    drawGraticuleD3(projection, graticule, width, height);
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

    // Only show processing indicator for initial image load of very large images
    // or when projection type changes - not for simple parameter changes like center coordinates
    const currentProjectionState = `${projectionType}-${edgeAngle}`;
    const isProjectionChange = lastProjectionState && lastProjectionState !== currentProjectionState;
    const isVeryLargeImage = originalImage.width * originalImage.height > 1000000; // 1MP instead of 100k pixels
    
    if ((isInitialImageLoad || isProjectionChange) && isVeryLargeImage) {
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'black';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Processing...', width/2, height/2);
        
        // Use setTimeout to allow UI update
        setTimeout(() => {
            processProjection(width, height);
            isInitialImageLoad = false;
            lastProjectionState = currentProjectionState;
        }, 10);
        return;
    }
    
    processProjection(width, height);
    isInitialImageLoad = false;
    lastProjectionState = currentProjectionState;
}

function processProjection(width, height) {
    initProjectionCache();

    if (projCanvas.width !== width || projCanvas.height !== height) {
        projCanvas.width = width;
        projCanvas.height = height;
        // Clear cache when canvas size changes
        projectionCache.lastParams = null;
    }

    const projection = createProjectionWrapper(projectionType, centerLat, centerLon, edgeAngle);

    // Check if we can use cached projection data for small movements
    const currentParams = `${projectionType}-${centerLat.toFixed(3)}-${centerLon.toFixed(3)}-${edgeAngle}-${width}x${height}`;
    const canUseCache = projectionCache.lastParams === currentParams && projectionCache.lastResult;
    
    if (canUseCache) {
        // Use cached result for same parameters
        projCtx.putImageData(projectionCache.lastResult, 0, 0);
    } else {
        // Compute new projection
        const output = projCtx.createImageData(width, height);
        const data32 = new Uint32Array(output.data.buffer);

        // Cache the source image data to avoid repeated getImageData calls
        if (!projectionCache.sourceData || projectionCache.sourceWidth !== originalImage.width || projectionCache.sourceHeight !== originalImage.height) {
            const offCtx = offCanvas.getContext('2d');
            const offImageData = offCtx.getImageData(0, 0, originalImage.width, originalImage.height);
            projectionCache.sourceData = new Uint32Array(offImageData.data.buffer);
            projectionCache.sourceWidth = originalImage.width;
            projectionCache.sourceHeight = originalImage.height;
        }

        const offData32 = projectionCache.sourceData;
        const imgWidth = originalImage.width;
        const imgHeight = originalImage.height;
        const xScale = imgWidth / 360; // degrees to pixels
        const yScale = imgHeight / 180; // degrees to pixels

        // for every pixel in the output canvas, find the corresponding
        // pixel in the input image and copy the color
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const coords = invertCoordinates(projection, [x, y]);
                const idx = y * width + x;

                if (!coords) {
                    data32[idx] = 0xFFFFFFFF; // white background
                    continue;
                }

                const [lon, lat] = coords;
                
                // Convert longitude/latitude to image coordinates
                // Image coordinates: 0,0 is top-left, lon=[-180,180], lat=[-90,90]
                const imgX = (lon + 180) * xScale;
                const imgY = (90 - lat) * yScale; // flip Y axis

                // Use bilinear interpolation for better quality
                const x0 = Math.floor(imgX);
                const y0 = Math.floor(imgY);
                
                if (x0 >= 0 && x0 < imgWidth && y0 >= 0 && y0 < imgHeight) {
                    data32[idx] = offData32[y0 * imgWidth + x0];
                } else {
                    data32[idx] = 0xFFFFFFFF; // white background
                }
            }
        }

        projCtx.putImageData(output, 0, 0);
        
        // Cache the result for potential reuse
        projectionCache.lastParams = currentParams;
        projectionCache.lastResult = output;
    }

    // draw the projected image onto the main canvas
    ctx.clearRect(0, 0, width, height);

    // checks if the projection needs a circular mask
    if (needsCircularClipping(projectionType)) {
        const R = Math.min(width, height) / 2; // Use full canvas radius to match projection scale
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
    const graticule = createGraticule({
        ...graticuleOptions,
        projectionType: projectionType,
        centerLon: centerLon,
        centerLat: centerLat
    });
    drawGraticuleD3(projection, graticule, width, height);
}

// Draw graticule using D3.js generator
function drawGraticuleD3(projection, graticule, width, height) {
    const graticuleOptions = getGraticuleOptions();
    
    if (graticuleOptions.strokeStyle === 'none') {
        return;
    }
    
    ctx.save();
    ctx.strokeStyle = graticuleOptions.color;
    ctx.lineWidth = graticuleOptions.lineWidth;
    
    // Set line dash pattern
    switch (graticuleOptions.strokeStyle) {
        case 'dash':
            ctx.setLineDash([5, 5]);
            break;
        case 'dot':
            ctx.setLineDash([2, 3]);
            break;
        case 'dashdot':
            ctx.setLineDash([5, 3, 2, 3]);
            break;
        default:
            ctx.setLineDash([]);
    }
    
    // Create D3 path generator
    const pathGenerator = d3.geoPath().projection(projection).context(ctx);
    
    // Draw graticule lines
    ctx.beginPath();
    pathGenerator(graticule());
    ctx.stroke();
    
    ctx.restore();
}

// ─────────── Download/export helpers ─────────────
function handleDownload() {
    // ensure latest frame is rendered before capture
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    drawEverything();
    requestAnimationFrame(() => {
        const filename = buildFilename();
        if (canvas.toBlob) {
            canvas.toBlob(blob => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }, 'image/png');
        } else {
            // fallback for older browsers
            const dataURL = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = dataURL;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
    });
}

function buildFilename() {
    const kind = originalImage ? 'map' : 'graticule';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `bogle_${projectionType}_${kind}_${stamp}.png`;
}

drawEverything();