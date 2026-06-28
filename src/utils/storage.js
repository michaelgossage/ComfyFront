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

const VIDEO_KEYS = {
  ENDPOINT_ID: 'comfyfront_video_endpoint_id',
}

export function saveVideoSettings({ endpointId }) {
  localStorage.setItem(VIDEO_KEYS.ENDPOINT_ID, endpointId)
}

export function loadVideoSettings() {
  return {
    endpointId: localStorage.getItem(VIDEO_KEYS.ENDPOINT_ID) || '',
  }
}

const S3_KEYS = {
  CF_BASE_URL:   'comfyfront_cf_base_url',
  BUCKET:        'comfyfront_s3_bucket',
  REGION:        'comfyfront_aws_region',
  KEY_ID:        'comfyfront_aws_key_id',
  SECRET:        'comfyfront_aws_secret',
  ENDPOINT_URL:  'comfyfront_s3_endpoint_url',
}

export function saveS3Settings({ cfBaseUrl, bucket, region, keyId, secret, endpointUrl }) {
  localStorage.setItem(S3_KEYS.CF_BASE_URL,  cfBaseUrl)
  localStorage.setItem(S3_KEYS.BUCKET,       bucket)
  localStorage.setItem(S3_KEYS.REGION,       region)
  localStorage.setItem(S3_KEYS.KEY_ID,       keyId)
  localStorage.setItem(S3_KEYS.SECRET,       secret)
  localStorage.setItem(S3_KEYS.ENDPOINT_URL, endpointUrl)
}

export function loadS3Settings() {
  return {
    cfBaseUrl:   localStorage.getItem(S3_KEYS.CF_BASE_URL)  || '',
    bucket:      localStorage.getItem(S3_KEYS.BUCKET)       || '',
    region:      localStorage.getItem(S3_KEYS.REGION)       || '',
    keyId:       localStorage.getItem(S3_KEYS.KEY_ID)       || '',
    secret:      localStorage.getItem(S3_KEYS.SECRET)       || '',
    endpointUrl: localStorage.getItem(S3_KEYS.ENDPOINT_URL) || '',
  }
}
