// Web Worker for projection image processing
self.onmessage = function(e) {
    const { 
        imageData, 
        projectionConfig, 
        canvasWidth, 
        canvasHeight,
        imgWidth,
        imgHeight 
    } = e.data;
    
    // Import projection classes
    importScripts('/scripts/utils.js');
    importScripts('/scripts/projections/base.js');
    importScripts('/scripts/projections/orthographic.js');
    importScripts('/scripts/projections/mercator.js');
    importScripts('/scripts/projections/stereographic.js');
    
    // Create projection instance
    let projection;
    switch(projectionConfig.type) {
        case 'mercator':
            projection = new MercatorProjection(
                projectionConfig.centerLat, 
                projectionConfig.centerLon, 
                projectionConfig.edgeAngle
            );
            break;
        case 'stereo':
            projection = new StereographicProjection(
                projectionConfig.centerLat, 
                projectionConfig.centerLon, 
                projectionConfig.edgeAngle
            );
            break;
        default:
            projection = new OrthographicProjection(
                projectionConfig.centerLat, 
                projectionConfig.centerLon, 
                projectionConfig.edgeAngle
            );
    }
    
    // Process pixels
    const outputData = new Uint32Array(canvasWidth * canvasHeight);
    const inputData = new Uint32Array(imageData);
    
    const xScale = imgWidth / (2 * Math.PI);
    const yScale = imgHeight / Math.PI;
    
    for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
            const inv = projection.inverse(x, y, canvasWidth, canvasHeight);
            const idx = y * canvasWidth + x;
            
            if (!inv.visible) {
                outputData[idx] = 0xFFFFFFFF; // White
                continue;
            }
            
            const imgX = (inv.lon + Math.PI) * xScale;
            const imgY = (Math.PI / 2 - inv.lat) * yScale;
            
            const x0 = Math.floor(imgX);
            const y0 = Math.floor(imgY);
            
            if (x0 >= 0 && x0 < imgWidth && y0 >= 0 && y0 < imgHeight) {
                outputData[idx] = inputData[y0 * imgWidth + x0];
            } else {
                outputData[idx] = 0xFFFFFFFF; // White
            }
        }
    }
    
    // Send result back
    self.postMessage({
        outputData: outputData.buffer,
        width: canvasWidth,
        height: canvasHeight
    }, [outputData.buffer]);
};