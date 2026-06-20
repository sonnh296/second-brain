import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
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

/** Stream a ReadableStream directly to R2 without loading into RAM */
export async function streamUpload(
  key: string,
  body: ReadableStream | Readable
): Promise<void> {
  const nodeStream =
    body instanceof Readable ? body : Readable.fromWeb(body as any)

  const upload = new Upload({
    client: getS3Client(),
    params: {
      Bucket: BUCKET(),
      Key: key,
      Body: nodeStream,
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024, // 5MB parts
  })

  await upload.done()
}

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

/** Stream an R2 object for download/preview */
export async function getObjectStream(
  key: string
): Promise<{ stream: Readable; contentType?: string }> {
  const res = await getS3Client().send(
    new GetObjectCommand({ Bucket: BUCKET(), Key: key })
  )
  return {
    stream: res.Body as Readable,
    contentType: res.ContentType,
  }
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
