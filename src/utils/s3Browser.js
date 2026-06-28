import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov'])

function extname(str) {
  const dot = str.lastIndexOf('.')
  return dot >= 0 ? str.slice(dot).toLowerCase() : ''
}

function basename(str) {
  return str.split('/').pop()
}

// Lists video objects in S3/R2 directly from the browser.
// Requires CORS to be configured on the bucket to allow the app's origin.
// Mirrors the logic in server.js /api/s3-outputs.
export async function listS3VideoOutputs({ bucket, region, keyId, secret, cloudfrontBase, endpointUrl, jobId } = {}) {
  if (!bucket || !region || !keyId || !secret || !cloudfrontBase) return []

  const clientConfig = {
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
  }
  if (endpointUrl) {
    clientConfig.endpoint = endpointUrl
    clientConfig.forcePathStyle = true
  }
  const client = new S3Client(clientConfig)

  const now    = new Date()
  const mm     = String(now.getMonth() + 1).padStart(2, '0')
  const yy     = String(now.getFullYear()).slice(-2)
  const prefix = jobId ? `${mm}-${yy}/${jobId}/` : `${mm}-${yy}/`

  const base    = cloudfrontBase.replace(/\/$/, '')
  const results = []
  let continuationToken

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    })
    const data = await client.send(command)
    for (const obj of data.Contents ?? []) {
      if (VIDEO_EXTS.has(extname(obj.Key))) {
        results.push({
          url:          `${base}/${obj.Key}`,
          filename:     basename(obj.Key),
          lastModified: obj.LastModified?.toISOString() ?? null,
        })
      }
    }
    continuationToken = data.IsTruncated ? data.NextContinuationToken : undefined
  } while (continuationToken)

  return results.sort((a, b) => {
    const ta = a.lastModified ? new Date(a.lastModified).getTime() : 0
    const tb = b.lastModified ? new Date(b.lastModified).getTime() : 0
    return tb - ta
  })
}
