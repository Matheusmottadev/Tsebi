const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { randomUUID } = require("crypto");

let configured = false;
let s3Client = null;

function ensureR2Configured() {
  if (configured && s3Client) return;

  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = String(process.env.R2_BUCKET_NAME || "").trim();
  const publicUrl = String(process.env.R2_PUBLIC_URL || "").trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    const error = new Error("R2_NOT_CONFIGURED");
    error.code = "R2_NOT_CONFIGURED";
    throw error;
  }

  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  configured = true;
}

function normalizeFolder(value, fallback = "tsebi/products") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.replace(/^\/+/, "").replace(/\/+$/, "");
}

function getContentType(buffer) {
  // Detecta o tipo de imagem pelo magic number
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

async function uploadBuffer(buffer, options = {}) {
  ensureR2Configured();

  const folder = normalizeFolder(options.folder, "tsebi/products");
  const publicId = String(options.publicId || "").trim() || `img_${randomUUID()}`;
  const bucketName = String(process.env.R2_BUCKET_NAME || "").trim();
  const publicUrl = String(process.env.R2_PUBLIC_URL || "").trim();

  // Remove barras do início/fim do publicId e folder
  const cleanPublicId = publicId.replace(/^\/+/, "").replace(/\/+$/, "");
  const cleanFolder = folder.replace(/^\/+/, "").replace(/\/+$/, "");
  const key = cleanFolder ? `${cleanFolder}/${cleanPublicId}` : cleanPublicId;

  const contentType = getContentType(buffer);

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable"
    });

    await s3Client.send(command);

    // Constrói a URL pública
    const baseUrl = publicUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/${key}`;

    return {
      url,
      secure_url: url,
      public_id: key,
      bytes: buffer.length,
      format: contentType.split("/")[1] || "unknown",
      width: null, // R2 não extrai metadados de imagem automaticamente
      height: null
    };
  } catch (error) {
    const r2Error = new Error(`R2_UPLOAD_FAILED: ${error.message}`);
    r2Error.code = "R2_UPLOAD_FAILED";
    r2Error.originalError = error;
    throw r2Error;
  }
}

module.exports = {
  uploadBuffer
};
