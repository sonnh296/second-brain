import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from '@aws-sdk/client-s3'

/**
 * One-off setup: allow browsers to PUT directly to the R2 bucket
 * (presigned upload flow). Run: npx tsx scripts/setup-r2-cors.ts
 */
const DEFAULT_ORIGINS = ['https://noteeverything.site', 'http://localhost:3000']

async function main() {
  const origins = process.env.R2_CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean)
    ?? DEFAULT_ORIGINS

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
  const bucket = process.env.R2_BUCKET_NAME!

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ['PUT'],
            AllowedHeaders: ['content-type'],
            ExposeHeaders: ['etag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  )

  const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }))
  console.log('CORS rules applied to bucket', bucket)
  console.log(JSON.stringify(current.CORSRules, null, 2))
}

main().catch((err) => {
  console.error('Failed to set CORS:', err)
  process.exit(1)
})
