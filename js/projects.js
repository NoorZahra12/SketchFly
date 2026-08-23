// js/projects.js
// Data layer for SketchFly projects – uses IndexedDB

const DB_NAME = 'SketchFlyDB';
const STORE_NAME = 'projects';
const EXPORT_STORE_NAME = 'exports';
const DB_VERSION = 2;

let db = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(EXPORT_STORE_NAME)) {
                db.createObjectStore(EXPORT_STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

// Generate a unique ID
function generateId() {
    return Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

// Default project settings (match your constants)
const DEFAULT_SETTINGS = {
    FPS: 12,
    DEFAULT_LAYERS: 4,
    ROW_HEIGHT: 36,
    MIN_VISIBLE_FRAMES: 100,
    MIN_PX_PER_FRAME: 18,
    MAX_PX_PER_FRAME: 40,
    MIN_CANVAS_SCALE: 0.5,
    MAX_CANVAS_SCALE: 3,
    MAX_UNDO: 25,
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 600
};

/**
 * Create a new project (in memory, not saved yet)
 * @param {string} name - project name
 * @param {object} settings - optional override
 * @returns {object} project data
 */
export function createProject(name, settings = {}) {
    const id = generateId();
    const width = Number(settings.CANVAS_WIDTH ?? settings.width ?? DEFAULT_SETTINGS.CANVAS_WIDTH);
    const height = Number(settings.CANVAS_HEIGHT ?? settings.height ?? DEFAULT_SETTINGS.CANVAS_HEIGHT);
    const fps = Number(settings.FPS ?? settings.fps ?? DEFAULT_SETTINGS.FPS);
    return {
        id,
        name: name || 'Untitled',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        starred: false,
        settings: {
            ...DEFAULT_SETTINGS,
            ...settings,
            FPS: fps,
            CANVAS_WIDTH: width,
            CANVAS_HEIGHT: height
        },
        layers: Array.from({ length: DEFAULT_SETTINGS.DEFAULT_LAYERS }, () => []),
        currentFrame: 0,
        onion: true,
        onionNext: false,
        minVisibleFrames: DEFAULT_SETTINGS.MIN_VISIBLE_FRAMES,
        pxPerFrame: DEFAULT_SETTINGS.MAX_PX_PER_FRAME,
        // ... other runtime state you want to persist
    };
}

/**
 * Save a project to IndexedDB (overwrites existing)
 * @param {object} project - full project data
 */
export async function saveProject(project) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(project);
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Load a project by ID
 * @param {string} id
 * @returns {object|null} project data or null if not found
 */
export async function loadProject(id) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    const result = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return result || null;
}

/**
 * Get all projects (for gallery)
 * @returns {Array} array of project summaries (id, name, createdAt)
 */
export async function getAllProjects() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    const all = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    // Return only metadata (exclude heavy image data)
    return all.sort((a, b) => {
        if (Boolean(a.starred) !== Boolean(b.starred)) return a.starred ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
    }).map(p => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        starred: Boolean(p.starred),
        fps: p.settings?.FPS ?? DEFAULT_SETTINGS.FPS,
        duration: formatDuration(p.durationFrames ?? 1, p.settings?.FPS ?? DEFAULT_SETTINGS.FPS),
        thumbnail: p.thumbnail || null
    }));
}

function formatDuration(frames, fps) {
    const seconds = Math.floor(Math.max(0, frames) / Math.max(1, fps));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Delete a project
 * @param {string} id
 */
export async function deleteProject(id) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

// ---------------------------
// Helpers for image conversion (used by editor)
// ---------------------------

/**
 * Convert a canvas element to an ArrayBuffer (PNG)
 */
export function canvasToBuffer(canvas) {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsArrayBuffer(blob);
        }, 'image/png');
    });
}

/**
 * Load an ArrayBuffer into a canvas context
 */
export function bufferToCanvas(buffer, ctx, width, height) {
    return new Promise((resolve) => {
        const blob = new Blob([buffer], { type: 'image/png' });
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, width, height);
            resolve();
        };
        img.src = URL.createObjectURL(blob);
    });
}

export async function updateProjectMeta(id, changes) {
    const project = await loadProject(id);
    if (!project) return null;
    const updated = { ...project, ...changes, updatedAt: Date.now() };
    await saveProject(updated);
    return updated;
}

export async function saveExport(exportRecord) {
    const database = await openDB();
    const tx = database.transaction(EXPORT_STORE_NAME, 'readwrite');
    tx.objectStore(EXPORT_STORE_NAME).put(exportRecord);
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function getAllExports() {
    const database = await openDB();
    const tx = database.transaction(EXPORT_STORE_NAME, 'readonly');
    const request = tx.objectStore(EXPORT_STORE_NAME).getAll();
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
        request.onerror = () => reject(request.error);
    });
}

export async function deleteExport(id) {
    const database = await openDB();
    const tx = database.transaction(EXPORT_STORE_NAME, 'readwrite');
    tx.objectStore(EXPORT_STORE_NAME).delete(id);
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}