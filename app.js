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
  const trackingSourceOptions = [
    { key: "", label: "None", min: 0, max: 0 },
    { key: "yaw", label: "Head Yaw", min: -30, max: 30 },
    { key: "pitch", label: "Head Pitch", min: -30, max: 30 },
    { key: "roll", label: "Head Roll", min: -30, max: 30 },
    { key: "bodyYaw", label: "Body Yaw", min: -15, max: 15 },
    { key: "bodyPitch", label: "Body Pitch", min: -10, max: 10 },
    { key: "bodyRoll", label: "Body Roll", min: -15, max: 15 },
    { key: "eyeOpenLeft", label: "Eye Open Left", min: 0, max: 1 },
    { key: "eyeOpenRight", label: "Eye Open Right", min: 0, max: 1 },
    { key: "eyeSquintLeft", label: "Eye Squint Left", min: 0, max: 1 },
    { key: "eyeSquintRight", label: "Eye Squint Right", min: 0, max: 1 },
    { key: "eyeWideLeft", label: "Eye Wide Left", min: 0, max: 1 },
    { key: "eyeWideRight", label: "Eye Wide Right", min: 0, max: 1 },
    { key: "eyeBallX", label: "Eye Ball X", min: -1, max: 1 },
    { key: "eyeBallY", label: "Eye Ball Y", min: -1, max: 1 },
    { key: "mouthOpen", label: "Mouth Open", min: 0, max: 1.35 },
    { key: "mouthX", label: "Mouth X", min: -1.2, max: 1.2 },
    { key: "mouthSmile", label: "Mouth Smile", min: 0, max: 1 },
    { key: "mouthSmileLeft", label: "Mouth Smile Left", min: 0, max: 1 },
    { key: "mouthSmileRight", label: "Mouth Smile Right", min: 0, max: 1 },
    { key: "mouthFunnel", label: "Mouth Funnel", min: 0, max: 1 },
    { key: "mouthPucker", label: "Mouth Pucker", min: 0, max: 1 },
    { key: "mouthShrugUpper", label: "Mouth Shrug Upper", min: 0, max: 1 },
    { key: "mouthShrugLower", label: "Mouth Shrug Lower", min: 0, max: 1 },
    { key: "jawX", label: "Jaw X", min: -1.1, max: 1.1 },
    { key: "browLeft", label: "Brow Left", min: -1, max: 1 },
    { key: "browRight", label: "Brow Right", min: -1, max: 1 },
    { key: "browInnerUp", label: "Brow Inner Up", min: 0, max: 1 },
    { key: "cheek", label: "Cheek", min: 0, max: 1 }
  ];
  const trackingSourceMap = new Map(trackingSourceOptions.map((source) => [source.key, source]));
  const mappingStoragePrefix = "vt-mini-studio:mapping:";
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
  let currentTrackingSignals = {};
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
    eyeSquintLeft: 0,
    eyeSquintRight: 0,
    eyeWideLeft: 0,
    eyeWideRight: 0,
    mouthOpen: 0,
    mouthX: 0,
    mouthSmile: 0,
    mouthSmileLeft: 0,
    mouthSmileRight: 0,
    mouthFunnel: 0,
    mouthPucker: 0,
    mouthShrugUpper: 0,
    mouthShrugLower: 0,
    jawX: 0,
    browLeft: 0,
    browRight: 0,
    browInnerUp: 0,
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
    eyeSquintLeft: 0,
    eyeSquintRight: 0,
    eyeWideLeft: 0,
    eyeWideRight: 0,
    mouthOpen: 0,
    mouthX: 0,
    mouthSmile: 0,
    mouthSmileLeft: 0,
    mouthSmileRight: 0,
    mouthFunnel: 0,
    mouthPucker: 0,
    mouthShrugUpper: 0,
    mouthShrugLower: 0,
    jawX: 0,
    browLeft: 0,
    browRight: 0,
    browInnerUp: 0,
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

  function smoothTrackingValue(key, target, config) {
    const current = trackingSmoothedState[key] ?? target;
    const delta = Math.abs(target - current);
    const settings =
      typeof config === "number"
        ? {
            rise: config,
            fall: config,
            boost: config * 0.7,
            min: Math.min(config, 0.12),
            max: 0.82
          }
        : {
            rise: config.rise,
            fall: config.fall,
            boost: config.boost ?? 0.2,
            min: config.min ?? 0.08,
            max: config.max ?? 0.82
          };

    const baseAmount = target > current ? settings.rise : settings.fall;
    const amount = clamp(baseAmount + delta * settings.boost, settings.min, settings.max);
    trackingSmoothedState[key] = lerp(current, target, amount);
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

  function getCurrentMappingStorageKey() {
    return `${mappingStoragePrefix}${getCurrentModelPath() || "default"}`;
  }

  function loadStoredTrackingBindings() {
    try {
      const raw = window.localStorage.getItem(getCurrentMappingStorageKey());
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.warn("Could not load saved tracking mappings.", error);
      return {};
    }
  }

  function saveStoredTrackingBindings() {
    const payload = {};
    parameterDefinitions.forEach((parameter) => {
      if (!parameter.trackingBinding || !parameter.trackingBinding.source) {
        return;
      }

      payload[parameter.id] = {
        source: parameter.trackingBinding.source,
        strength: parameter.trackingBinding.strength,
        offset: parameter.trackingBinding.offset
      };
    });

    try {
      window.localStorage.setItem(getCurrentMappingStorageKey(), JSON.stringify(payload));
    } catch (error) {
      console.warn("Could not save tracking mappings.", error);
    }
  }

  function applyStoredTrackingBindings(parameters) {
    const storedBindings = loadStoredTrackingBindings();
    parameters.forEach((parameter) => {
      const saved = storedBindings[parameter.id];
      parameter.trackingBinding = {
        source: saved && trackingSourceMap.has(saved.source) ? saved.source : "",
        strength: saved && Number.isFinite(saved.strength) ? saved.strength : 1,
        offset: saved && Number.isFinite(saved.offset) ? saved.offset : 0
      };
    });
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

    const mapping = document.createElement("div");
    mapping.className = "param-mapping";

    const mappingTitle = document.createElement("p");
    mappingTitle.className = "param-mapping__title";
    mappingTitle.textContent = "Tracking map";

    const mappingGrid = document.createElement("div");
    mappingGrid.className = "param-mapping__grid";

    const sourceSelect = document.createElement("select");
    trackingSourceOptions.forEach((option) => {
      const selectOption = document.createElement("option");
      selectOption.value = option.key;
      selectOption.textContent = option.label;
      sourceSelect.append(selectOption);
    });
    sourceSelect.value = parameter.trackingBinding ? parameter.trackingBinding.source : "";

    const strengthInput = document.createElement("input");
    strengthInput.type = "number";
    strengthInput.step = "0.1";
    strengthInput.title = "Tracking strength";
    strengthInput.placeholder = "Gain";
    strengthInput.value = String(parameter.trackingBinding ? parameter.trackingBinding.strength : 1);

    const offsetInput = document.createElement("input");
    offsetInput.type = "number";
    offsetInput.step = "0.1";
    offsetInput.title = "Tracking offset";
    offsetInput.placeholder = "Offset";
    offsetInput.value = String(parameter.trackingBinding ? parameter.trackingBinding.offset : 0);

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

    function syncTrackingBinding() {
      parameter.trackingBinding = {
        source: sourceSelect.value,
        strength: Number.isFinite(Number(strengthInput.value)) ? Number(strengthInput.value) : 1,
        offset: Number.isFinite(Number(offsetInput.value)) ? Number(offsetInput.value) : 0
      };
      saveStoredTrackingBindings();
      if (trackingActive) {
        applyTrackingMappings(currentTrackingSignals);
      }
    }

    sourceSelect.addEventListener("change", syncTrackingBinding);
    strengthInput.addEventListener("input", syncTrackingBinding);
    offsetInput.addEventListener("input", syncTrackingBinding);

    controls.append(range, number);
    mappingGrid.append(sourceSelect, strengthInput, offsetInput);
    mapping.append(mappingTitle, mappingGrid);
    item.append(title, meta, live, controls, mapping);
    parameter.element = item;
    parameter.liveValueElement = live;
    parameter.rangeInput = range;
    parameter.numberInput = number;
    parameter.mappingSourceInput = sourceSelect;
    parameter.mappingStrengthInput = strengthInput;
    parameter.mappingOffsetInput = offsetInput;
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
      applyStoredTrackingBindings(parameterDefinitions);
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

  function mapTrackingValueToParameter(parameter, sourceKey, sourceValue, strength, offset) {
    const sourceMeta = trackingSourceMap.get(sourceKey);
    if (!sourceMeta) {
      return null;
    }

    const sourceRange = sourceMeta.max - sourceMeta.min;
    if (!sourceRange) {
      return clamp(parameter.defaultValue + offset, parameter.min, parameter.max);
    }

    const normalized = (sourceValue - sourceMeta.min) / sourceRange;
    const parameterRange = parameter.max - parameter.min;
    const mapped = parameter.min + normalized * parameterRange;
    const centered = parameter.defaultValue + (mapped - parameter.defaultValue) * strength + offset;
    return clamp(centered, parameter.min, parameter.max);
  }

  function applyTrackingMappings(signalValues) {
    if (!signalValues || typeof signalValues !== "object") {
      return;
    }

    parameterDefinitions.forEach((parameter) => {
      if (!parameter.trackingBinding || !parameter.trackingBinding.source) {
        return;
      }

      const sourceValue = signalValues[parameter.trackingBinding.source];
      if (!Number.isFinite(sourceValue)) {
        return;
      }

      const mappedValue = mapTrackingValueToParameter(
        parameter,
        parameter.trackingBinding.source,
        sourceValue,
        parameter.trackingBinding.strength,
        parameter.trackingBinding.offset
      );

      if (mappedValue === null) {
        return;
      }

      trackingOverrides.set(parameter.id, mappedValue);
    });
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

  function average(values) {
    if (!values.length) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    const mouthLeftCorner = landmarks[61];
    const mouthRightCorner = landmarks[291];
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];

    if (!nose || !leftCheek || !rightCheek || !forehead || !chin || !mouthLeftCorner || !mouthRightCorner || !upperLip || !lowerLip) {
      trackingOverrides.clear();
      return;
    }

    const faceWidth = Math.max(0.001, rightCheek.x - leftCheek.x);
    const faceHeight = Math.max(0.001, chin.y - forehead.y);
    const yaw = ((nose.x - (leftCheek.x + rightCheek.x) / 2) / faceWidth) * 120;
    const pitch = (((forehead.y + chin.y) / 2 - nose.y) / faceHeight) * 140;
    const roll = (leftCheek.y - rightCheek.y) * 220;
    const mouthCenterX = (mouthLeftCorner.x + mouthRightCorner.x) / 2;
    const mouthCenterY = (upperLip.y + lowerLip.y) / 2;
    const mouthHorizontalFromLandmarks = ((mouthCenterX - nose.x) / faceWidth) * 9;
    const mouthVerticalFromLandmarks = clamp(((lowerLip.y - upperLip.y) / faceHeight) * 11, 0, 1.4);

    const eyeOpenLeft = 1 - getBlendshapeScore(categories, "eyeBlinkLeft");
    const eyeOpenRight = 1 - getBlendshapeScore(categories, "eyeBlinkRight");
    const eyeSquintLeft = getBlendshapeScore(categories, "eyeSquintLeft");
    const eyeSquintRight = getBlendshapeScore(categories, "eyeSquintRight");
    const eyeWideLeft = getBlendshapeScore(categories, "eyeWideLeft");
    const eyeWideRight = getBlendshapeScore(categories, "eyeWideRight");
    const jawOpen = getBlendshapeScore(categories, "jawOpen");
    const mouthSmileLeft = getBlendshapeScore(categories, "mouthSmileLeft");
    const mouthSmileRight = getBlendshapeScore(categories, "mouthSmileRight");
    const mouthSmile = (mouthSmileLeft + mouthSmileRight) / 2;
    const mouthLeft = getBlendshapeScore(categories, "mouthLeft");
    const mouthRight = getBlendshapeScore(categories, "mouthRight");
    const mouthStretchLeft = getBlendshapeScore(categories, "mouthStretchLeft");
    const mouthStretchRight = getBlendshapeScore(categories, "mouthStretchRight");
    const mouthFunnel = getBlendshapeScore(categories, "mouthFunnel");
    const mouthPucker = getBlendshapeScore(categories, "mouthPucker");
    const mouthShrugUpper = getBlendshapeScore(categories, "mouthShrugUpper");
    const mouthShrugLower = getBlendshapeScore(categories, "mouthShrugLower");
    const jawLeft = getBlendshapeScore(categories, "jawLeft");
    const jawRight = getBlendshapeScore(categories, "jawRight");
    const browOuterUpLeft = getBlendshapeScore(categories, "browOuterUpLeft");
    const browOuterUpRight = getBlendshapeScore(categories, "browOuterUpRight");
    const browDownLeft = getBlendshapeScore(categories, "browDownLeft");
    const browDownRight = getBlendshapeScore(categories, "browDownRight");
    const browInnerUp = getBlendshapeScore(categories, "browInnerUp");
    const cheek = (
      getBlendshapeScore(categories, "cheekSquintLeft") +
      getBlendshapeScore(categories, "cheekSquintRight")
    ) / 2;
    const mouthOpen = clamp(Math.max(jawOpen, mouthVerticalFromLandmarks), 0, 1.35);
    const mouthX = clamp(
      ((mouthRight + mouthStretchRight) - (mouthLeft + mouthStretchLeft)) * 1.35 + mouthHorizontalFromLandmarks,
      -1.2,
      1.2
    );
    const jawX = clamp((jawRight - jawLeft) * 1.7 + mouthHorizontalFromLandmarks * 0.4, -1.1, 1.1);

    trackingRawState = {
      yaw,
      pitch,
      roll,
      eyeOpenLeft,
      eyeOpenRight,
      eyeSquintLeft,
      eyeSquintRight,
      eyeWideLeft,
      eyeWideRight,
      mouthOpen,
      mouthX,
      mouthSmile,
      mouthSmileLeft,
      mouthSmileRight,
      mouthFunnel,
      mouthPucker,
      mouthShrugUpper,
      mouthShrugLower,
      jawX,
      browLeft: browOuterUpLeft - browDownLeft,
      browRight: browOuterUpRight - browDownRight,
      browInnerUp,
      eyeBallX: clamp(yaw / 30, -1, 1),
      eyeBallY: clamp(pitch / 30, -1, 1),
      cheek
    };

    const correctedYaw = trackingRawState.yaw - trackingPoseNeutral.yaw;
    const correctedPitch = trackingRawState.pitch - trackingPoseNeutral.pitch;
    const correctedRoll = trackingRawState.roll - trackingPoseNeutral.roll;
    const smoothYaw = smoothTrackingValue("yaw", correctedYaw, { rise: 0.22, fall: 0.18, boost: 0.03, min: 0.12, max: 0.72 });
    const smoothPitch = smoothTrackingValue("pitch", correctedPitch, { rise: 0.2, fall: 0.16, boost: 0.03, min: 0.11, max: 0.68 });
    const smoothRoll = smoothTrackingValue("roll", correctedRoll, { rise: 0.24, fall: 0.18, boost: 0.04, min: 0.12, max: 0.74 });
    const smoothEyeLeft = smoothTrackingValue("eyeOpenLeft", trackingRawState.eyeOpenLeft, { rise: 0.42, fall: 0.62, boost: 0.16, min: 0.2, max: 0.9 });
    const smoothEyeRight = smoothTrackingValue("eyeOpenRight", trackingRawState.eyeOpenRight, { rise: 0.42, fall: 0.62, boost: 0.16, min: 0.2, max: 0.9 });
    const smoothEyeSquintLeft = smoothTrackingValue("eyeSquintLeft", trackingRawState.eyeSquintLeft, { rise: 0.34, fall: 0.24, boost: 0.14, min: 0.16, max: 0.8 });
    const smoothEyeSquintRight = smoothTrackingValue("eyeSquintRight", trackingRawState.eyeSquintRight, { rise: 0.34, fall: 0.24, boost: 0.14, min: 0.16, max: 0.8 });
    const smoothEyeWideLeft = smoothTrackingValue("eyeWideLeft", trackingRawState.eyeWideLeft, { rise: 0.3, fall: 0.22, boost: 0.12, min: 0.15, max: 0.76 });
    const smoothEyeWideRight = smoothTrackingValue("eyeWideRight", trackingRawState.eyeWideRight, { rise: 0.3, fall: 0.22, boost: 0.12, min: 0.15, max: 0.76 });
    const smoothMouthOpen = smoothTrackingValue("mouthOpen", trackingRawState.mouthOpen, { rise: 0.34, fall: 0.22, boost: 0.12, min: 0.14, max: 0.8 });
    const smoothMouthX = smoothTrackingValue("mouthX", trackingRawState.mouthX, { rise: 0.28, fall: 0.28, boost: 0.1, min: 0.12, max: 0.76 });
    const smoothMouthSmile = smoothTrackingValue("mouthSmile", trackingRawState.mouthSmile, { rise: 0.26, fall: 0.18, boost: 0.1, min: 0.12, max: 0.72 });
    const smoothMouthSmileLeft = smoothTrackingValue("mouthSmileLeft", trackingRawState.mouthSmileLeft, { rise: 0.28, fall: 0.2, boost: 0.1, min: 0.12, max: 0.72 });
    const smoothMouthSmileRight = smoothTrackingValue("mouthSmileRight", trackingRawState.mouthSmileRight, { rise: 0.28, fall: 0.2, boost: 0.1, min: 0.12, max: 0.72 });
    const smoothMouthFunnel = smoothTrackingValue("mouthFunnel", trackingRawState.mouthFunnel, { rise: 0.28, fall: 0.18, boost: 0.1, min: 0.1, max: 0.7 });
    const smoothMouthPucker = smoothTrackingValue("mouthPucker", trackingRawState.mouthPucker, { rise: 0.32, fall: 0.18, boost: 0.12, min: 0.12, max: 0.76 });
    const smoothMouthShrugUpper = smoothTrackingValue("mouthShrugUpper", trackingRawState.mouthShrugUpper, { rise: 0.26, fall: 0.18, boost: 0.1, min: 0.1, max: 0.68 });
    const smoothMouthShrugLower = smoothTrackingValue("mouthShrugLower", trackingRawState.mouthShrugLower, { rise: 0.26, fall: 0.18, boost: 0.1, min: 0.1, max: 0.68 });
    const smoothJawX = smoothTrackingValue("jawX", trackingRawState.jawX, { rise: 0.26, fall: 0.26, boost: 0.1, min: 0.12, max: 0.72 });
    const smoothBrowLeft = smoothTrackingValue("browLeft", trackingRawState.browLeft, { rise: 0.24, fall: 0.18, boost: 0.08, min: 0.1, max: 0.66 });
    const smoothBrowRight = smoothTrackingValue("browRight", trackingRawState.browRight, { rise: 0.24, fall: 0.18, boost: 0.08, min: 0.1, max: 0.66 });
    const smoothBrowInnerUp = smoothTrackingValue("browInnerUp", trackingRawState.browInnerUp, { rise: 0.24, fall: 0.16, boost: 0.08, min: 0.1, max: 0.66 });
    const smoothEyeBallX = smoothTrackingValue("eyeBallX", trackingRawState.eyeBallX, { rise: 0.3, fall: 0.3, boost: 0.1, min: 0.12, max: 0.76 });
    const smoothEyeBallY = smoothTrackingValue("eyeBallY", trackingRawState.eyeBallY, { rise: 0.3, fall: 0.3, boost: 0.1, min: 0.12, max: 0.76 });
    const smoothCheek = smoothTrackingValue("cheek", trackingRawState.cheek, { rise: 0.24, fall: 0.18, boost: 0.08, min: 0.1, max: 0.66 });
    const smoothSmileAverage = average([smoothMouthSmile, smoothMouthSmileLeft, smoothMouthSmileRight]);

    currentTrackingSignals = {
      yaw: smoothYaw,
      pitch: smoothPitch,
      roll: smoothRoll,
      bodyYaw: smoothYaw * 0.42,
      bodyPitch: smoothPitch * 0.28,
      bodyRoll: smoothRoll * 0.38,
      eyeOpenLeft: smoothEyeLeft,
      eyeOpenRight: smoothEyeRight,
      eyeSquintLeft: smoothEyeSquintLeft,
      eyeSquintRight: smoothEyeSquintRight,
      eyeWideLeft: smoothEyeWideLeft,
      eyeWideRight: smoothEyeWideRight,
      eyeBallX: smoothEyeBallX,
      eyeBallY: smoothEyeBallY,
      mouthOpen: smoothMouthOpen,
      mouthX: smoothMouthX,
      mouthSmile: smoothSmileAverage,
      mouthSmileLeft: smoothMouthSmileLeft,
      mouthSmileRight: smoothMouthSmileRight,
      mouthFunnel: smoothMouthFunnel,
      mouthPucker: smoothMouthPucker,
      mouthShrugUpper: smoothMouthShrugUpper,
      mouthShrugLower: smoothMouthShrugLower,
      jawX: smoothJawX,
      browLeft: smoothBrowLeft + smoothBrowInnerUp * 0.35,
      browRight: smoothBrowRight + smoothBrowInnerUp * 0.35,
      browInnerUp: smoothBrowInnerUp,
      cheek: smoothCheek
    };

    trackingOverrides.clear();
    setTrackingParameter(["ParamAngleX", "anglex", "x"], currentTrackingSignals.yaw, -30, 30);
    setTrackingParameter(["ParamAngleY", "angley", "y"], currentTrackingSignals.pitch, -30, 30);
    setTrackingParameter(["ParamAngleZ", "anglez", "z"], currentTrackingSignals.roll, -30, 30);
    setTrackingParameter(["ParamEyeBallX"], currentTrackingSignals.eyeBallX, -1, 1);
    setTrackingParameter(["ParamEyeBallY"], currentTrackingSignals.eyeBallY, -1, 1);
    setTrackingParameter(["ParamBodyAngleX"], currentTrackingSignals.bodyYaw, -15, 15);
    setTrackingParameter(["ParamBodyAngleY"], currentTrackingSignals.bodyPitch, -10, 10);
    setTrackingParameter(["ParamBodyAngleZ"], currentTrackingSignals.bodyRoll, -15, 15);
    setTrackingParameter(["ParamEyeLOpen"], currentTrackingSignals.eyeOpenLeft, 0, 1);
    setTrackingParameter(["ParamEyeROpen"], currentTrackingSignals.eyeOpenRight, 0, 1);
    setTrackingParameter(["ParamMouthOpenY"], currentTrackingSignals.mouthOpen, 0, 1);
    setTrackingParameter(["ParamMouthOpenX", "ParamMouthX"], currentTrackingSignals.mouthX, -1, 1);
    setTrackingParameter(["ParamMouthForm"], clamp((currentTrackingSignals.mouthSmile - currentTrackingSignals.mouthPucker) * 2 - 1, -1, 1), -1, 1);
    setTrackingParameter(["ParamMouthSmile", "ParamSmile"], currentTrackingSignals.mouthSmile, 0, 1);
    setTrackingParameter(["ParamMouthSmileLeft"], currentTrackingSignals.mouthSmileLeft, 0, 1);
    setTrackingParameter(["ParamMouthSmileRight"], currentTrackingSignals.mouthSmileRight, 0, 1);
    setTrackingParameter(["ParamMouthFunnel"], currentTrackingSignals.mouthFunnel, 0, 1);
    setTrackingParameter(["ParamMouthPucker"], currentTrackingSignals.mouthPucker, 0, 1);
    setTrackingParameter(["ParamMouthShrugUpper"], currentTrackingSignals.mouthShrugUpper, 0, 1);
    setTrackingParameter(["ParamMouthShrugLower"], currentTrackingSignals.mouthShrugLower, 0, 1);
    setTrackingParameter(["ParamJawX"], currentTrackingSignals.jawX, -1, 1);
    setTrackingParameter(["ParamJawOpen"], currentTrackingSignals.mouthOpen, 0, 1);
    setTrackingParameter(["ParamBrowLY"], currentTrackingSignals.browLeft, -1, 1);
    setTrackingParameter(["ParamBrowRY"], currentTrackingSignals.browRight, -1, 1);
    setTrackingParameter(["ParamBrowLX"], currentTrackingSignals.yaw / 20, -1, 1);
    setTrackingParameter(["ParamBrowRX"], currentTrackingSignals.yaw / 20, -1, 1);
    setTrackingParameter(["ParamBrowInnerUp"], currentTrackingSignals.browInnerUp, 0, 1);
    setTrackingParameter(["ParamCheek"], currentTrackingSignals.cheek, 0, 1);
    setTrackingParameter(["ParamEyeLSmile"], currentTrackingSignals.mouthSmileLeft, 0, 1);
    setTrackingParameter(["ParamEyeRSmile"], currentTrackingSignals.mouthSmileRight, 0, 1);
    setTrackingParameter(["ParamEyeLSquint"], currentTrackingSignals.eyeSquintLeft, 0, 1);
    setTrackingParameter(["ParamEyeRSquint"], currentTrackingSignals.eyeSquintRight, 0, 1);
    setTrackingParameter(["ParamEyeLSurprised", "ParamEyeLWide"], currentTrackingSignals.eyeWideLeft, 0, 1);
    setTrackingParameter(["ParamEyeRSurprised", "ParamEyeRWide"], currentTrackingSignals.eyeWideRight, 0, 1);
    applyTrackingMappings(currentTrackingSignals);
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
      minFaceDetectionConfidence: 0.45,
      minFacePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
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
