(function () {
  const viewerHost = document.getElementById("viewer-host");
  const prevModelButton = document.getElementById("prev-model");
  const nextModelButton = document.getElementById("next-model");
  const modelName = document.getElementById("model-name");
  const toggleTrackingButton = document.getElementById("toggle-tracking");
  const calibrateTrackingButton = document.getElementById("calibrate-tracking");
  const trackingStatus = document.getElementById("tracking-status");
  const trackingVideo = document.getElementById("tracking-video");
  const paramSearch = document.getElementById("param-search");
  const paramList = document.getElementById("param-list");
  const resetParamsButton = document.getElementById("reset-params");
  const appBaseUrl = new URL("./", window.location.href);
  const manifestUrl = new URL("models/models.json", appBaseUrl);
  let modelPaths = [
    "models/amongus/amongus.model3.json"
  ];
  const defaultState = {
    x: 0,
    y: 0,
    scale: 0.22,
    rotation: 0
  };

  let viewerInstance = null;
  let animationFrameId = 0;
  let dragState = null;
  let currentModelIndex = modelPaths.findIndex((path) => path === "models/amongus/amongus.model3.json");
  let parameterDefinitions = [];
  let parameterOverrides = new Map();
  let trackingOverrides = new Map();
  let parameterSyncTimer = 0;
  let trackingStream = null;
  let trackingLandmarker = null;
  let trackingActive = false;
  let trackingLoopId = 0;
  let lastTrackingVideoTime = -1;
  let visionModulePromise = null;
  let trackingPoseNeutral = {
    yaw: 0,
    pitch: 0,
    roll: 0
  };
  let trackingRawState = {
    yaw: 0,
    pitch: 0,
    roll: 0,
    eyeOpenLeft: 1,
    eyeOpenRight: 1,
    mouthOpen: 0,
    mouthSmile: 0,
    browLeft: 0,
    browRight: 0,
    eyeBallX: 0,
    eyeBallY: 0,
    cheek: 0
  };
  let trackingSmoothedState = {
    yaw: 0,
    pitch: 0,
    roll: 0,
    eyeOpenLeft: 1,
    eyeOpenRight: 1,
    mouthOpen: 0,
    mouthSmile: 0,
    browLeft: 0,
    browRight: 0,
    eyeBallX: 0,
    eyeBallY: 0,
    cheek: 0
  };

  if (currentModelIndex < 0) {
    currentModelIndex = 0;
  }

  function isModelReady() {
    return Boolean(viewerInstance && viewerInstance.models && viewerInstance.models.model);
  }

  function getLive2DModel() {
    return isModelReady() ? viewerInstance.models.model : null;
  }

  function disableMouseFollow() {
    const live2DModel = getLive2DModel();
    if (!live2DModel) {
      return;
    }

    try {
      if (typeof live2DModel.focus === "function") {
        live2DModel.focus(0, 0, true);
      }

      if (
        live2DModel.internalModel &&
        live2DModel.internalModel.focusController &&
        typeof live2DModel.internalModel.focusController.focus === "function"
      ) {
        live2DModel.internalModel.focusController.focus(0, 0, true);
      }
    } catch (error) {
      console.warn("Could not neutralize cursor follow.", error);
    }
  }

  function getCoreModel() {
    const live2DModel = getLive2DModel();
    return live2DModel && live2DModel.internalModel ? live2DModel.internalModel.coreModel : null;
  }

  function getRawParameterStore() {
    const coreModel = getCoreModel();
    if (!coreModel) {
      return null;
    }

    if (coreModel._model && coreModel._model.parameters) {
      return coreModel._model.parameters;
    }

    if (coreModel.parameters) {
      return coreModel.parameters;
    }

    return null;
  }

  function applyViewerState() {
    if (!isModelReady()) {
      return;
    }

    try {
      if (trackingActive) {
        disableMouseFollow();
      }

      viewerInstance.setModelPosition({
        x: defaultState.x,
        y: defaultState.y
      });
      viewerInstance.setModelScale(defaultState.scale);
      viewerInstance.setModelRotation(defaultState.rotation);
      applyParameterOverrides();
    } catch (error) {
      console.warn("Viewer state update skipped until model is ready.", error);
    }
  }

  function animationLoop() {
    applyViewerState();
    animationFrameId = window.requestAnimationFrame(animationLoop);
  }

  function ensureAnimationLoop() {
    if (!animationFrameId) {
      animationFrameId = window.requestAnimationFrame(animationLoop);
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(current, target, amount) {
    return current + (target - current) * amount;
  }

  function smoothTrackingValue(key, target, amount) {
    trackingSmoothedState[key] = lerp(trackingSmoothedState[key], target, amount);
    return trackingSmoothedState[key];
  }

  function getParameterSnapshot() {
    const coreModel = getCoreModel();
    const raw = getRawParameterStore();
    if (!coreModel || !raw) {
      return [];
    }

    const ids = Array.from(coreModel._parameterIds || raw.ids || []);
    const values = Array.from(coreModel._parameterValues || raw.values || []);
    const minimumValues = Array.from(coreModel._parameterMinimumValues || raw.minimumValues || []);
    const maximumValues = Array.from(coreModel._parameterMaximumValues || raw.maximumValues || []);
    const defaultValues = Array.from(raw.defaultValues || []);

    return ids.map((id, index) => ({
      id,
      index,
      value: values[index] ?? 0,
      actualValue:
        typeof coreModel.getParameterValueByIndex === "function"
          ? coreModel.getParameterValueByIndex(index)
          : raw.values && typeof raw.values.length === "number"
            ? raw.values[index] ?? values[index] ?? 0
            : values[index] ?? 0,
      min: minimumValues[index] ?? -1,
      max: maximumValues[index] ?? 1,
      defaultValue: defaultValues[index] ?? values[index] ?? 0
    }));
  }

  function getCurrentModelPath() {
    return modelPaths[currentModelIndex];
  }

  async function loadModelManifest() {
    try {
      const response = await fetch(manifestUrl.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Manifest request failed.");
      }

      const payload = await response.json();
      if (Array.isArray(payload.models) && payload.models.length) {
        modelPaths = payload.models;
      }
    } catch (error) {
      console.warn("Falling back to built-in model list.", error);
      modelPaths = ["models/amongus/amongus.model3.json"];
    }

    currentModelIndex = modelPaths.findIndex((path) => path === "models/amongus/amongus.model3.json");
    if (currentModelIndex < 0) {
      currentModelIndex = 0;
    }
  }

  function updateModelName() {
    const currentModelPath = getCurrentModelPath();
    if (!currentModelPath) {
      modelName.textContent = "";
      return;
    }

    modelName.textContent = decodeURIComponent(currentModelPath.replace(/^models\//, ""));
  }

  function setParameterValue(parameter, nextValue) {
    const coreModel = getCoreModel();
    const raw = getRawParameterStore();
    if (!coreModel || !raw) {
      return;
    }

    const clampedValue = clamp(nextValue, parameter.min, parameter.max);

    try {
      if (coreModel._parameterValues && typeof coreModel._parameterValues.length === "number") {
        coreModel._parameterValues[parameter.index] = clampedValue;
      }

      if (raw.values && typeof raw.values.length === "number") {
        raw.values[parameter.index] = clampedValue;
      }

      if (typeof coreModel.setParameterValueByIndex === "function") {
        coreModel.setParameterValueByIndex(parameter.index, clampedValue, 1);
      } else if (typeof coreModel.setParameterValueById === "function") {
        coreModel.setParameterValueById(parameter.id, clampedValue, 1);
      }

      parameterOverrides.set(parameter.id, clampedValue);
    } catch (error) {
      console.warn(`Could not set parameter ${parameter.id}.`, error);
    }
  }

  function applyParameterOverrides() {
    if (!parameterOverrides.size && !trackingOverrides.size) {
      return;
    }

    if (trackingActive) {
      disableMouseFollow();
    }

    parameterDefinitions.forEach((parameter) => {
      const hasManual = parameterOverrides.has(parameter.id);
      const hasTracking = trackingOverrides.has(parameter.id);
      if (!hasManual && !hasTracking) {
        return;
      }

      const value = hasTracking ? trackingOverrides.get(parameter.id) : parameterOverrides.get(parameter.id);
      const coreModel = getCoreModel();
      const raw = getRawParameterStore();
      if (!coreModel || !raw) {
        return;
      }

      if (coreModel._parameterValues && typeof coreModel._parameterValues.length === "number") {
        coreModel._parameterValues[parameter.index] = value;
      }

      if (raw.values && typeof raw.values.length === "number") {
        raw.values[parameter.index] = value;
      }

      if (typeof coreModel.setParameterValueByIndex === "function") {
        coreModel.setParameterValueByIndex(parameter.index, value, 1);
      } else if (typeof coreModel.setParameterValueById === "function") {
        coreModel.setParameterValueById(parameter.id, value, 1);
      }

      parameter.actualValue = value;
    });
  }

  function resetView() {
    defaultState.x = 0;
    defaultState.y = 0;
    defaultState.scale = 0.22;
    defaultState.rotation = 0;
    applyViewerState();
  }

  function createParamItem(parameter) {
    const item = document.createElement("div");
    item.className = "param-item";
    item.dataset.paramId = parameter.id.toLowerCase();

    const title = document.createElement("p");
    title.className = "param-id";
    title.textContent = parameter.id;

    const meta = document.createElement("p");
    meta.className = "param-meta";
    meta.textContent = `min ${parameter.min.toFixed(2)} | max ${parameter.max.toFixed(2)} | default ${parameter.defaultValue.toFixed(2)}`;

    const live = document.createElement("p");
    live.className = "param-live";
    live.textContent = `Target: ${Number(parameter.value).toFixed(3)} | Live: ${Number(parameter.actualValue).toFixed(3)}`;

    const controls = document.createElement("div");
    controls.className = "param-controls";

    const range = document.createElement("input");
    range.type = "range";
    range.min = String(parameter.min);
    range.max = String(parameter.max);
    range.step = "0.01";
    range.value = String(parameter.value);

    const number = document.createElement("input");
    number.type = "number";
    number.min = String(parameter.min);
    number.max = String(parameter.max);
    number.step = "0.01";
    number.value = parameter.value.toFixed(2);

    function syncInputs(nextValue) {
      const clampedValue = clamp(nextValue, parameter.min, parameter.max);
      range.value = String(clampedValue);
      number.value = clampedValue.toFixed(2);
      parameter.value = clampedValue;
      setParameterValue(parameter, clampedValue);
      if (parameter.liveValueElement) {
        parameter.liveValueElement.textContent = `Target: ${clampedValue.toFixed(3)} | Live: ${clampedValue.toFixed(3)}`;
      }
    }

    function markEditing(isEditing) {
      parameter.isEditing = isEditing;
    }

    range.addEventListener("input", () => {
      syncInputs(Number(range.value));
    });
    range.addEventListener("pointerdown", () => markEditing(true));
    range.addEventListener("pointerup", () => markEditing(false));
    range.addEventListener("blur", () => markEditing(false));

    number.addEventListener("input", () => {
      syncInputs(Number(number.value));
    });
    number.addEventListener("focus", () => markEditing(true));
    number.addEventListener("blur", () => markEditing(false));

    controls.append(range, number);
    item.append(title, meta, live, controls);
    parameter.element = item;
    parameter.liveValueElement = live;
    parameter.rangeInput = range;
    parameter.numberInput = number;
    return item;
  }

  function renderParameterPanel(parameters) {
    paramList.innerHTML = "";

    if (!parameters.length) {
      const empty = document.createElement("p");
      empty.className = "param-empty";
      empty.textContent = "Waiting for model parameters...";
      paramList.append(empty);
      return;
    }

    parameters.forEach((parameter) => {
      paramList.append(createParamItem(parameter));
    });
  }

  function refreshParameterValues() {
    const snapshot = getParameterSnapshot();
    if (!snapshot.length) {
      return;
    }

    if (!parameterDefinitions.length) {
      parameterDefinitions = snapshot;
      renderParameterPanel(parameterDefinitions);
      return;
    }

    snapshot.forEach((entry) => {
      const existing = parameterDefinitions.find((parameter) => parameter.id === entry.id);
      if (!existing) {
        return;
      }

      existing.value = parameterOverrides.has(existing.id) ? parameterOverrides.get(existing.id) : entry.value;
      existing.actualValue = entry.actualValue;
      if (existing.liveValueElement) {
        existing.liveValueElement.textContent = `Target: ${Number(existing.value).toFixed(3)} | Live: ${Number(existing.actualValue).toFixed(3)}`;
      }
      if (!existing.isEditing && existing.rangeInput) {
        existing.rangeInput.value = String(existing.value);
      }
      if (!existing.isEditing && existing.numberInput) {
        existing.numberInput.value = Number(existing.value).toFixed(2);
      }
    });
  }

  function filterParameterPanel() {
    const query = paramSearch.value.trim().toLowerCase();
    parameterDefinitions.forEach((parameter) => {
      if (!parameter.element) {
        return;
      }

      parameter.element.hidden = Boolean(query) && !parameter.id.toLowerCase().includes(query);
    });
  }

  function resetParameterOverrides() {
    const currentDefinitions = parameterDefinitions.slice();
    parameterOverrides.clear();
    currentDefinitions.forEach((parameter) => {
      parameter.value = parameter.defaultValue;
      if (parameter.rangeInput) {
        parameter.rangeInput.value = String(parameter.defaultValue);
      }
      if (parameter.numberInput) {
        parameter.numberInput.value = Number(parameter.defaultValue).toFixed(2);
      }
      setParameterValue(parameter, parameter.defaultValue);
    });
  }

  function startParameterSync() {
    window.clearInterval(parameterSyncTimer);
    parameterDefinitions = [];
    parameterOverrides.clear();
    trackingOverrides.clear();
    paramSearch.value = "";
    renderParameterPanel([]);

    parameterSyncTimer = window.setInterval(() => {
      if (!isModelReady()) {
        return;
      }

      refreshParameterValues();
    }, 250);
  }

  function switchModel(step) {
    if (!modelPaths.length) {
      return;
    }

    currentModelIndex = (currentModelIndex + step + modelPaths.length) % modelPaths.length;
    resetView();
    trackingOverrides.clear();
    mountViewer();
  }

  function findParameterByNames(names) {
    const normalized = names.map((name) => name.toLowerCase());
    return parameterDefinitions.find((parameter) => normalized.includes(parameter.id.toLowerCase()));
  }

  function setTrackingParameter(names, value, fallbackMin, fallbackMax) {
    const parameter = findParameterByNames(names);
    if (!parameter) {
      return;
    }

    const min = Number.isFinite(parameter.min) ? parameter.min : fallbackMin;
    const max = Number.isFinite(parameter.max) ? parameter.max : fallbackMax;
    trackingOverrides.set(parameter.id, clamp(value, min, max));
  }

  function calibrateTrackingNeutral() {
    trackingPoseNeutral = {
      yaw: trackingRawState.yaw,
      pitch: trackingRawState.pitch,
      roll: trackingRawState.roll
    };
    updateTrackingStatus("Calibrated");
    window.setTimeout(() => {
      if (trackingActive) {
        updateTrackingStatus("On");
      }
    }, 1200);
  }

  function getBlendshapeScore(categories, name) {
    const category = categories.find((item) => item.categoryName === name);
    return category ? category.score : 0;
  }

  function updateTrackingFromResult(result) {
    if (!result || !result.faceBlendshapes || !result.faceBlendshapes.length || !result.faceLandmarks || !result.faceLandmarks.length) {
      trackingOverrides.clear();
      return;
    }

    const categories = result.faceBlendshapes[0].categories || [];
    const landmarks = result.faceLandmarks[0];
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    if (!nose || !leftCheek || !rightCheek || !forehead || !chin) {
      trackingOverrides.clear();
      return;
    }

    const faceWidth = Math.max(0.001, rightCheek.x - leftCheek.x);
    const faceHeight = Math.max(0.001, chin.y - forehead.y);
    const yaw = ((nose.x - (leftCheek.x + rightCheek.x) / 2) / faceWidth) * 120;
    const pitch = (((forehead.y + chin.y) / 2 - nose.y) / faceHeight) * 140;
    const roll = (leftCheek.y - rightCheek.y) * 220;

    const eyeOpenLeft = 1 - getBlendshapeScore(categories, "eyeBlinkLeft");
    const eyeOpenRight = 1 - getBlendshapeScore(categories, "eyeBlinkRight");
    const mouthOpen = getBlendshapeScore(categories, "jawOpen");
    const mouthSmile = (
      getBlendshapeScore(categories, "mouthSmileLeft") +
      getBlendshapeScore(categories, "mouthSmileRight")
    ) / 2;
    const browOuterUpLeft = getBlendshapeScore(categories, "browOuterUpLeft");
    const browOuterUpRight = getBlendshapeScore(categories, "browOuterUpRight");
    const browDownLeft = getBlendshapeScore(categories, "browDownLeft");
    const browDownRight = getBlendshapeScore(categories, "browDownRight");
    const cheek = (
      getBlendshapeScore(categories, "cheekSquintLeft") +
      getBlendshapeScore(categories, "cheekSquintRight")
    ) / 2;

    trackingRawState = {
      yaw,
      pitch,
      roll,
      eyeOpenLeft,
      eyeOpenRight,
      mouthOpen,
      mouthSmile,
      browLeft: browOuterUpLeft - browDownLeft,
      browRight: browOuterUpRight - browDownRight,
      eyeBallX: clamp(yaw / 30, -1, 1),
      eyeBallY: clamp(pitch / 30, -1, 1),
      cheek
    };

    const correctedYaw = trackingRawState.yaw - trackingPoseNeutral.yaw;
    const correctedPitch = trackingRawState.pitch - trackingPoseNeutral.pitch;
    const correctedRoll = trackingRawState.roll - trackingPoseNeutral.roll;
    const smoothYaw = smoothTrackingValue("yaw", correctedYaw, 0.18);
    const smoothPitch = smoothTrackingValue("pitch", correctedPitch, 0.16);
    const smoothRoll = smoothTrackingValue("roll", correctedRoll, 0.2);
    const smoothEyeLeft = smoothTrackingValue("eyeOpenLeft", trackingRawState.eyeOpenLeft, 0.4);
    const smoothEyeRight = smoothTrackingValue("eyeOpenRight", trackingRawState.eyeOpenRight, 0.4);
    const smoothMouthOpen = smoothTrackingValue("mouthOpen", trackingRawState.mouthOpen, 0.3);
    const smoothMouthSmile = smoothTrackingValue("mouthSmile", trackingRawState.mouthSmile, 0.2);
    const smoothBrowLeft = smoothTrackingValue("browLeft", trackingRawState.browLeft, 0.2);
    const smoothBrowRight = smoothTrackingValue("browRight", trackingRawState.browRight, 0.2);
    const smoothEyeBallX = smoothTrackingValue("eyeBallX", trackingRawState.eyeBallX, 0.22);
    const smoothEyeBallY = smoothTrackingValue("eyeBallY", trackingRawState.eyeBallY, 0.22);
    const smoothCheek = smoothTrackingValue("cheek", trackingRawState.cheek, 0.2);

    trackingOverrides.clear();
    setTrackingParameter(["ParamAngleX", "anglex", "x"], smoothYaw, -30, 30);
    setTrackingParameter(["ParamAngleY", "angley", "y"], smoothPitch, -30, 30);
    setTrackingParameter(["ParamAngleZ", "anglez", "z"], smoothRoll, -30, 30);
    setTrackingParameter(["ParamEyeBallX"], smoothEyeBallX, -1, 1);
    setTrackingParameter(["ParamEyeBallY"], smoothEyeBallY, -1, 1);
    setTrackingParameter(["ParamBodyAngleX"], smoothYaw * 0.42, -15, 15);
    setTrackingParameter(["ParamBodyAngleY"], smoothPitch * 0.28, -10, 10);
    setTrackingParameter(["ParamBodyAngleZ"], smoothRoll * 0.38, -15, 15);
    setTrackingParameter(["ParamEyeLOpen"], smoothEyeLeft, 0, 1);
    setTrackingParameter(["ParamEyeROpen"], smoothEyeRight, 0, 1);
    setTrackingParameter(["ParamMouthOpenY"], smoothMouthOpen, 0, 1);
    setTrackingParameter(["ParamMouthForm"], smoothMouthSmile * 2 - 1, -1, 1);
    setTrackingParameter(["ParamBrowLY"], smoothBrowLeft, -1, 1);
    setTrackingParameter(["ParamBrowRY"], smoothBrowRight, -1, 1);
    setTrackingParameter(["ParamBrowLX"], smoothYaw / 20, -1, 1);
    setTrackingParameter(["ParamBrowRX"], smoothYaw / 20, -1, 1);
    setTrackingParameter(["ParamCheek"], smoothCheek, 0, 1);
    setTrackingParameter(["ParamEyeLSmile"], smoothMouthSmile, 0, 1);
    setTrackingParameter(["ParamEyeRSmile"], smoothMouthSmile, 0, 1);
  }

  async function createTrackingLandmarker() {
    if (trackingLandmarker) {
      return trackingLandmarker;
    }

    if (!visionModulePromise) {
      visionModulePromise = import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm");
    }

    const visionModule = await visionModulePromise;
    const vision = await visionModule.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    trackingLandmarker = await visionModule.FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true
    });

    return trackingLandmarker;
  }

  function stopTrackingLoop() {
    if (trackingLoopId) {
      window.cancelAnimationFrame(trackingLoopId);
      trackingLoopId = 0;
    }
  }

  function updateTrackingStatus(text) {
    trackingStatus.textContent = text;
  }

  function trackingLoop() {
    if (!trackingActive || !trackingLandmarker || !trackingVideo.srcObject) {
      stopTrackingLoop();
      return;
    }

    if (trackingVideo.readyState >= 2 && trackingVideo.currentTime !== lastTrackingVideoTime) {
      const result = trackingLandmarker.detectForVideo(trackingVideo, performance.now());
      updateTrackingFromResult(result);
      lastTrackingVideoTime = trackingVideo.currentTime;
    }

    trackingLoopId = window.requestAnimationFrame(trackingLoop);
  }

  async function startFaceTracking() {
    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        updateTrackingStatus("Use localhost or HTTPS");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          facingMode: "user"
        },
        audio: false
      });

      trackingStream = stream;
      trackingVideo.srcObject = stream;
      trackingVideo.hidden = false;
      await trackingVideo.play();
      await createTrackingLandmarker();
      trackingActive = true;
      lastTrackingVideoTime = -1;
      trackingPoseNeutral = {
        yaw: trackingRawState.yaw,
        pitch: trackingRawState.pitch,
        roll: trackingRawState.roll
      };
      disableMouseFollow();
      toggleTrackingButton.textContent = "Stop Face Tracking";
      calibrateTrackingButton.disabled = false;
      updateTrackingStatus("On");
      trackingLoop();
    } catch (error) {
      console.error(error);
      updateTrackingStatus("Tracking failed");
    }
  }

  function stopFaceTracking() {
    trackingActive = false;
    trackingOverrides.clear();
    stopTrackingLoop();
    if (trackingStream) {
      trackingStream.getTracks().forEach((track) => track.stop());
      trackingStream = null;
    }
    trackingVideo.pause();
    trackingVideo.srcObject = null;
    trackingVideo.hidden = true;
    toggleTrackingButton.textContent = "Start Face Tracking";
    calibrateTrackingButton.disabled = true;
    updateTrackingStatus("Off");
  }

  async function toggleFaceTracking() {
    if (trackingActive) {
      stopFaceTracking();
      return;
    }

    updateTrackingStatus("Starting...");
    await startFaceTracking();
  }

  function beginDrag(event) {
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: defaultState.x,
      originY: defaultState.y
    };

    viewerHost.classList.add("is-dragging");
    if (typeof viewerHost.setPointerCapture === "function") {
      viewerHost.setPointerCapture(event.pointerId);
    }
  }

  function updateDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    defaultState.x = dragState.originX + (event.clientX - dragState.startX);
    defaultState.y = dragState.originY + (event.clientY - dragState.startY);
    applyViewerState();
  }

  function endDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragState = null;
    viewerHost.classList.remove("is-dragging");
    if (typeof viewerHost.releasePointerCapture === "function") {
      try {
        viewerHost.releasePointerCapture(event.pointerId);
      } catch (error) {
        console.warn("Pointer release skipped.", error);
      }
    }
  }

  function handleWheel(event) {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.025 : 0.025;
    defaultState.scale = clamp(defaultState.scale + direction, 0.08, 0.8);
    applyViewerState();
  }

  function bindStageInteractions() {
    viewerHost.addEventListener("pointerdown", beginDrag);
    viewerHost.addEventListener("pointermove", updateDrag);
    viewerHost.addEventListener("pointerup", endDrag);
    viewerHost.addEventListener("pointercancel", endDrag);
    viewerHost.addEventListener("pointerleave", endDrag);
    viewerHost.addEventListener("wheel", handleWheel, { passive: false });
    viewerHost.addEventListener("dblclick", resetView);
  }

  function mountViewer() {
    if (!window.OML2D || typeof window.OML2D.loadOml2d !== "function") {
      return;
    }

    viewerHost.innerHTML = "";
    updateModelName();

    try {
      viewerInstance = window.OML2D.loadOml2d({
        mobileDisplay: true,
        sayHello: false,
        parentElement: viewerHost,
        stageStyle: {
          width: "100%",
          height: "100%",
          position: "absolute",
          top: "0",
          left: "0",
          bottom: "0",
          right: "0",
          zIndex: "1",
          transform: "none"
        },
        statusBar: {
          disable: true
        },
        menus: {
          disable: true
        },
        tips: {
          idleTips: {
            message: []
          },
          welcomeTips: {
            message: {
              daybreak: "",
              morning: "",
              noon: "",
              afternoon: "",
              dusk: "",
              night: "",
              lateNight: "",
              weeHours: ""
            }
          },
          copyTips: {
            message: []
          }
        },
        models: [
          {
            path: new URL(getCurrentModelPath(), appBaseUrl).toString(),
            position: [0, 0],
            scale: defaultState.scale,
            stageStyle: {
              width: "100%",
              height: "100%"
            }
          }
        ]
      });

      window.setTimeout(applyViewerState, 250);
      window.setTimeout(applyViewerState, 800);
      startParameterSync();
    } catch (error) {
      console.error(error);
    }
  }

  function init() {
    loadModelManifest().then(() => {
      updateModelName();
      mountViewer();
    });
    bindStageInteractions();
    prevModelButton.addEventListener("click", () => switchModel(-1));
    nextModelButton.addEventListener("click", () => switchModel(1));
    toggleTrackingButton.addEventListener("click", () => {
      toggleFaceTracking();
    });
    calibrateTrackingButton.addEventListener("click", () => {
      calibrateTrackingNeutral();
    });
    calibrateTrackingButton.disabled = true;
    paramSearch.addEventListener("input", filterParameterPanel);
    resetParamsButton.addEventListener("click", resetParameterOverrides);
    ensureAnimationLoop();
  }

  init();
})();
