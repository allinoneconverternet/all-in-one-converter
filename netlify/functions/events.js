exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const body = JSON.parse(event.body || "{}");
    if (process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID) {
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({});
      const key = `${process.env.S3_PREFIX || "events"}/${new Date().toISOString().slice(0,10)}.jsonl`;
      const line = JSON.stringify(body) + "\n";
      await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: line, ContentType: "application/x-ndjson" }));
    } else {
      console.log("[event]", body.name, body.payload);
    }
    return { statusCode: 204, body: "" };
  } catch (e) {
    console.error(e);
    return { statusCode: 400, body: "bad request" };
  }
};
