// src/yolo-utils.js
import { Tensor } from 'onnxruntime-web';

/**
 * Preprocesses a single video frame for YOLOv5 inference.
 * @param {HTMLCanvasElement} canvas - The canvas containing the video frame.
 * @param {number} modelWidth - The width the model expects (e.g., 640).
 * @param {number} modelHeight - The height the model expects (e.g., 640).
 * @returns {Tensor} The preprocessed tensor.
 */
export function preprocess(canvas, modelWidth, modelHeight) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;

    // Create a temporary canvas to resize the image
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = modelWidth;
    resizedCanvas.height = modelHeight;
    const resizedCtx = resizedCanvas.getContext('2d');
    resizedCtx.drawImage(canvas, 0, 0, modelWidth, modelHeight);
    const resizedImageData = resizedCtx.getImageData(0, 0, modelWidth, modelHeight);
    const resizedData = resizedImageData.data;

    const red = [], green = [], blue = [];
    // Normalize and separate channels (HWC to CHW)
    for (let i = 0; i < resizedData.length; i += 4) {
        red.push(resizedData[i] / 255.0);
        green.push(resizedData[i + 1] / 255.0);
        blue.push(resizedData[i + 2] / 255.0);
    }
    
    // Concatenate channels to form CHW format
    const transposedData = [...red, ...green, ...blue];
    const float32Data = new Float32Array(transposedData);
    
    // Create the tensor
    const inputTensor = new Tensor('float32', float32Data, [1, 3, modelHeight, modelWidth]);
    return inputTensor;
}

/**
 * Runs Non-Max Suppression (NMS) on the bounding boxes.
 * (A simplified version of NMS)
 * @param {Array<Object>} boxes - Array of detected boxes.
 * @param {number} iouThreshold - The IOU threshold for suppression.
 * @returns {Array<Object>} The filtered boxes.
 */
function nonMaxSuppression(boxes, iouThreshold) {
    boxes.sort((a, b) => b.confidence - a.confidence);
    const selected = [];
    
    while (boxes.length > 0) {
        const best = boxes.shift();
        selected.push(best);
        
        boxes = boxes.filter(box => {
            const iou = calculateIoU(best.box, box.box);
            return iou < iouThreshold;
        });
    }
    return selected;
}

function calculateIoU(box1, box2) {
    const [x1, y1, x2, y2] = box1;
    const [x3, y3, x4, y4] = box2;

    const interX1 = Math.max(x1, x3);
    const interY1 = Math.max(y1, y3);
    const interX2 = Math.min(x2, x4);
    const interY2 = Math.min(y2, y4);

    const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
    const box1Area = (x2 - x1) * (y2 - y1);
    const box2Area = (x4 - x3) * (y4 - y3);

    return interArea / (box1Area + box2Area - interArea);
}


/**
 * Post-processes the raw output from the YOLOv5 model.
 * @param {Tensor} outputTensor - The model's output tensor.
 * @param {number} confidenceThreshold - The confidence threshold to filter detections.
 * @param {number} iouThreshold - The IOU threshold for NMS.
 * @returns {Array<Object>} A list of processed detections.
 */
const postprocess = (outputTensor, confidenceThreshold = 0.25, iouThreshold = 0.45) => {
    const data = outputTensor.data;
    const boxes = [];

    // The output shape is typically [batch_size, num_detections, 5 + num_classes]
    // For YOLOv5, it's often [1, 25200, 6] for a 1-class model
    const numDetections = outputTensor.dims[1];
    const numColumns = outputTensor.dims[2];

    for (let i = 0; i < numDetections; ++i) {
        const offset = i * numColumns;
        const confidence = data[offset + 4];

        if (confidence < confidenceThreshold) {
            continue;
        }

        const classScore = data[offset + 5]; // Assuming class is at index 5
        if (classScore < confidenceThreshold) {
            continue;
        }

        const finalConfidence = confidence * classScore;

        if (finalConfidence < confidenceThreshold) {
            continue;
        }

        const cx = data[offset + 0];
        const cy = data[offset + 1];
        const w = data[offset + 2];
        const h = data[offset + 3];

        const x1 = cx - w / 2;
        const y1 = cy - h / 2;
        const x2 = cx + w / 2;
        const y2 = cy + h / 2;

        boxes.push({
            x: cx,
            y: cy,
            box: [x1, y1, x2, y2],
            confidence: finalConfidence,
            class_id: 0, // Assuming class 0
        });
    }

    // Apply Non-Max Suppression
    const finalBoxes = nonMaxSuppression(boxes, iouThreshold);
    return finalBoxes;
}

export { postprocess };