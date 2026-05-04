const KEYS = {
  API_KEY: 'comfyfront_api_key',
  ENDPOINT_ID: 'comfyfront_endpoint_id',
}

export function saveSettings({ apiKey, endpointId }) {
  localStorage.setItem(KEYS.API_KEY, apiKey)
  localStorage.setItem(KEYS.ENDPOINT_ID, endpointId)
}

export function loadSettings() {
  return {
    apiKey: localStorage.getItem(KEYS.API_KEY) || '',
    endpointId: localStorage.getItem(KEYS.ENDPOINT_ID) || '',
  }
}

export function clearSettings() {
  localStorage.removeItem(KEYS.API_KEY)
  localStorage.removeItem(KEYS.ENDPOINT_ID)
}

const LOCAL_KEYS = {
  HOST: 'comfyfront_local_host',
  PORT: 'comfyfront_local_port',
}

export function saveLocalSettings({ host, port }) {
  localStorage.setItem(LOCAL_KEYS.HOST, host)
  localStorage.setItem(LOCAL_KEYS.PORT, port)
}

export function loadLocalSettings() {
  return {
    host: localStorage.getItem(LOCAL_KEYS.HOST) || '127.0.0.1',
    port: localStorage.getItem(LOCAL_KEYS.PORT) || '8188',
  }
}
