import logger from './logger'

const DB_NAME = 'comfyfront'
const DB_VERSION = 1
const STORE_NAME = 'images'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      store.createIndex('by_timestamp', 'timestamp', { unique: false })
      store.createIndex('by_project',   'project',   { unique: false })
      store.createIndex('by_rating',    'rating',    { unique: false })
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror   = (e) => {
      logger.error('imageStore', 'Failed to open IndexedDB', e.target.error)
      reject(e.target.error)
    }
  })
  return dbPromise
}

export async function saveImage(record) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).put(record)
      req.onsuccess = () => {
        logger.info('imageStore', 'Image saved', { id: record.id, project: record.project })
        resolve(record.id)
      }
      req.onerror = (e) => {
        logger.error('imageStore', 'Failed to save image', e.target.error)
        reject(e.target.error)
      }
    })
  } catch (err) {
    logger.error('imageStore', 'saveImage failed', err)
    throw err
  }
}

export async function getAllImages() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).index('by_timestamp').getAll()
      req.onsuccess = () => resolve((req.result ?? []).reverse())
      req.onerror   = (e) => {
        logger.error('imageStore', 'Failed to load images', e.target.error)
        reject(e.target.error)
      }
    })
  } catch (err) {
    logger.error('imageStore', 'getAllImages failed', err)
    return []
  }
}

export async function updateRating(id, rating) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const record = getReq.result
        if (!record) { resolve(); return }
        const putReq = store.put({ ...record, rating })
        putReq.onsuccess = () => {
          logger.debug('imageStore', 'Rating updated', { id, rating })
          resolve()
        }
        putReq.onerror = (e) => reject(e.target.error)
      }
      getReq.onerror = (e) => reject(e.target.error)
    })
  } catch (err) {
    logger.error('imageStore', 'updateRating failed', err)
    throw err
  }
}

export async function deleteImage(id) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).delete(id)
      req.onsuccess = () => {
        logger.info('imageStore', 'Image deleted', { id })
        resolve()
      }
      req.onerror = (e) => {
        logger.error('imageStore', 'Failed to delete image', e.target.error)
        reject(e.target.error)
      }
    })
  } catch (err) {
    logger.error('imageStore', 'deleteImage failed', err)
    throw err
  }
}
