import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT ?? "http://minio:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
  },
});

const BUCKET = process.env.S3_BUCKET ?? "aerispay";
const PUBLIC_URL = process.env.S3_PUBLIC_URL ?? `${process.env.S3_ENDPOINT ?? "http://minio:9000"}/${BUCKET}`;

export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${PUBLIC_URL}/${key}`;
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

export function keyFromUrl(url: string): string | null {
  if (!url.includes(BUCKET)) return null;
  const idx = url.indexOf(BUCKET + "/");
  if (idx === -1) return null;
  return url.slice(idx + BUCKET.length + 1);
}
