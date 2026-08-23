import { bufferToCanvas, canvasToBuffer, loadProject, saveProject, saveExport, updateProjectMeta } from "../projects.js";

const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

//basic project settings
let FPS = 12;
let DEFAULT_LAYERS = 4;
const ROW_HEIGHT = 36;
const MIN_VISIBLE_FRAMES = 100;
const MIN_PX_PER_FRAME = 18;
const MAX_PX_PER_FRAME = 40;
const MIN_CANVAS_SCALE = 0.5;
const MAX_CANVAS_SCALE = 3;
const MAX_UNDO = 25;
let CANVAS_WIDTH = 800;
let CANVAS_HEIGHT = 600;


//getting elements from html and setting up some variables
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const container = document.querySelector(".containerview");
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

const pencilBtn = document.getElementById("pencil_tool");
const eraserBtn = document.getElementById("eraser_tool");
const colorPicker = document.getElementById("colorPicker");
const onionBtn = document.querySelector('button[title="Onion"]');

const rewindBtn = document.querySelector('button[title="Rewind"]');
const playBtn = document.querySelector('button[title="Play / Pause"]');
const forwardBtn = document.querySelector('button[title="Forward"]');
const timeLabel = document.querySelector('label[for="currentTime"]');

const cutBtn = document.querySelector('button[title="Cut"]');
const copyBtn = document.querySelector('button[title="Copy"]');
const pasteBtn = document.querySelector('button[title="Paste"]');
const deleteBtn = document.querySelector('button[title="Delete"]');
const undoBtn = document.querySelector('button[title="Undo"]');
const redoBtn = document.querySelector('button[title="Redo"]');
const editingButtons = Array.from(document.querySelectorAll(".editingPanel button"));
const addLayerBtn = document.querySelector('button[title="Add Layers"]');
const splitBtn = document.querySelector('button[title="Split clip"]');
const addFramesBtn = document.querySelector('button[title="Add Frames"]');
const copyClipBtn = document.querySelector('button[title="copy clip"]');
const pasteClipBtn = document.querySelector('button[title="paste clip"]');
const deleteClipBtn = document.querySelector('button[title="delete clip"]');

const animationContainer = document.querySelector(".animationContainer");
const fpsScale = document.querySelector(".fpsScale");
const fpsGridContainer = document.querySelector(".fpsGridContainer");
const playhead = document.querySelector(".currentfpsIndicator");
const editorContainer = document.querySelector(".editorContainer");
const editingPanel = document.querySelector(".editingPanel");
const panelResizeHandle = document.querySelector(".panel-resize-handle");
const projectSettingsBtn = document.getElementById("project-settings-btn");
const exportVideoBtn = document.getElementById("export-video-btn");
const mediaImport = document.getElementById("media-import");
const transformTool = document.getElementById("transform-tool");

// styling here in case i need to add js within style if it makes sense. these aren't in editor.html, only here in js
const injectedStyle = document.createElement("style");
injectedStyle.textContent = `
  .frame-cell { position: relative; height: 100%; display: inline-flex; flex-direction: column; justify-content: center; align-items: center; border-right: 1px solid #333; }
  .frame-cell.ghost { opacity: 0.45; }
  .frame-preview { width: 20px; height: 20px; background: #111; margin: 2px 0; }
  .time-label { font-size: 9px; text-align: center; color: #aaa; height: 12px; line-height: 12px; }
  .frame-label { font-size: 8px; text-align: center; color: #666; height: 10px; line-height: 10px; }
  .grid { display: flex; flex-direction: column; }
  .row { position: relative; height: ${ROW_HEIGHT}px; border-bottom: 1px solid #555; background: #444; }
  .ghost-cell { position: absolute; top: 0; bottom: 0; background: rgba(255,255,255,0.08); pointer-events: none; }
  .clip { position: absolute; top: 0; bottom: 0; background: #bbb; }
  .clip.active-frame { outline: 2px solid #2b86ff; }
  .clip.selected { outline: 2px solid #ffd400; }
  .handle { position: absolute; width: 6px; top: 0; bottom: 0; background: #666; cursor: ew-resize; }
  .handle.left { left: 0; }
  .handle.right { right: 0; }
  .tool-panel { position: absolute; left: 100%; top: 50%; transform: translateY(-50%); width:fit-content; height:fit-content; background: #efefef; padding: 10px; gap:5px; border-radius: 6px; color: #fff; font-size: 10px; display: none; flex-direction: row; align-items: center; z-index: 20;}
  .tool-panel .slider-col { display: flex; flex-direction:column; align-items: center; gap: 4px; }
  .tool-panel .slider-col label { font-size: 10px; color: #000; }
  .tool-panel input[type="range"] { width: 16px; height: 100px; writing-mode: bt-lr; -webkit-appearance: slider-vertical; }
`;
document.head.appendChild(injectedStyle);

let tool = "pencil";
let brushColor = "#000000";
let drawing = false;
let onion = true;
let onionNext = false;
let pxPerFrame = MAX_PX_PER_FRAME;
let canvasScale = 1;
let defaultCanvasScale = 1;
let panX = 0;
let panY = 0;
let handMode = false;
let panning = false;
let panStartX = 0;
let panStartY = 0;
let panOriginX = 0;
let panOriginY = 0;

canvas.style.transformOrigin = "center center";

const toolSettings = {
    pencil: { size: 2, opacity: 1 },
    eraser: { size: 12, opacity: 1 }
};

//Clip class to represent each clip in the timeline
class Clip {
    constructor(start, duration = 1, layerIndex = 0, media = null) {
        this.start = start;
        this.duration = duration;
        this.layerIndex = layerIndex;
        this.media = media;
        this.canvas = document.createElement("canvas");
        this.canvas.width = canvas.width;
        this.canvas.height = canvas.height;
        this.ctx = this.canvas.getContext("2d");
        this.dom = null;
        this.undoStack = [];
        this.redoStack = [];
    }
    end() {
        return this.start + this.duration;
    }
    contains(frame) {
        return frame >= this.start && frame < this.end();
    }
}

let layers = Array.from({ length: DEFAULT_LAYERS }, () => []);
let activeClip = null;
let currentFrame = 0;
let playing = false;
let timer = null;
let onionBeforePlay = false;
let onionNextBeforePlay = false;
let minVisibleFrames = MIN_VISIBLE_FRAMES;
let timelineFrames = MIN_VISIBLE_FRAMES;
let previewCanvases = [];
let clipboardImage = null;
let clipboardClip = null;
let drawSnapshot = null;
let activeToolPanel = null;
const toolPanels = {};
const activePointers = new Map();
let pinchStartDist = 0;
let pinchStartScale = 1;
let pinchStartPanX = 0;
let pinchStartPanY = 0;
let pinchStartCenterX = 0;
let pinchStartCenterY = 0;
let project = null;
let saveTimer = null;
let saveInProgress = false;
let saveRequested = false;
let transformMode = false;
let transformState = null;
let panelResizeState = null;
const clipUndoStack = [];
const clipRedoStack = [];

function captureClipState() {
    return layers.map(layer => layer.map(clip => ({
        start: clip.start,
        duration: clip.duration,
        layerIndex: clip.layerIndex,
        media: clip.media,
        image: clip.ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    })));
}

function restoreClipState(state) {
    layers = state.map(layer => layer.map(savedClip => {
        const clip = new Clip(savedClip.start, savedClip.duration, savedClip.layerIndex, savedClip.media);
        clip.ctx.putImageData(savedClip.image, 0, 0);
        return clip;
    }));
    activeClip = null;
    buildTimeline(true);
    render();
    refreshAllPreviews();
    updateDurationLabel();
}

function pushClipHistory() {
    clipUndoStack.push(captureClipState());
    if (clipUndoStack.length > MAX_UNDO) clipUndoStack.shift();
    clipRedoStack.length = 0;
}

async function serializeProject() {
    const serializedLayers = [];
    let firstClipImage = null;
    let durationFrames = 1;

    for (const layer of layers) {
        const serializedLayer = [];
        for (const clip of layer) {
            const image = await canvasToBuffer(clip.canvas);
            if (!firstClipImage) firstClipImage = image;
            serializedLayer.push({
                start: clip.start,
                duration: clip.duration,
                layerIndex: clip.layerIndex,
                image,
                media: clip.media
            });
            durationFrames = Math.max(durationFrames, clip.end());
        }
        serializedLayers.push(serializedLayer);
    }

    const thumbnailCanvas = document.createElement("canvas");
    thumbnailCanvas.width = CANVAS_WIDTH;
    thumbnailCanvas.height = CANVAS_HEIGHT;
    const thumbnailCtx = thumbnailCanvas.getContext("2d");
    for (let i = layers.length - 1; i >= 0; i--) {
        for (const clip of layers[i]) {
            if (clip.contains(0)) thumbnailCtx.drawImage(clip.canvas, 0, 0);
        }
    }
    const thumbnail = await canvasToBuffer(thumbnailCanvas) || firstClipImage;

    return {
        ...project,
        updatedAt: Date.now(),
        settings: {
            ...project.settings,
            FPS,
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
            DEFAULT_LAYERS
        },
        layers: serializedLayers,
        currentFrame,
        onion,
        onionNext,
        minVisibleFrames,
        pxPerFrame,
        durationFrames,
        thumbnail
    };
}

async function saveCurrentProject() {
    if (!project) return;
    if (saveInProgress) {
        saveRequested = true;
        return;
    }
    saveInProgress = true;
    try {
        project = await serializeProject();
        await saveProject(project);
    } catch (error) {
        console.error("Could not save project", error);
    } finally {
        saveInProgress = false;
        if (saveRequested) {
            saveRequested = false;
            scheduleSave();
        }
    }
}

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCurrentProject, 500);
}

async function restoreProject() {
    project = await loadProject(projectId);
    if (!project) throw new Error("Project not found");

    const settings = project.settings || {};
    FPS = Number(settings.FPS) || FPS;
    DEFAULT_LAYERS = Number(settings.DEFAULT_LAYERS) || DEFAULT_LAYERS;
    CANVAS_WIDTH = Number(settings.CANVAS_WIDTH) || CANVAS_WIDTH;
    CANVAS_HEIGHT = Number(settings.CANVAS_HEIGHT) || CANVAS_HEIGHT;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    document.title = project.name;

    layers = [];
    for (const storedLayer of project.layers || []) {
        const layer = [];
        for (const storedClip of storedLayer) {
            const clip = new Clip(storedClip.start, storedClip.duration, storedClip.layerIndex, storedClip.media || null);
            if (storedClip.image) {
                await bufferToCanvas(storedClip.image, clip.ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
            }
            layer.push(clip);
        }
        layers.push(layer);
    }
    while (layers.length < 1) layers.push([]);
    currentFrame = Number(project.currentFrame) || 0;
    onion = project.onion !== false;
    onionNext = project.onionNext === true;
    minVisibleFrames = Number(project.minVisibleFrames) || MIN_VISIBLE_FRAMES;
    pxPerFrame = Number(project.pxPerFrame) || MAX_PX_PER_FRAME;
}

function updateAnimationMinWidth() {
    if (!editorContainer || !animationContainer) return;
    const panelWidth = editingPanel ? editingPanel.offsetWidth : 0;
    const available = Math.max(0, editorContainer.clientWidth - panelWidth);
    animationContainer.style.minWidth = `${available}px`;
}

function resizeEditingPanel(event) {
    if (!panelResizeState || !editingPanel) return;
    const maxWidth = Math.min(window.innerWidth * 0.45, 360);
    const width = Math.max(90, Math.min(maxWidth, panelResizeState.width - (event.clientX - panelResizeState.startX)));
    editingPanel.style.width = `${width}px`;
    editingPanel.style.minWidth = `${width}px`;
    editingPanel.style.maxWidth = `${width}px`;
    editingPanel.style.flexBasis = `${width}px`;
    updateAnimationMinWidth();
}

function stopResizeEditingPanel() {
    panelResizeState = null;
    window.removeEventListener('pointermove', resizeEditingPanel);
    window.removeEventListener('pointerup', stopResizeEditingPanel);
}

function updateLayerCountLabel() {
    const el = document.querySelector('.editingPanel [title="Total Layers"]');
    if (el) el.textContent = `${layers.length} Layer`;
}

function updateFrameCountLabel() {
    const el = document.querySelector('.editingPanel [title="Total frames"]');
    if (el) el.textContent = `${timelineFrames} frames`;
}

function getDefaultCanvasScale() {
    if (!container) return 1;
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    const scaleX = width / canvas.width;
    const scaleY = height / canvas.height;
    return Math.min(scaleX, scaleY) * 0.8;
}

function applyCanvasTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${canvasScale})`;
}

function centerCanvasInContainer() {
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const deltaX = (containerRect.left + containerRect.width / 2) - (canvasRect.left + canvasRect.width / 2);
    const deltaY = (containerRect.top + containerRect.height / 2) - (canvasRect.top + canvasRect.height / 2);
    panX += deltaX;
    panY += deltaY;
    applyCanvasTransform();
}

function updateZoomLabel() {
    const zoomBtn = document.getElementById("zoomReset");
    if (!zoomBtn) return;
    const percent = Math.round((canvasScale / defaultCanvasScale) * 100);
    zoomBtn.textContent = `${percent}%`;
}

const grid = document.createElement("div");
grid.className = "grid";
fpsGridContainer.innerHTML = "";
fpsGridContainer.appendChild(grid);

function overlaps(layer, clip) {
    return layer.some(c => !(clip.end() <= c.start || clip.start >= c.end()));
}

function getMaxEndFrame() {
    let maxEnd = 1;
    layers.forEach(layer => {
        layer.forEach(c => {
            if (c.end() > maxEnd) maxEnd = c.end();
        });
    });
    return maxEnd;
}

function getTimelineFrames() {
    const maxEnd = getMaxEndFrame();
    return Math.max(minVisibleFrames, maxEnd + 1);
}

function updateDurationLabel() {
    if (!timeLabel) return;
    const format = frame => {
        const seconds = frame / FPS;
        return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
    };
    timeLabel.textContent = `${format(currentFrame)}/${format(getMaxEndFrame())}`;
}

function updateRowWidths() {
    const width = timelineFrames * pxPerFrame;
    fpsScale.style.width = `${width}px`;
    fpsGridContainer.style.width = `${width}px`;
    grid.style.width = `${width}px`;
    grid.querySelectorAll(".row").forEach(row => {
        row.style.width = `${width}px`;
        row.style.backgroundImage = `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)`;
        row.style.backgroundSize = `${pxPerFrame}px 100%`;
    });
    updateGhostCells();
}

function updateGhostCells() {
    const ghostFrame = getMaxEndFrame();
    grid.querySelectorAll(".row").forEach(row => {
        let ghost = row.querySelector(".ghost-cell");
        if (!ghost) {
            ghost = document.createElement("div");
            ghost.className = "ghost-cell";
            row.appendChild(ghost);
        }
        ghost.style.left = `${ghostFrame * pxPerFrame}px`;
        ghost.style.width = `${pxPerFrame}px`;
    });
}

function buildTimeline(force = false) {
    if (!force) return;
    timelineFrames = getTimelineFrames();
    previewCanvases = [];
    fpsScale.innerHTML = "";
    const width = timelineFrames * pxPerFrame;
    fpsScale.style.width = `${width}px`;
    fpsGridContainer.style.width = `${width}px`;

    const ghostFrame = getMaxEndFrame();

    for (let f = 0; f < timelineFrames; f++) {
        const cell = document.createElement("div");
        cell.className = "frame-cell";
        if (f === ghostFrame) cell.classList.add("ghost");
        cell.style.width = `${pxPerFrame}px`;

        const timeLabel = document.createElement("div");
        timeLabel.className = "time-label";
        if (f % FPS === 0) timeLabel.textContent = `${(f / FPS).toFixed(1)}s`;

        const preview = document.createElement("canvas");
        preview.width = 20;
        preview.height = 20;
        preview.className = "frame-preview";

        const frameLabel = document.createElement("div");
        frameLabel.className = "frame-label";
        frameLabel.textContent = f + 1;

        cell.append(timeLabel, preview, frameLabel);
        fpsScale.appendChild(cell);
        previewCanvases.push(preview);
    }

    grid.innerHTML = "";
    layers.forEach((layer, index) => {
        const row = document.createElement("div");
        row.className = "row";
        row.style.width = `${width}px`;
        row.style.backgroundImage = `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)`;
        row.style.backgroundSize = `${pxPerFrame}px 100%`;

        row.addEventListener("mousedown", e => {
            if (e.target !== row) return;
            const rect = fpsGridContainer.getBoundingClientRect();
            const x = e.clientX - rect.left + animationContainer.scrollLeft;
            const frame = Math.floor(x / pxPerFrame);
            const clip = new Clip(frame, 1, index);
            if (overlaps(layer, clip)) return;
            pushClipHistory();
            layer.push(clip);
            createClipDOM(clip, row);
            setSelectedClip(clip);
            render();
            buildTimeline(true);
            scheduleSave();
        });

        grid.appendChild(row);
        layer.forEach(clip => createClipDOM(clip, row));
    });

    updatePlayhead();
    refreshAllPreviews();
    updateFrameCountLabel();
    updateLayerCountLabel();
}

function updateClipStyle(clip) {
    if (!clip.dom) return;
    clip.dom.style.left = `${clip.start * pxPerFrame}px`;
    clip.dom.style.width = `${clip.duration * pxPerFrame}px`;
}

function setSelectedClip(clip, jumpToStart = true) {
    document.querySelectorAll(".clip").forEach(el => el.classList.remove("selected"));
    activeClip = clip;
    if (clip && clip.dom) {
        clip.dom.classList.add("selected");
        if (jumpToStart) currentFrame = clip.start;
    }
    updatePlayhead();
    updateDurationLabel();
    updateClipHighlights();
    render();
}

function updateActiveClipFromFrame() {
    let found = null;
    for (let i = 0; i < layers.length; i++) {
        for (const clip of layers[i]) {
            if (clip.contains(currentFrame)) {
                found = clip;
                break;
            }
        }
        if (found) break;
    }
    if (found) {
        document.querySelectorAll(".clip").forEach(el => el.classList.remove("selected"));
        activeClip = found;
        if (found.dom) found.dom.classList.add("selected");
    } else {
        document.querySelectorAll(".clip").forEach(el => el.classList.remove("selected"));
        activeClip = null;
    }
    updateClipHighlights();
}

function updateClipHighlights() {
    layers.forEach(layer => {
        layer.forEach(clip => {
            if (!clip.dom) return;
            clip.dom.classList.toggle("active-frame", clip.contains(currentFrame));
            clip.dom.classList.toggle("selected", clip === activeClip);
        });
    });
    updateTransformOverlay();
}

function getClipBounds(clip) {
    const pixels = clip.ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
    let left = CANVAS_WIDTH, top = CANVAS_HEIGHT, right = 0, bottom = 0;
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
        for (let x = 0; x < CANVAS_WIDTH; x++) {
            if (pixels[(y * CANVAS_WIDTH + x) * 4 + 3] > 0) {
                left = Math.min(left, x); top = Math.min(top, y);
                right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
            }
        }
    }
    if (right <= left || bottom <= top) return { left: 0, top: 0, right: CANVAS_WIDTH, bottom: CANVAS_HEIGHT };
    return { left, top, right, bottom };
}

function updateTransformOverlay() {
    const oldOverlay = container?.querySelector('.transform-overlay');
    if (oldOverlay) oldOverlay.remove();
    if (!transformMode || !activeClip || !container) return;
    const bounds = getClipBounds(activeClip);
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scaleX = canvasRect.width / CANVAS_WIDTH;
    const scaleY = canvasRect.height / CANVAS_HEIGHT;
    const overlay = document.createElement('div');
    overlay.className = 'transform-overlay';
    overlay.style.left = `${canvasRect.left - containerRect.left + bounds.left * scaleX}px`;
    overlay.style.top = `${canvasRect.top - containerRect.top + bounds.top * scaleY}px`;
    overlay.style.width = `${(bounds.right - bounds.left) * scaleX}px`;
    overlay.style.height = `${(bounds.bottom - bounds.top) * scaleY}px`;
    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(position => {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = `transform-handle ${position}`;
        handle.setAttribute('aria-label', `Resize ${position}`);
        handle.addEventListener('pointerdown', event => startTransform(event, position, bounds));
        overlay.appendChild(handle);
    });
    container.appendChild(overlay);
}

function startTransform(event, position, bounds) {
    event.preventDefault();
    event.stopPropagation();
    pushClipHistory();
    transformState = { position, bounds, startX: event.clientX, startY: event.clientY, image: activeClip.canvas };
    window.addEventListener('pointermove', updateTransform);
    window.addEventListener('pointerup', endTransform, { once: true });
}

function updateTransform(event) {
    if (!transformState || !activeClip) return;
    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - transformState.startX) * CANVAS_WIDTH / rect.width;
    const dy = (event.clientY - transformState.startY) * CANVAS_HEIGHT / rect.height;
    const next = { ...transformState.bounds };
    if (transformState.position.includes('w')) next.left = Math.min(next.right - 2, next.left + dx);
    if (transformState.position.includes('e')) next.right = Math.max(next.left + 2, next.right + dx);
    if (transformState.position.includes('n')) next.top = Math.min(next.bottom - 2, next.top + dy);
    if (transformState.position.includes('s')) next.bottom = Math.max(next.top + 2, next.bottom + dy);
    const source = document.createElement('canvas');
    source.width = CANVAS_WIDTH; source.height = CANVAS_HEIGHT;
    source.getContext('2d').drawImage(transformState.image, 0, 0);
    activeClip.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    activeClip.ctx.drawImage(source, transformState.bounds.left, transformState.bounds.top,
        transformState.bounds.right - transformState.bounds.left, transformState.bounds.bottom - transformState.bounds.top,
        next.left, next.top, next.right - next.left, next.bottom - next.top);
    render();
    updateTransformOverlay();
}

function endTransform() {
    window.removeEventListener('pointermove', updateTransform);
    transformState = null;
    scheduleSave();
}


function createClipDOM(clip, row) {
    const el = document.createElement("div");
    el.className = "clip";
    clip.dom = el;

    const left = document.createElement("div");
    const right = document.createElement("div");
    left.className = "handle left";
    right.className = "handle right";
    el.append(left, right);
    row.appendChild(el);

    updateClipStyle(clip);

    el.addEventListener("mousedown", e => {
        e.stopPropagation();
        const target = e.target;
        const mode = target === left ? "L" : target === right ? "R" : "M";
        startClipDrag(e, clip, mode);
    });

    el.addEventListener("click", e => {
        e.stopPropagation();
        setSelectedClip(clip);
    });
}

let dragState = null;

function startClipDrag(e, clip, mode) {
    pushClipHistory();
    dragState = {
        clip,
        mode,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startFrame: clip.start,
        startDuration: clip.duration,
        startLayer: clip.layerIndex
    };
    window.addEventListener("mousemove", onClipDrag);
    window.addEventListener("mouseup", endClipDrag);
}

function onClipDrag(e) {
    if (!dragState) return;

    const deltaFrames = Math.round((e.clientX - dragState.startClientX) / pxPerFrame);
    const clip = dragState.clip;

    if (dragState.mode === "M") {
        const gridRect = fpsGridContainer.getBoundingClientRect();
        const y = e.clientY - gridRect.top + fpsGridContainer.scrollTop;
        let targetLayer = Math.floor(y / ROW_HEIGHT);
        targetLayer = Math.max(0, Math.min(layers.length - 1, targetLayer));
        const candidateStart = Math.max(0, dragState.startFrame + deltaFrames);

        const currentLayer = layers[clip.layerIndex];
        const targetLayerArr = layers[targetLayer];
        const testClip = { start: candidateStart, duration: clip.duration, end: () => candidateStart + clip.duration };

        if (!overlaps(targetLayerArr.filter(c => c !== clip), testClip)) {
            clip.start = candidateStart;
            if (clip.layerIndex !== targetLayer) {
                currentLayer.splice(currentLayer.indexOf(clip), 1);
                clip.layerIndex = targetLayer;
                targetLayerArr.push(clip);
                buildTimeline(true);
                setSelectedClip(clip, false);
                return;
            }
            updateClipStyle(clip);
        }
    }

    if (dragState.mode === "L") {
        const newStart = Math.max(0, dragState.startFrame + deltaFrames);
        const newDuration = dragState.startDuration - (newStart - dragState.startFrame);
        const testClip = { start: newStart, duration: newDuration, end: () => newStart + newDuration };
        const layer = layers[clip.layerIndex];
        if (newDuration >= 1 && !overlaps(layer.filter(c => c !== clip), testClip)) {
            clip.start = newStart;
            clip.duration = newDuration;
            updateClipStyle(clip);
        }
    }

    if (dragState.mode === "R") {
        const newDuration = dragState.startDuration + deltaFrames;
        const testClip = { start: clip.start, duration: newDuration, end: () => clip.start + newDuration };
        const layer = layers[clip.layerIndex];
        if (newDuration >= 1 && !overlaps(layer.filter(c => c !== clip), testClip)) {
            clip.duration = newDuration;
            updateClipStyle(clip);
        }
    }

    buildTimeline(true);
    render();
    updateDurationLabel();
}

function endClipDrag() {
    window.removeEventListener("mousemove", onClipDrag);
    window.removeEventListener("mouseup", endClipDrag);
    dragState = null;
    scheduleSave();
}

function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

function snapshot(clip) {
    return clip.ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function applyImage(clip, imageData) {
    clip.ctx.putImageData(imageData, 0, 0);
}

function pushUndo(clip, imageData) {
    clip.undoStack.push(imageData);
    if (clip.undoStack.length > MAX_UNDO) clip.undoStack.shift();
    clip.redoStack = [];
}

function undo() {
    if (activeClip && activeClip.undoStack.length > 0) {
        const current = snapshot(activeClip);
        const prev = activeClip.undoStack.pop();
        activeClip.redoStack.push(current);
        applyImage(activeClip, prev);
        render();
        refreshAllPreviews();
        scheduleSave();
        return;
    }
    if (clipUndoStack.length === 0) return;
    clipRedoStack.push(captureClipState());
    restoreClipState(clipUndoStack.pop());
    scheduleSave();
}

function redo() {
    if (activeClip && activeClip.redoStack.length > 0) {
        const current = snapshot(activeClip);
        const next = activeClip.redoStack.pop();
        activeClip.undoStack.push(current);
        applyImage(activeClip, next);
        render();
        refreshAllPreviews();
        scheduleSave();
        return;
    }
    if (clipRedoStack.length === 0) return;
    clipUndoStack.push(captureClipState());
    restoreClipState(clipRedoStack.pop());
    scheduleSave();
}

canvas.addEventListener("mousedown", e => {
    if (handMode) {
        e.preventDefault();
        panning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginX = panX;
        panOriginY = panY;
        updateCursor();
        return;
    }
    if (!activeClip) return;
    drawing = true;
    drawSnapshot = snapshot(activeClip);
    const p = getCanvasPos(e);
    const c = activeClip.ctx;
    c.beginPath();
    c.moveTo(p.x, p.y);

    if (tool === "pencil") {
        c.strokeStyle = brushColor;
        c.lineWidth = toolSettings.pencil.size;
        c.lineCap = "round";
        c.lineJoin = "round";
        c.globalAlpha = toolSettings.pencil.opacity;
        c.lineTo(p.x + 0.01, p.y + 0.01);
        c.stroke();
        c.globalAlpha = 1;
    } else if (tool === "eraser") {
        c.save();
        c.globalCompositeOperation = "destination-out";
        c.beginPath();
        c.arc(p.x, p.y, toolSettings.eraser.size / 2, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
    render();
});

canvas.addEventListener("mousemove", e => {
    if (handMode && panning) {
        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        panX = panOriginX + dx;
        panY = panOriginY + dy;
        applyCanvasTransform();
        return;
    }
    if (!activeClip || !drawing) return;
    const p = getCanvasPos(e);
    const c = activeClip.ctx;

    if (tool === "pencil") {
        c.strokeStyle = brushColor;
        c.lineWidth = toolSettings.pencil.size;
        c.lineCap = "round";
        c.lineJoin = "round";
        c.globalAlpha = toolSettings.pencil.opacity;
        c.lineTo(p.x, p.y);
        c.stroke();
        c.globalAlpha = 1;
    } else if (tool === "eraser") {
        c.save();
        c.globalCompositeOperation = "destination-out";
        c.beginPath();
        c.arc(p.x, p.y, toolSettings.eraser.size / 2, 0, Math.PI * 2);
        c.fill();
        c.restore();
    }
    render();
});

window.addEventListener("mouseup", () => {
    if (panning) {
        panning = false;
        updateCursor();
    }
    if (drawing && activeClip && drawSnapshot) {
        pushUndo(activeClip, drawSnapshot);
        drawSnapshot = null;
        refreshAllPreviews();
        scheduleSave();
    }
    drawing = false;
});

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = layers.length - 1; i >= 0; i--) {
        for (const clip of layers[i]) {
            if (clip.contains(currentFrame)) ctx.drawImage(clip.canvas, 0, 0);
        }
    }

    if (onion && currentFrame > 0) {
        ctx.globalAlpha = 0.5;
        for (let i = layers.length - 1; i >= 0; i--) {
            for (const clip of layers[i]) {
                if (clip.contains(currentFrame - 1)) ctx.drawImage(clip.canvas, 0, 0);
            }
        }
        ctx.globalAlpha = 1;
    }
    if (onionNext) {
        ctx.globalAlpha = 0.5;
        for (let i = layers.length - 1; i >= 0; i--) {
            for (const clip of layers[i]) {
                if (clip.contains(currentFrame + 1)) ctx.drawImage(clip.canvas, 0, 0);
            }
        }
        ctx.globalAlpha = 1;
    }
    updateClipHighlights();
}

async function openProjectSettings() {
    if (!project) return;
    const overlay = document.createElement('div');
    overlay.className = 'editor-modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'editor-modal';
    modal.innerHTML = await (await fetch('indexAssets/components/modal.html')).text();
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modal.querySelector('#project-name').value = project.name;
    modal.querySelector('#canvas-width').value = CANVAS_WIDTH;
    modal.querySelector('#canvas-height').value = CANVAS_HEIGHT;
    modal.querySelector('#fps-value').value = FPS;
    modal.querySelector('#make-project-btn').textContent = 'Save changes';
    modal.querySelector('#close-btn').addEventListener('click', () => overlay.remove());
    modal.querySelector('#make-project-btn').addEventListener('click', async () => {
        await updateProjectMeta(project.id, {
            name: modal.querySelector('#project-name').value.trim() || project.name,
            settings: {
                ...project.settings,
                CANVAS_WIDTH: Number(modal.querySelector('#canvas-width').value) || CANVAS_WIDTH,
                CANVAS_HEIGHT: Number(modal.querySelector('#canvas-height').value) || CANVAS_HEIGHT,
                FPS: Number(modal.querySelector('#fps-value').value) || FPS
            }
        });
        overlay.remove();
        window.location.reload();
    });
}

async function importMedia(file) {
    const clip = new Clip(getMaxEndFrame(), 1, 0, { name: file.name, type: file.type, blob: file });
    if (file.type.startsWith('image/')) {
        await bufferToCanvas(await file.arrayBuffer(), clip.ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    layers[0].push(clip);
    buildTimeline(true);
    setSelectedClip(clip);
    render();
    scheduleSave();
}

async function exportVideo() {
    if (!exportVideoBtn || !project || !window.MediaRecorder || !canvas.captureStream) return;
    const mimeTypes = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) return;
    const chunks = [];
    const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType });
    recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
    const stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
    const previousFrame = currentFrame;
    recorder.start();
    const frameCount = Math.max(1, getMaxEndFrame());
    for (let frame = 0; frame < frameCount; frame++) {
        currentFrame = frame;
        render();
        await new Promise(resolve => setTimeout(resolve, 1000 / FPS));
    }
    recorder.stop();
    await stopped;
    currentFrame = previousFrame;
    render();
    const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
    const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    const durationSeconds = frameCount / FPS;
    await saveExport({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        projectId: project.id,
        name: `${project.name} export`,
        fileName: `${project.name.replace(/[^a-z0-9-_]/gi, '_')}.${extension}`,
        mimeType: blob.type,
        createdAt: Date.now(),
        durationSeconds,
        blob
    });
}

function renderFramePreview(frame, previewCtx) {
    previewCtx.clearRect(0, 0, 20, 20);
    for (let i = layers.length - 1; i >= 0; i--) {
        for (const clip of layers[i]) {
            if (clip.contains(frame)) {
                previewCtx.drawImage(clip.canvas, 0, 0, canvas.width, canvas.height, 0, 0, 20, 20);
            }
        }
    }
}

function refreshAllPreviews() {
    previewCanvases.forEach((preview, frame) => {
        const c = preview.getContext("2d");
        renderFramePreview(frame, c);
    });
}

function updatePlayhead(centerOnPlay = false) {
    const left = currentFrame * pxPerFrame;
    playhead.style.left = `${left}px`;
    if (centerOnPlay) {
        const half = animationContainer.clientWidth / 2;
        const maxScroll = Math.max(0, timelineFrames * pxPerFrame - animationContainer.clientWidth);
        const target = Math.max(0, Math.min(left - half, maxScroll));
        animationContainer.scrollLeft = target;
    }
}

function gotoFrame(frame) {
    currentFrame = Math.max(0, Math.min(frame, getMaxEndFrame() - 1));
    updatePlayhead();
    updateActiveClipFromFrame();
    render();
    updateDurationLabel();
}

function play() {
    if (playing) return;
    onionBeforePlay = onion;
    onionNextBeforePlay = onionNext;
    onion = false;
    onionNext = false;
    playing = true;
    timer = setInterval(() => {
        currentFrame++;
        const endFrame = Math.max(1, getMaxEndFrame());
        if (currentFrame >= endFrame) currentFrame = 0;
        updatePlayhead(true);
        updateActiveClipFromFrame();
        render();
        updateDurationLabel();
    }, 1000 / FPS);
}

function pause() {
    playing = false;
    clearInterval(timer);
    onion = onionBeforePlay;
    onionNext = onionNextBeforePlay;
    render();
}

function togglePlayPause() {
    if (playing) pause();
    else play();
}

function copyClipContent() {
    if (!activeClip) return;
    clipboardImage = snapshot(activeClip);
}

function cutClipContent() {
    if (!activeClip) return;
    clipboardImage = snapshot(activeClip);
    pushUndo(activeClip, snapshot(activeClip));
    activeClip.ctx.clearRect(0, 0, canvas.width, canvas.height);
    render();
    refreshAllPreviews();
    scheduleSave();
}

function pasteClipContent() {
    if (!activeClip || !clipboardImage) return;
    pushUndo(activeClip, snapshot(activeClip));
    applyImage(activeClip, clipboardImage);
    render();
    refreshAllPreviews();
    scheduleSave();
}

function deleteClipDrawing() {
    if (!activeClip) return;
    pushUndo(activeClip, snapshot(activeClip));
    activeClip.ctx.clearRect(0, 0, canvas.width, canvas.height);
    render();
    refreshAllPreviews();
    scheduleSave();
}

function deleteSelectedClip() {
    let target = activeClip;
    if (!target) {
        for (const layer of layers) {
            for (const clip of layer) {
                if (clip.contains(currentFrame)) {
                    target = clip;
                    break;
                }
            }
            if (target) break;
        }
    }
    if (!target) return;
    pushClipHistory();
    const layer = layers[target.layerIndex];
    const index = layer.indexOf(target);
    if (index >= 0) layer.splice(index, 1);
    if (target.dom) target.dom.remove();
    if (activeClip === target) activeClip = null;
    buildTimeline(true);
    render();
    refreshAllPreviews();
    scheduleSave();
}

function splitSelectedClip() {
    if (!activeClip) return;
    if (currentFrame <= activeClip.start) return;
    if (currentFrame >= activeClip.end()) return;

    const splitFrame = currentFrame;
    const leftDuration = splitFrame - activeClip.start;
    const rightDuration = activeClip.end() - splitFrame;
    if (leftDuration <= 0 || rightDuration <= 0) return;

    pushClipHistory();
    const newClip = new Clip(splitFrame, rightDuration, activeClip.layerIndex);
    newClip.ctx.drawImage(activeClip.canvas, 0, 0);

    activeClip.duration = leftDuration;

    const layer = layers[activeClip.layerIndex];
    layer.push(newClip);
    layer.sort((a, b) => a.start - b.start);

    buildTimeline(true);
    setSelectedClip(newClip, false);
    scheduleSave();
}

function setTool(nextTool) {
    tool = nextTool;
    updateCursor();
    if (activeToolPanel && toolPanels[nextTool]) {
        if (activeToolPanel !== toolPanels[nextTool]) {
            activeToolPanel.style.display = "none";
            toolPanels[nextTool].style.display = "flex";
            activeToolPanel = toolPanels[nextTool];
        }
    }
}

function updateCursor() {
    if (handMode) {
        canvas.style.cursor = panning ? "grabbing" : "grab";
        return;
    }
    if (tool === "pencil" || tool === "eraser") canvas.style.cursor = "crosshair";
    else canvas.style.cursor = "default";
}

function setupToolPanel(button, toolKey) {
    const panel = document.createElement("div");
    panel.className = "tool-panel";
    const sizeCol = document.createElement("div");
    sizeCol.className = "slider-col";
    const sizeLabel = document.createElement("label");
    sizeLabel.textContent = "S";
    const sizeInput = document.createElement("input");
    sizeInput.type = "range";
    sizeInput.min = 1;
    sizeInput.max = 100;
    sizeInput.value = toolSettings[toolKey].size;

    const opCol = document.createElement("div");
    opCol.className = "slider-col";
    const opLabel = document.createElement("label");
    opLabel.textContent = "O";
    const opInput = document.createElement("input");
    opInput.type = "range";
    opInput.min = 0.05;
    opInput.max = 1;
    opInput.step = 0.05;
    opInput.value = toolSettings[toolKey].opacity;

    sizeInput.addEventListener("input", () => {
        toolSettings[toolKey].size = Number(sizeInput.value);
    });
    opInput.addEventListener("input", () => {
        toolSettings[toolKey].opacity = Number(opInput.value);
    });

    sizeCol.append(sizeLabel, sizeInput);
    opCol.append(opLabel, opInput);
    panel.append(sizeCol, opCol);
    button.parentElement.style.position = "relative";
    button.parentElement.appendChild(panel);
    toolPanels[toolKey] = panel;

    button.addEventListener("dblclick", e => {
        e.preventDefault();
        if (activeToolPanel && activeToolPanel !== panel) {
            activeToolPanel.style.display = "none";
        }
        const isOpen = panel.style.display === "flex";
        panel.style.display = isOpen ? "none" : "flex";
        activeToolPanel = panel.style.display === "flex" ? panel : null;
    });
}

fpsScale.addEventListener("wheel", e => {
    e.preventDefault();
    pxPerFrame += e.deltaY < 0 ? 2 : -2;
    pxPerFrame = Math.max(MIN_PX_PER_FRAME, Math.min(MAX_PX_PER_FRAME, pxPerFrame));
    buildTimeline(true);
});

animationContainer.addEventListener("scroll", () => {
    updatePlayhead();
});

fpsGridContainer.addEventListener("mousedown", e => {
    if (e.target.closest(".clip")) return;
    const rect = fpsGridContainer.getBoundingClientRect();
    const x = e.clientX - rect.left + animationContainer.scrollLeft;
    const frame = Math.floor(x / pxPerFrame);
    gotoFrame(frame);
});

fpsScale.addEventListener("mousedown", e => {
    const rect = fpsScale.getBoundingClientRect();
    const x = e.clientX - rect.left + animationContainer.scrollLeft;
    const frame = Math.floor(x / pxPerFrame);
    gotoFrame(frame);
});

function getPointerCenter() {
    const pts = Array.from(activePointers.values());
    const ax = (pts[0].clientX + pts[1].clientX) / 2;
    const ay = (pts[0].clientY + pts[1].clientY) / 2;
    return { x: ax, y: ay };
}

function getPointerDistance() {
    const pts = Array.from(activePointers.values());
    const dx = pts[0].clientX - pts[1].clientX;
    const dy = pts[0].clientY - pts[1].clientY;
    return Math.hypot(dx, dy);
}

container.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch") return;
    container.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    if (activePointers.size === 2) {
        pinchStartDist = getPointerDistance();
        pinchStartScale = canvasScale;
        const center = getPointerCenter();
        pinchStartCenterX = center.x;
        pinchStartCenterY = center.y;
        pinchStartPanX = panX;
        pinchStartPanY = panY;
    }
});

container.addEventListener("pointermove", e => {
    if (e.pointerType !== "touch" || !activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    if (activePointers.size !== 2) return;
    e.preventDefault();
    const dist = getPointerDistance();
    if (!pinchStartDist) return;
    const scaleFactor = dist / pinchStartDist;
    canvasScale = Math.max(defaultCanvasScale, Math.min(MAX_CANVAS_SCALE, pinchStartScale * scaleFactor));
    const center = getPointerCenter();
    panX = pinchStartPanX + (center.x - pinchStartCenterX);
    panY = pinchStartPanY + (center.y - pinchStartCenterY);
    applyCanvasTransform();
    updateZoomLabel();
}, { passive: false });

function endPointer(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) {
        pinchStartDist = 0;
    }
}

container.addEventListener("pointerup", endPointer);
container.addEventListener("pointercancel", endPointer);

container.addEventListener("wheel", e => {
    if (e.shiftKey || e.ctrlKey) {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
        canvasScale = Math.max(defaultCanvasScale, Math.min(MAX_CANVAS_SCALE, canvasScale * zoomFactor));
        applyCanvasTransform();
        updateZoomLabel();
        return;
    }
    e.preventDefault();
    panX -= e.deltaX;
    panY -= e.deltaY;
    applyCanvasTransform();
}, { passive: false });

window.addEventListener("resize", () => {
    updateAnimationMinWidth();
    defaultCanvasScale = getDefaultCanvasScale();
    centerCanvasInContainer();
    updateZoomLabel();
});

// changing cursor when hovering over canvas
canvas.addEventListener("mouseenter", updateCursor);
// adding event listeners to buttons and other elements
pencilBtn.addEventListener("click", () => setTool("pencil"));
eraserBtn.addEventListener("click", () => setTool("eraser"));
colorPicker.addEventListener("input", e => brushColor = e.target.value);
let onionClickTimer = null;
onionBtn.addEventListener("click", () => {
    if (onionClickTimer) return;
    onionClickTimer = setTimeout(() => {
        onion = !onion;
        render();
        scheduleSave();
        onionClickTimer = null;
    }, 220);
});

onionBtn.addEventListener("dblclick", e => {
    e.preventDefault();
    if (onionClickTimer) {
        clearTimeout(onionClickTimer);
        onionClickTimer = null;
    }
    onionNext = !onionNext;
    render();
    scheduleSave();
});

if (playBtn) playBtn.addEventListener("click", togglePlayPause);
if (rewindBtn) rewindBtn.addEventListener("click", () => gotoFrame(currentFrame - 10 * FPS));
if (forwardBtn) forwardBtn.addEventListener("click", () => gotoFrame(currentFrame + 10 * FPS));

if (copyBtn) copyBtn.addEventListener("click", copyClipContent);
if (cutBtn) cutBtn.addEventListener("click", cutClipContent);
if (pasteBtn) pasteBtn.addEventListener("click", pasteClipContent);
if (deleteBtn) deleteBtn.addEventListener("click", deleteClipDrawing);
if (undoBtn) undoBtn.addEventListener("click", undo);
if (redoBtn) redoBtn.addEventListener("click", redo);
if (splitBtn) splitBtn.addEventListener("click", splitSelectedClip);
if (copyClipBtn) {
    copyClipBtn.addEventListener("click", () => {
        if (!activeClip) return;
        clipboardClip = {
            duration: activeClip.duration,
            layerIndex: activeClip.layerIndex,
            image: snapshot(activeClip)
        };
    });
}
if (pasteClipBtn) {
    pasteClipBtn.addEventListener("click", () => {
        if (!clipboardClip || !activeClip) return;
        pushClipHistory();
        const layerIndex = activeClip.layerIndex;
        const layer = layers[layerIndex];
        const start = activeClip.end();
        const newClip = new Clip(start, clipboardClip.duration, layerIndex);
        const testClip = { start, duration: newClip.duration, end: () => start + newClip.duration };
        if (overlaps(layer, testClip)) return;
        applyImage(newClip, clipboardClip.image);
        layer.push(newClip);
        layer.sort((a, b) => a.start - b.start);
        buildTimeline(true);
        setSelectedClip(newClip, false);
        scheduleSave();
    });
}
if (deleteClipBtn) deleteClipBtn.addEventListener("click", deleteSelectedClip);
if (projectSettingsBtn) projectSettingsBtn.addEventListener('click', openProjectSettings);
if (exportVideoBtn) exportVideoBtn.addEventListener('click', exportVideo);
if (mediaImport) mediaImport.addEventListener('change', async event => {
    for (const file of event.target.files) await importMedia(file);
    event.target.value = '';
});
if (transformTool) transformTool.addEventListener('click', () => {
    transformMode = !transformMode;
    transformTool.classList.toggle('active', transformMode);
    updateTransformOverlay();
});
if (panelResizeHandle) {
    panelResizeHandle.addEventListener('pointerdown', event => {
        event.preventDefault();
        panelResizeState = { startX: event.clientX, width: editingPanel.offsetWidth };
        window.addEventListener('pointermove', resizeEditingPanel);
        window.addEventListener('pointerup', stopResizeEditingPanel, { once: true });
    });
}
if (fpsGridContainer) {
    fpsGridContainer.addEventListener('dragover', event => {
        if (Array.from(event.dataTransfer?.types || []).includes('Files')) {
            event.preventDefault();
            fpsGridContainer.classList.add('is-dragging');
        }
    });
    fpsGridContainer.addEventListener('dragleave', event => {
        if (!fpsGridContainer.contains(event.relatedTarget)) fpsGridContainer.classList.remove('is-dragging');
    });
    fpsGridContainer.addEventListener('drop', async event => {
        event.preventDefault();
        fpsGridContainer.classList.remove('is-dragging');
        for (const file of event.dataTransfer.files) await importMedia(file);
    });
}
if (addFramesBtn) {
    addFramesBtn.addEventListener("click", () => {
        minVisibleFrames += 10;
        buildTimeline(true);
        scheduleSave();
    });
}

const zoomResetBtn = document.getElementById("zoomReset");
if (zoomResetBtn) {
    zoomResetBtn.addEventListener("click", () => {
        defaultCanvasScale = getDefaultCanvasScale();
        canvasScale = defaultCanvasScale;
        panX = 0;
        panY = 0;
        applyCanvasTransform();
        centerCanvasInContainer();
        updateZoomLabel();
    });
}

if (editingButtons.length) {
    updateLayerCountLabel();
    updateFrameCountLabel();
}

if (addLayerBtn) {
    addLayerBtn.addEventListener("click", () => {
        pushClipHistory();
        layers.push([]);
        buildTimeline(true);
        scheduleSave();
    });
}

//keyboard shortcuts
window.addEventListener("keydown", e => {
    const key = e.key.toLowerCase();
    if (key === "h") {
        handMode = true;
        updateCursor();
    }
    if (e.ctrlKey && key === "c") {
        e.preventDefault();
        copyClipContent();
    }
    if (e.ctrlKey && key === "x") {
        e.preventDefault();
        cutClipContent();
    }
    if (e.ctrlKey && key === "v") {
        e.preventDefault();
        pasteClipContent();
    }
    if (e.ctrlKey && key === "z") {
        e.preventDefault();
        undo();
    }
    if (e.ctrlKey && key === "y") {
        e.preventDefault();
        redo();
    }
    if (key === "delete" || key === "backspace") {
        e.preventDefault();
        deleteClipDrawing();
    }
    if (e.ctrlKey && key === "s") {
        e.preventDefault();
        saveCurrentProject();
    }
});

window.addEventListener("keyup", e => {
    if (e.key.toLowerCase() === "h") {
        handMode = false;
        panning = false;
        updateCursor();
    }
});

async function initializeEditor() {
    setupToolPanel(pencilBtn, "pencil");
    setupToolPanel(eraserBtn, "eraser");

    if (projectId) {
        try {
            await restoreProject();
        } catch (error) {
            console.error(error);
        }
    }

    if (!layers.some(layer => layer.length)) {
        layers[0].push(new Clip(0, 1, 0));
    }

    updateAnimationMinWidth();
    defaultCanvasScale = getDefaultCanvasScale();
    canvasScale = defaultCanvasScale;
    panX = 0;
    panY = 0;
    applyCanvasTransform();
    centerCanvasInContainer();
    updateZoomLabel();
    buildTimeline(true);
    setSelectedClip(layers[0][0]);
    updateDurationLabel();
    render();
    scheduleSave();
}

initializeEditor();
