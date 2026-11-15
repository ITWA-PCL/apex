/**
 * APEX (apex.windowasia.com) - Cloud PostgreSQL & Real-Time SSE Bridge
 * Connects the APEX UI (window.claude adapter) to PostgreSQL (dept-db) + Server-Sent Events
 */
(function initApexCloudBridge() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  const store = {};
  const subscribers = {};
  let currentUser = null;
  let systemConfig = {};
  let bootPromise = null;
  let seqCounter = Date.now();

  function getHeaders() {
    const h = { 'Content-Type': 'application/json' };
    try {
      const actAs = sessionStorage.getItem('actAs');
      if (actAs) h['X-Act-As-User'] = actAs;
    } catch (_) {}
    return h;
  }

  function ensureCollection(col) {
    if (!store[col]) store[col] = {};
    return store[col];
  }

  function buildSnapshot(col) {
    const map = ensureCollection(col);
    return {
      docs: Object.entries(map).map(([id, value]) => ({
        id,
        exists: true,
        data: () => value
      }))
    };
  }

  function emitCollection(col) {
    const listeners = subscribers[col] || [];
    if (!listeners.length) return;
    const snap = buildSnapshot(col);
    setTimeout(() => {
      listeners.forEach(fn => {
        try {
          fn(snap);
        } catch (err) {
          console.error('[APEX Bridge] Snapshot listener error:', err);
        }
      });
    }, 0);
  }

  function loadCollectionsIntoMemory(collectionsObj) {
    for (const [col, list] of Object.entries(collectionsObj || {})) {
      const colMap = {};
      if (Array.isArray(list)) {
        list.forEach((doc, idx) => {
          const id = String(doc.id || doc.code || doc.no || `d_${idx + 1}`);
          const normalized = { ...doc, id };
          if (col === 'users' && !normalized.uid) {
            normalized.uid = id;
          }
          colMap[id] = normalized;
        });
      }
      store[col] = colMap;
    }
  }

  async function refreshCollectionFromServer(col) {
    try {
      const res = await fetch(`/api/v1/db/${encodeURIComponent(col)}`, {
        headers: getHeaders()
      });
      if (res.status === 401) {
        if (currentUser && typeof window.__APEX_ON_401__ === 'function') {
          window.__APEX_ON_401__();
        }
        return;
      }
      if (!res.ok) return;
      const payload = await res.json();
      if (Array.isArray(payload.docs)) {
        const colMap = {};
        payload.docs.forEach(d => {
          const id = String(d.id || d.code || `d_${++seqCounter}`);
          colMap[id] = { ...d, id };
        });
        store[col] = colMap;
        emitCollection(col);
      }
    } catch (err) {
      console.warn('[APEX Bridge] Refresh collection failed:', col, err);
    }
  }

  function sanitizeOptimisticRecord(col, record) {
    if (col !== 'users' || !record || typeof record !== 'object') return record;
    const clean = { ...record };
    delete clean.password;
    delete clean.password_hash;
    delete clean.admin_password_hash;
    return clean;
  }

  async function handleFailedResponse(res, col, fallbackMsg) {
    const out = await res.json().catch(() => null);
    if (res.status === 401) {
      if (currentUser && typeof window.__APEX_ON_401__ === 'function') {
        window.__APEX_ON_401__();
      }
    } else if (col) {
      await refreshCollectionFromServer(col);
    }
    const err = new Error(out?.message || fallbackMsg);
    err.status = res.status;
    err.code = out?.error || `http_${res.status}`;
    if (out?.message) err.serverMessage = out.message;
    throw err;
  }

  function connectRealTimeEvents() {
    if (typeof EventSource === 'undefined') return;
    try {
      const es = new EventSource('/api/v1/events');
      es.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'collection_change' && msg.collection) {
            refreshCollectionFromServer(msg.collection);
          }
        } catch (_) {}
      };
    } catch (err) {
      console.warn('[APEX Bridge] SSE connection warning:', err);
    }
  }

  async function bootstrapCloudStore() {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      try {
        const res = await fetch('/api/v1/bootstrap', { headers: getHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let data = await res.json();
        currentUser = data.user || null;
        systemConfig = data.system || {};

        if (data.needsSeed && typeof window.demoData === 'function') {
          const seedPayload = window.demoData();
          const seedRes = await fetch('/api/v1/seed', {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ seed: seedPayload })
          });
          if (seedRes.ok) {
            const seeded = await seedRes.json();
            if (seeded.collections) {
              data.collections = seeded.collections;
            }
          }
        }

        loadCollectionsIntoMemory(data.collections || {});
        window.__APEX_USER__ = currentUser;
        window.__APEX_SYSTEM__ = systemConfig;
        connectRealTimeEvents();
        return true;
      } catch (err) {
        console.warn('[APEX Bridge] Could not reach backend API, falling back to demo store:', err);
        return false;
      }
    })();
    return bootPromise;
  }

  function createDocRef(pathStr) {
    const [col, ...rest] = String(pathStr).split('/');
    const id = rest.join('/');
    return {
      id,
      get: async () => {
        const map = ensureCollection(col);
        if (map[id]) {
          return { id, exists: true, data: () => map[id] };
        }
        try {
          const res = await fetch(`/api/v1/db/${encodeURIComponent(col)}/${encodeURIComponent(id)}`, {
            headers: getHeaders()
          });
          if (res.ok) {
            const payload = await res.json();
            if (payload.exists && payload.data) {
              map[id] = payload.data;
              return { id, exists: true, data: () => payload.data };
            }
          }
        } catch (_) {}
        return { id, exists: false, data: () => undefined };
      },
      set: async body => {
        const map = ensureCollection(col);
        const record = { ...body, id };
        map[id] = sanitizeOptimisticRecord(col, record);
        emitCollection(col);
        const res = await fetch(`/api/v1/db/${encodeURIComponent(col)}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(record)
        });
        if (!res.ok) {
          await handleFailedResponse(res, col, `Set failed on ${col}/${id}`);
        }
        const saved = await res.json().catch(() => null);
        if (saved && saved.data) {
          map[saved.id || id] = { ...saved.data, id: saved.id || id };
          emitCollection(col);
        }
      },
      update: async patch => {
        const map = ensureCollection(col);
        const current = map[id] || { id };
        const updated = { ...current, ...patch, id };
        map[id] = sanitizeOptimisticRecord(col, updated);
        emitCollection(col);
        const res = await fetch(`/api/v1/db/${encodeURIComponent(col)}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify(patch)
        });
        if (!res.ok) {
          await handleFailedResponse(res, col, `Update failed on ${col}/${id}`);
        }
        const saved = await res.json().catch(() => null);
        if (saved && saved.data) {
          map[saved.id || id] = { ...saved.data, id: saved.id || id };
          emitCollection(col);
        }
      },
      delete: async () => {
        const map = ensureCollection(col);
        delete map[id];
        emitCollection(col);
        const res = await fetch(`/api/v1/db/${encodeURIComponent(col)}/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (!res.ok) {
          await handleFailedResponse(res, col, `Delete failed on ${col}/${id}`);
        }
      }
    };
  }

  const dbAdapter = {
    doc: pathStr => createDocRef(pathStr),
    collection: col => ({
      doc: id => createDocRef(`${col}/${id}`),
      add: async body => {
        const id = body.id || body.code || `d_${(++seqCounter).toString(36)}`;
        const map = ensureCollection(col);
        const record = { ...body, id };
        map[id] = sanitizeOptimisticRecord(col, record);
        emitCollection(col);
        const res = await fetch(`/api/v1/db/${encodeURIComponent(col)}`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(record)
        });
        if (!res.ok) {
          await handleFailedResponse(res, col, `Add failed on ${col}`);
        }
        const saved = await res.json().catch(() => null);
        const finalId = saved?.id || id;
        if (saved && saved.data) {
          if (finalId !== id) delete map[id];
          map[finalId] = { ...saved.data, id: finalId };
          emitCollection(col);
        } else if (finalId !== id) {
          delete map[id];
          map[finalId] = sanitizeOptimisticRecord(col, { ...record, id: finalId });
          emitCollection(col);
        }
        return createDocRef(`${col}/${finalId}`);
      },
      onSnapshot: callback => {
        if (!subscribers[col]) subscribers[col] = [];
        subscribers[col].push(callback);
        setTimeout(() => callback(buildSnapshot(col)), 0);
        return () => {
          subscribers[col] = (subscribers[col] || []).filter(fn => fn !== callback);
        };
      }
    })
  };

  const userAdapter = {
    id: async () => {
      await bootstrapCloudStore();
      return currentUser?.uid || currentUser?.id || 'U01';
    },
    can: async () => {
      await bootstrapCloudStore();
      return currentUser ? Boolean(currentUser.canWrite) : true;
    },
    canEdit: async () => {
      await bootstrapCloudStore();
      return currentUser ? Boolean(currentUser.canFin) : true;
    },
    profiles: async ids => {
      const usersMap = ensureCollection('users');
      const out = {};
      (ids || []).forEach(uid => {
        const match = Object.values(usersMap).find(u => u.uid === uid || u.id === uid);
        out[uid] = { name: match?.name || uid };
      });
      return out;
    }
  };

  const assetsAdapter = {
    put: async (key, dataUrl) => {
      await createDocRef(`assets/${key}`).set({ key, src: dataUrl, updatedAt: new Date().toISOString() });
      return key;
    },
    get: async key => {
      const snap = await createDocRef(`assets/${key}`).get();
      return snap.exists ? snap.data()?.src : null;
    }
  };

  window.claude = {
    use: async serviceName => {
      const ok = await bootstrapCloudStore();
      if (!ok) return null;
      if (serviceName === 'db') return dbAdapter;
      if (serviceName === 'user') return userAdapter;
      if (serviceName === 'assets') return assetsAdapter;
      return null;
    }
  };
})();
