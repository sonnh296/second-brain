import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'
import { Readable } from 'stream'
import * as fs from 'fs'

let _s3: S3Client | null = null

function getS3Client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _s3
}

const BUCKET = () => process.env.R2_BUCKET_NAME!

/** Download an R2 object to a local file path */
export async function downloadToFile(
  key: string,
  destPath: string
): Promise<void> {
  const res = await getS3Client().send(
    new GetObjectCommand({ Bucket: BUCKET(), Key: key })
  )
  const body = res.Body as Readable
  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(destPath)
    body.pipe(writer)
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

/** Stream an R2 object for download/preview. Optional byte range for media seeking. */
export async function getObjectStream(
  key: string,
  options?: { range?: string }
): Promise<{
  stream: Readable
  contentType?: string
  contentLength?: number
  contentRange?: string
  acceptRanges?: string
}> {
  const res = await getS3Client().send(
    new GetObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ...(options?.range ? { Range: options.range } : {}),
    })
  )
  return {
    stream: res.Body as Readable,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
    acceptRanges: res.AcceptRanges,
  }
}

/** Upload a Buffer / Uint8Array to R2 */
export async function uploadBuffer(
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string
): Promise<void> {
  const upload = new Upload({
    client: getS3Client(),
    params: {
      Bucket: BUCKET(),
      Key: key,
      Body: body,
      ...(contentType ? { ContentType: contentType } : {}),
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  })

  await upload.done()
}

/** Read an R2 object fully into a Buffer */
export async function getObjectBuffer(key: string): Promise<{
  buffer: Buffer
  contentType?: string
}> {
  const { stream, contentType } = await getObjectStream(key)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return { buffer: Buffer.concat(chunks), contentType }
}

/** Build R2 key for a chat message attachment */
export function chatAttachmentKey(
  userId: string,
  sessionId: string,
  attachmentId: string,
  ext: string
): string {
  return `chat/${userId}/${sessionId}/${attachmentId}.${ext}`
}

/** Server-side copy of an R2 object to a new key */
export async function copyObject(sourceKey: string, destKey: string): Promise<void> {
  await getS3Client().send(
    new CopyObjectCommand({
      Bucket: BUCKET(),
      CopySource: `${BUCKET()}/${encodeURIComponent(sourceKey)}`,
      Key: destKey,
    })
  )
}

/** Presigned PUT URL so the browser can upload directly to R2 (bypasses the server). */
export async function presignPutUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<string> {
  return getSignedUrl(
    getS3Client(),
    new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  )
}

/** Object metadata, or null if the key does not exist. */
export async function headObject(key: string): Promise<{ size: number } | null> {
  try {
    const res = await getS3Client().send(
      new HeadObjectCommand({ Bucket: BUCKET(), Key: key })
    )
    return { size: res.ContentLength ?? 0 }
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name === 'NotFound' || name === 'NoSuchKey' || name === '404') return null
    throw err
  }
}

/** First bytes of an object (for magic-byte validation after direct upload). */
export async function getObjectHeaderBytes(key: string, length = 512): Promise<Buffer> {
  const res = await getS3Client().send(
    new GetObjectCommand({ Bucket: BUCKET(), Key: key, Range: `bytes=0-${length - 1}` })
  )
  const chunks: Buffer[] = []
  for await (const chunk of res.Body as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function deleteObject(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: BUCKET(), Key: key })
  )
}

/** List object keys in the bucket (paginated). */
export async function listObjectKeys(prefix?: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const res = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: BUCKET(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )

    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}
