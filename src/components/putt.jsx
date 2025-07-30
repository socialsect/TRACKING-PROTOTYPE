import React, { useRef, useState, useEffect } from "react";
import axios from "axios";

const MAX_PUTTS = 3;
const API_URL = "http://localhost:8000/analyze-ball/";

// Golf Ball Physics Kalman Filter
class GolfBallKalmanFilter {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.initialized = false;
        this.lastUpdate = Date.now();
        this.confidence = 0;
        this.stationaryCount = 0;
    }

    filter(measurement) {
        const now = Date.now();
        const dt = Math.min((now - this.lastUpdate) / 1000, 0.2);
        this.lastUpdate = now;

        if (!measurement || measurement.length < 2) {
            if (this.initialized && this.confidence > 0.2) {
                this.confidence *= 0.85;
               
                this.x += this.vx * dt;
                this.y += this.vy * dt;
               
                const friction = 0.92;
                this.vx *= friction;
                this.vy *= friction;
               
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (speed < 5) {
                    this.vx *= 0.8;
                    this.vy *= 0.8;
                    this.stationaryCount++;
                } else {
                    this.stationaryCount = 0;
                }
               
                return [this.x, this.y];
            }
            return null;
        }

        const [mx, my] = measurement;
       
        if (!this.initialized) {
            this.x = mx;
            this.y = my;
            this.vx = 0;
            this.vy = 0;
            this.initialized = true;
            this.confidence = 1.0;
            this.stationaryCount = 0;
            // console.log(`🎯 Kalman filter initialized at: (${mx.toFixed(1)}, ${my.toFixed(1)})`);
            return [this.x, this.y];
        }

        const dx = mx - this.x;
        const dy = my - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
       
        const smoothingFactor = distance > 15 ? 0.8 : 0.4;
       
        const newVx = dx / dt;
        const newVy = dy / dt;
        this.vx = smoothingFactor * newVx + (1 - smoothingFactor) * this.vx;
        this.vy = smoothingFactor * newVy + (1 - smoothingFactor) * this.vy;
       
        this.x = smoothingFactor * mx + (1 - smoothingFactor) * this.x;
        this.y = smoothingFactor * my + (1 - smoothingFactor) * this.y;
       
        this.confidence = 1.0;
        this.stationaryCount = 0;
       
        return [this.x, this.y];
    }

    getConfidence() {
        return this.confidence;
    }

    isStationary() {
        return this.stationaryCount > 5;
    }
}

// Path smoothing function
const smoothPath = (path, windowSize = 3) => {
    if (path.length < windowSize) return path;

    const smoothed = [];

    for (let i = 0; i < path.length; i++) {
        if (path[i].x === undefined || path[i].y === undefined) {
            smoothed.push(path[i]);
            continue;
        }

        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(path.length, i + Math.floor(windowSize / 2) + 1);

        let sumX = 0, sumY = 0, count = 0;

        for (let j = start; j < end; j++) {
            if (path[j].x !== undefined && path[j].y !== undefined) {
                sumX += path[j].x;
                sumY += path[j].y;
                count++;
            }
        }

        if (count > 0) {
            smoothed.push({
                ...path[i],
                x: sumX / count,
                y: sumY / count
            });
        } else {
            smoothed.push(path[i]);
        }
    }

    return smoothed;
};

const ControlButton = ({ onClick, children, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        style={styles.controlButton}
    >
        {children}
    </button>
);

const AnalysisModal = ({ data, onReset }) => (
    <div style={styles.modal}>
        <h2>Putt Analysis Complete</h2>
        <p><strong>Average Direction:</strong> {data.averageDirection}°</p>
        <p><strong>Average Dispersion:</strong> {data.averageDispersion} px</p>
        <hr style={{ margin: '20px 0', borderColor: 'rgba(255,255,255,0.3)' }} />
        <p>{data.recommendation}</p>
        <ControlButton onClick={onReset} style={{ marginTop: 20 }}>
            Retry (3 More Putts)
        </ControlButton>
    </div>
);

function App() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const lastDetectionBox = useRef(null);
    const framesSinceDetection = useRef(0);
    const processingRequest = useRef(false);
    const detectionHistory = useRef([]);

    const [videoDevices, setVideoDevices] = useState([]);
    const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [puttCount, setPuttCount] = useState(0);
    const [completedPaths, setCompletedPaths] = useState([]);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [cameraError, setCameraError] = useState('');
    const [currentPath, setCurrentPath] = useState([]);
    const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

    const kf = useRef(new GolfBallKalmanFilter());

    // Calculate center line and starting point positions
    const getCenterLineX = () => canvasDimensions.width / 2;
    const getStartingPoint = () => ({
        x: getCenterLineX(),
        y: canvasDimensions.height * 0.8
    });

    // Debug current path changes
    useEffect(() => {
        if (currentPath.length > 0) {
            const lastPoint = currentPath[currentPath.length - 1];
            // console.log(`Path: ${currentPath.length} points, last: (${lastPoint.x?.toFixed(1)}, ${lastPoint.y?.toFixed(1)}) ${lastPoint.predicted ? '[PRED]' : '[DET]'}`);
        }
    }, [currentPath]);

    // Camera setup
    useEffect(() => {
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            setVideoDevices(videoInputs);
            if (videoInputs.length > 0) setCurrentDeviceIndex(0);
            else setCameraError("No camera found.");
        });
    }, []);

 useEffect(() => {
    if (videoDevices.length === 0) return;
    const deviceId = videoDevices[currentDeviceIndex]?.deviceId;
    if (!deviceId) return;
    
    const startCamera = async () => {
        try {
            // Stop any existing stream completely
            if (videoRef.current?.srcObject) {
                const tracks = videoRef.current.srcObject.getTracks();
                tracks.forEach(track => {
                    track.stop();
                });
                videoRef.current.srcObject = null;
            }
            
            // Request new stream with the selected device
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: { exact: deviceId }, // Use exact constraint
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                }
            });
            
            if (videoRef.current) {
                // Set the new stream
                videoRef.current.srcObject = stream;
                
                // Wait for the video to be ready
                await new Promise((resolve) => {
                    videoRef.current.onloadedmetadata = resolve;
                });
                
                // Update canvas dimensions and loading state
                updateCanvasDimensions();
                setIsLoading(false);
                
                // Start playing the video
                await videoRef.current.play();
            }
        } catch (err) {
            console.error("Camera switching error:", err);
            setCameraError("Could not switch camera. Please try again.");
            setIsLoading(false);
        }
    };
    
    startCamera();
}, [videoDevices, currentDeviceIndex]);

    const updateCanvasDimensions = () => {
        if (canvasRef.current && videoRef.current) {
            const rect = videoRef.current.getBoundingClientRect();
            canvasRef.current.width = rect.width;
            canvasRef.current.height = rect.height;
            setCanvasDimensions({ width: rect.width, height: rect.height });
        }
    };

    useEffect(() => {
        const handleResize = () => {
            updateCanvasDimensions();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

const switchCamera = () => {
    if (videoDevices.length < 2 || isRecording) return;
    
    // Add this to clear any existing camera errors
    setCameraError('');
    setIsLoading(true);
    
    setCurrentDeviceIndex(prev => (prev + 1) % videoDevices.length);
};
    const handleToggleRecording = () => {
        setIsRecording(prev => {
            const isStopping = prev;
            if (isStopping && currentPath.length > 1) {
                setCompletedPaths(paths => [...paths, currentPath]);
                setPuttCount(count => count + 1);
            }
            setCurrentPath([]);
            framesSinceDetection.current = 0;
            processingRequest.current = false;
            detectionHistory.current = [];
            kf.current = new GolfBallKalmanFilter();
            // console.log("Recording toggled, new state:", !isStopping);
            return !isStopping;
        });
    };

    const isValidBallDetection = (detection, videoRect, previousDetections = []) => {
        if (!detection.box || detection.box.length !== 4) return false;
       
        const [x1, y1, x2, y2] = detection.box;
        const width = x2 - x1;
        const height = y2 - y1;
       
        // Scale to display coordinates
        const scaleX = videoRect.width / videoRef.current.videoWidth;
        const scaleY = videoRect.height / videoRef.current.videoHeight;
        const displayWidth = width * scaleX;
        const displayHeight = height * scaleY;
       
        // console.log(`🔍 Detection details:`);
        // console.log(`   Confidence: ${detection.confidence?.toFixed(3)}`);
        // console.log(`   Size: ${displayWidth.toFixed(1)}x${displayHeight.toFixed(1)} pixels`);
        // console.log(`   Position: (${detection.x?.toFixed(1)}, ${detection.y?.toFixed(1)})`);
       
        const isValid = detection.confidence > 0.25;
       
        // console.log(`   ✅ ACCEPTED: ${isValid} (confidence > 0.25)`);
       
        return isValid;
    };

    // Detection processing with FIXED coordinate scaling
    useEffect(() => {
        if (!isRecording) return;

        const processFrame = async () => {
            if (processingRequest.current) {
                return;
            }

            if (!videoRef.current || videoRef.current.readyState < 2 || !videoRef.current.videoWidth) {
                return;
            }

            processingRequest.current = true;

            try {
                const tempCanvas = document.createElement("canvas");
                // ✅ FIX: Use actual video dimensions for backend processing
                tempCanvas.width = videoRef.current.videoWidth;
                tempCanvas.height = videoRef.current.videoHeight;
                const tempCtx = tempCanvas.getContext("2d");

                tempCtx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);

                tempCanvas.toBlob(async (blob) => {
                    if (!blob) {
                        processingRequest.current = false;
                        return;
                    }

                    const formData = new FormData();
                    formData.append("file", blob, "frame.jpg");

                    try {
                        const startTime = Date.now();
                        const res = await axios.post(API_URL, formData, {
                            timeout: 1500
                        });
                        const processingTime = Date.now() - startTime;
                        // console.log(`Backend time: ${processingTime}ms`);

                        const detections = res.data.detections;

                        // console.log(`🔍 Raw detections: ${detections?.length || 0}`);
                        detections?.forEach((det, i) => {
                            const [x1, y1, x2, y2] = det.box || [];
                            const width = x2 - x1;
                            const height = y2 - y1;
                            // console.log(`  Det ${i}: conf=${det.confidence.toFixed(3)}, size=${width}x${height}, pos=(${det.x}, ${det.y})`);
                        });

                        if (detections?.length > 0) {
                            const videoRect = videoRef.current.getBoundingClientRect();

                            // console.log(`🔍 Processing ${detections.length} raw detections:`);

                            detections.forEach((det, i) => {
                                // console.log(`Raw Detection ${i}:`, {
                                //     confidence: det.confidence?.toFixed(3),
                                //     class: det.class_name || 'unknown',
                                //     box: det.box,
                                //     center: `(${det.x?.toFixed(1)}, ${det.y?.toFixed(1)})`
                                // });
                            });

                            const validDetections = detections.filter(det =>
                                isValidBallDetection(det, videoRect, detectionHistory.current)
                            );

                            // console.log(`✅ Valid detections after filtering: ${validDetections.length}/${detections.length}`);

                            if (validDetections.length > 0) {
                                framesSinceDetection.current = 0;

                                const bestDet = validDetections.reduce((a, b) =>
                                    a.confidence > b.confidence ? a : b
                                );

                                // console.log(`🎯 Best detection: conf=${bestDet.confidence?.toFixed(3)}, pos=(${bestDet.x?.toFixed(1)}, ${bestDet.y?.toFixed(1)}), class=${bestDet.class_name || 'unknown'}`);

                                // ✅ FIX: Correct coordinate scaling
                                // Backend returns coordinates in original video dimensions
                                // We need to scale to display dimensions
                                const scaleX = videoRect.width / videoRef.current.videoWidth;
                                const scaleY = videoRect.height / videoRef.current.videoHeight;

                                const scaledX = bestDet.x * scaleX;
                                const scaledY = bestDet.y * scaleY;

                                // console.log(`📍 Video dimensions: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
                                // console.log(`📍 Display dimensions: ${videoRect.width.toFixed(1)}x${videoRect.height.toFixed(1)}`);
                                // console.log(`📍 Scale factors: ${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`);
                                // console.log(`📍 Original position: (${bestDet.x.toFixed(1)}, ${bestDet.y.toFixed(1)})`);
                                // console.log(`📍 Scaled position: (${scaledX.toFixed(1)}, ${scaledY.toFixed(1)})`);

                                detectionHistory.current.push({
                                    x: bestDet.x,
                                    y: bestDet.y,
                                    time: Date.now()
                                });
                                if (detectionHistory.current.length > 10) {
                                    detectionHistory.current.shift();
                                }

                                const smoothed = kf.current.filter([scaledX, scaledY]);

                                if (smoothed && smoothed.length >= 2) {
                                    setCurrentPath(prevPath => {
                                        const newPoint = {
                                            x: smoothed[0],
                                            y: smoothed[1],
                                            predicted: false,
                                            timestamp: Date.now()
                                        };

                                        // console.log(`➕ Adding point: (${newPoint.x.toFixed(1)}, ${newPoint.y.toFixed(1)})`);

                                        return [...prevPath, newPoint];
                                    });
                                }

                                // ✅ FIXED: Scale bounding box coordinates correctly and store confidence
                                if (bestDet.box && bestDet.box.length === 4) {
                                    const [x1, y1, x2, y2] = bestDet.box;
                                    lastDetectionBox.current = {
                                        coords: [
                                            x1 * scaleX,
                                            y1 * scaleY,
                                            x2 * scaleX,
                                            y2 * scaleY
                                        ],
                                        confidence: bestDet.confidence
                                    };
                                    // console.log(`📦 Original box: [${bestDet.box.map(v => v.toFixed(1)).join(', ')}]`);
                                    // console.log(`📦 Scaled box: [${lastDetectionBox.current.coords.map(v => v.toFixed(1)).join(', ')}]`);
                                    // console.log(`📦 Confidence: ${bestDet.confidence.toFixed(3)}`);
                                }
                            } else {
                                // console.log("❌ All detections were filtered out. Reasons might be:");
                                detections.forEach((det, i) => {
                                    // console.log(`   Detection ${i}: conf=${det.confidence?.toFixed(3)} - ${det.confidence > 0.3 ? 'PASSED' : 'FAILED confidence'}`);
                                });
                                handleMissedDetection();
                            }
                        } else {
                            // console.log("❌ No detections from backend");
                            handleMissedDetection();
                        }
                    } catch (error) {
                        console.error("Backend error:", error.message);
                        handleMissedDetection();
                    } finally {
                        processingRequest.current = false;
                    }
                }, "image/jpeg", 0.8);
            } catch (error) {
                console.error("Frame processing error:", error);
                processingRequest.current = false;
            }
        };

        const handleMissedDetection = () => {
            framesSinceDetection.current++;

            if (framesSinceDetection.current <= 3 && kf.current.getConfidence() > 0.4) {
                const predicted = kf.current.filter(null);
                if (predicted && predicted.length >= 2) {
                    // console.log(`🔮 Golf ball prediction: (${predicted[0].toFixed(1)}, ${predicted[1].toFixed(1)}) conf=${kf.current.getConfidence().toFixed(2)}`);
                    setCurrentPath(prevPath => [...prevPath, {
                        x: predicted[0],
                        y: predicted[1],
                        predicted: true,
                        timestamp: Date.now()
                    }]);
                }
            }

            if (framesSinceDetection.current > 5) {
                lastDetectionBox.current = null;
            }
        };

        const intervalId = setInterval(processFrame, 100);
        return () => clearInterval(intervalId);
    }, [isRecording]);

    // Enhanced canvas drawing with center line and starting point
    useEffect(() => {
        if (!canvasRef.current) return;

        const ctx = canvasRef.current.getContext("2d");
        const canvas = canvasRef.current;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw center line (vertical line through middle of screen)
        if (canvasDimensions.width > 0) {
            const centerX = getCenterLineX();

            ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 10]);
            ctx.beginPath();
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, canvas.height);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw starting point marker
            const startPoint = getStartingPoint();
            ctx.fillStyle = "transparen";
            ctx.strokeStyle = "rgba(255, 255, 255, 1.0)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, 12, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            // Add text label for starting point
            ctx.fillStyle = "white";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.shadowColor = "black";
            ctx.shadowBlur = 2;
            ctx.fillText("START", startPoint.x, startPoint.y - 25);
            ctx.shadowBlur = 0;
            ctx.textAlign = "left";
        }

        // Draw current path with smoothing
        if (currentPath.length >= 1) {
            const smoothedPath = smoothPath(currentPath, 3);

            if (smoothedPath.length >= 2) {
                ctx.strokeStyle = "#CB0000";
                ctx.lineWidth = 4;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
                ctx.shadowBlur = 2;

                ctx.beginPath();
                let started = false;

                for (let i = 0; i < smoothedPath.length; i++) {
                    const point = smoothedPath[i];
                    if (point.x !== undefined && point.y !== undefined) {
                        if (!started) {
                            ctx.moveTo(point.x, point.y);
                            started = true;
                        } else {
                            if (point.predicted) {
                                ctx.setLineDash([8, 8]);
                                ctx.strokeStyle = "black";
                            } else {
                                ctx.setLineDash([]);
                                ctx.strokeStyle = "r#CB0000";
                            }
                            ctx.lineTo(point.x, point.y);
                        }
                    }
                }
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.shadowBlur = 0;
            }

            // Draw start point (green)
            if (smoothedPath[0]?.x !== undefined) {
                ctx.fillStyle = "white";
                ctx.shadowColor = "black";
                ctx.shadowBlur = 2;
                ctx.beginPath();
                ctx.arc(smoothedPath[0].x, smoothedPath[0].y, 8, 0, 2 * Math.PI);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Draw current position (red/orange)
            const lastPoint = smoothedPath[smoothedPath.length - 1];
            if (lastPoint?.x !== undefined) {
                ctx.fillStyle = lastPoint.predicted ? "#CB0000" : "rgba(255, 0, 0, 1.0)";
                ctx.shadowColor = "black";
                ctx.shadowBlur = 2;
                ctx.beginPath();
                ctx.arc(lastPoint.x, lastPoint.y, 6, 0, 2 * Math.PI);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // Draw completed paths (also smoothed)
        completedPaths.forEach((path, index) => {
            if (path.length >= 2) {
                const smoothedCompletedPath = smoothPath(path, 3);
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + (index * 0.1)})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                let started = false;
                for (let i = 0; i < smoothedCompletedPath.length; i++) {
                    if (smoothedCompletedPath[i].x !== undefined && smoothedCompletedPath[i].y !== undefined) {
                        if (!started) {
                            ctx.moveTo(smoothedCompletedPath[i].x, smoothedCompletedPath[i].y);
                            started = true;
                        } else {
                            ctx.lineTo(smoothedCompletedPath[i].x, smoothedCompletedPath[i].y);
                        }
                    }
                }
                ctx.stroke();
            }
        });

        // ✅ ENHANCED: Draw detection bounding box with confidence score
        if (lastDetectionBox.current && framesSinceDetection.current < 3) {
            const { coords, confidence } = lastDetectionBox.current;
            const [x1, y1, x2, y2] = coords;
            
            // Draw bounding box
            ctx.strokeStyle = "rgba(0, 255, 0, 1.0)";
            ctx.lineWidth = 2;
            ctx.shadowColor = "black";
            ctx.shadowBlur = 1;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            ctx.shadowBlur = 0;

            // Draw label with confidence score
            ctx.fillStyle = "lime";
            ctx.font = "12px Arial";
            ctx.shadowColor = "black";
            ctx.shadowBlur = 1;
            
            // Format confidence as percentage
            const confidencePercent = (confidence * 100).toFixed(1);
            const labelText = `Golf Ball ${confidencePercent}%`;
            
            // Measure text width for background
            const textMetrics = ctx.measureText(labelText);
            const textWidth = textMetrics.width;
            const textHeight = 12;
            
            // Draw background rectangle for better readability
            ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            ctx.fillRect(x1 - 2, y1 - textHeight - 6, textWidth + 4, textHeight + 4);
            
            // Draw text
            ctx.fillStyle = "lime";
            ctx.fillText(labelText, x1, y1 - 3);
            ctx.shadowBlur = 0;
        }

        // Draw info text
        ctx.fillStyle = "white";
        ctx.font = "16px GoodTimes";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 2;
        ctx.fillText(`Putt ${puttCount + 1}/${MAX_PUTTS}`, 10, 30);

        if (currentPath.length > 0) {
            ctx.fillText(`Points: ${currentPath.length}`, 10, 50);
            const predictedCount = currentPath.filter(p => p.predicted).length;
            if (predictedCount > 0) {
                ctx.fillText(`Predicted: ${predictedCount}`, 10, 70);
            }
        }
        if (isRecording) {
            ctx.fillStyle = "red";
            ctx.fillText("● RECORDING", 10, 90);
        }

        // Show tracking confidence and ball status
        if (kf.current.getConfidence() > 0) {
            ctx.fillText(`Tracking: ${(kf.current.getConfidence() * 100).toFixed(0)}%`, 10, 110);
            if (kf.current.isStationary()) {
                ctx.fillStyle = "orange";
                ctx.fillText("Ball Stationary", 10, 130);
            }
        }

        // Instructions for user
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.font = "14px Arial";
        ctx.fillText("Place ball at START marker on center line", 10, canvas.height - 20);

        ctx.shadowBlur = 0;

    }, [currentPath, completedPaths, puttCount, lastDetectionBox.current, isRecording, framesSinceDetection.current, canvasDimensions]);

    // Analysis logic - Updated for 3 putts
    useEffect(() => {
        if (puttCount >= MAX_PUTTS && completedPaths.length > 0) {
            const centerX = getCenterLineX();

            const puttAnalyses = completedPaths.map(path => {
                if (!path || path.length < 2) return null;

                const startPoint = path[0];
                const endPoint = path[path.length - 1];

                if (!startPoint || !endPoint || 
                    typeof startPoint.x !== 'number' || typeof startPoint.y !== 'number' ||
                    typeof endPoint.x !== 'number' || typeof endPoint.y !== 'number') {
                    return null;
                }

                const deltaX = endPoint.x - startPoint.x;
                const deltaY = endPoint.y - startPoint.y;
                const angleRadians = Math.atan2(deltaX, -deltaY);
                const angleDegrees = angleRadians * (180 / Math.PI);

                const dispersion = Math.abs(endPoint.x - centerX);

                return {
                    direction: angleDegrees,
                    dispersion: dispersion
                };
            }).filter(analysis => analysis !== null);

            if (puttAnalyses.length === 0) return;

            const avgDirection = puttAnalyses.reduce((sum, analysis) => sum + analysis.direction, 0) / puttAnalyses.length;
            const avgDispersion = puttAnalyses.reduce((sum, analysis) => sum + analysis.dispersion, 0) / puttAnalyses.length;

            let recommendation = "";
            if (avgDispersion > 30) {
                recommendation = "High dispersion detected. Focus on consistent stroke alignment and follow-through.";
            } else if (avgDispersion > 15) {
                recommendation = "Moderate dispersion. Work on maintaining steady hand position throughout the stroke.";
            } else {
                recommendation = "Excellent consistency! Your putting stroke is very stable.";
            }

            if (Math.abs(avgDirection) > 5) {
                const direction = avgDirection > 0 ? "right" : "left";
                recommendation += ` You tend to putt slightly to the ${direction}.`;
            }

            setAnalysisResult({
                averageDirection: avgDirection.toFixed(1),
                averageDispersion: avgDispersion.toFixed(1),
                recommendation
            });
        }
    }, [puttCount, completedPaths, canvasDimensions]);

    const handleCanvasClick = (e) => {
        if (!isRecording) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        // console.log(`Manual click: (${x}, ${y})`);
        setCurrentPath(prev => [...prev, { x, y, predicted: false }]);
    };

    const resetSession = () => {
        setPuttCount(0);
        setCompletedPaths([]);
        setCurrentPath([]);
        setAnalysisResult(null);
        setIsRecording(false);
        lastDetectionBox.current = null;
        framesSinceDetection.current = 0;
        processingRequest.current = false;
        detectionHistory.current = [];
        kf.current = new GolfBallKalmanFilter();
    };

    return (
        <div style={styles.container}>
            {isLoading && <div style={styles.overlay}>Loading Camera...</div>}
            <video ref={videoRef} style={styles.video} muted playsInline autoPlay />
            <canvas
                ref={canvasRef}
                style={styles.canvas}
                onClick={handleCanvasClick}
            />
            {analysisResult && <AnalysisModal data={analysisResult} onReset={resetSession} />}
            <div style={styles.controls}>
                <ControlButton onClick={handleToggleRecording} disabled={isLoading || puttCount >= MAX_PUTTS}>
                    {isRecording ? "Stop Recording" : `Record Putt ${puttCount + 1}`}
                </ControlButton>
                {videoDevices.length > 1 && (
                    <ControlButton onClick={switchCamera} disabled={isRecording || isLoading}>
                        Switch Camera
                    </ControlButton>
                )}
                <ControlButton onClick={resetSession} disabled={isRecording}>
                    Reset
                </ControlButton>
            </div>
            {cameraError && <div style={styles.overlay}>{cameraError}</div>}
        </div>
    );
}
const styles = {
    container: {
        position: "relative",
        width: "100vw",
        height: "100vh",
        backgroundColor: "#000000", // black background
        overflow: "hidden",
        fontFamily: "'Avenir', sans-serif", // body font
        color: "white"
    },
    video: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: 1
    },
    canvas: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 2,
        pointerEvents: "auto",
        cursor: "crosshair"
    },
    controls: {
        position: "absolute",
        bottom: 30,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        display: "flex",
        gap: 12
    },
    overlay: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.85)",
        color: "white",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 50,
        fontSize: 22,
        fontFamily: "'Avenir', sans-serif"
    },
    modal: {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        backgroundColor: "#000000",
        padding: 30,
        borderRadius: 15,
        border: `3px solid #CB0000`,
        zIndex: 50,
        color: "white",
        maxWidth: "90vw",
        textAlign: "center",
        fontFamily: "'Avenir', sans-serif",
        boxShadow: `0 0 15px #CB0000`
    },
    controlButton: {
        padding: "14px 24px",
        fontSize: 16,
        backgroundColor: "#CB0000",
        color: "white",
        border: "2px solid white",
        borderRadius: 12,
        cursor: "pointer",
        fontFamily: "'GoodTimes', serif",
        fontWeight: "600",
        transition: "background-color 0.3s ease",
        userSelect: "none",
        whiteSpace: "nowrap"
    }
};

export default App;