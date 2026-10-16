const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const bucket = process.env.MINIO_BUCKET;
console.log("endpoint:", process.env.MINIO_ENDPOINT);
console.log("region:", process.env.MINIO_REGION);
console.log("bucket:", bucket);
console.log("access key set:", !!process.env.MINIO_ACCESS_KEY, "| secret set:", !!process.env.MINIO_SECRET_KEY);

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  region: process.env.MINIO_REGION || "us-east-1",
  credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY, secretAccessKey: process.env.MINIO_SECRET_KEY },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED"
});

(async () => {
  const key = "files/teamc-test/hello.txt";
  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from("hello b2") }));
    console.log("PUT ok");
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    console.log("GET ok:", await r.Body.transformToString());
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log("DELETE ok");
  } catch (e) {
    console.log("FAILED:", e.name, "-", e.message);
  }
})();