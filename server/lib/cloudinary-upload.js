const { v2: cloudinary } = require("cloudinary");
const { Readable } = require("node:stream");

let configured = false;

function ensureCloudinaryConfigured() {
  if (configured) return;
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();

  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error("CLOUDINARY_NOT_CONFIGURED");
    error.code = "CLOUDINARY_NOT_CONFIGURED";
    throw error;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  configured = true;
}

function normalizeFolder(value, fallback = "tsebi/products") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.replace(/^\/+/, "").replace(/\/+$/, "");
}

function uploadBuffer(buffer, options = {}) {
  ensureCloudinaryConfigured();
  const folder = normalizeFolder(options.folder, "tsebi/products");
  const publicId = String(options.publicId || "").trim() || undefined;

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        folder,
        public_id: publicId,
        overwrite: true,
        unique_filename: false
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );

    Readable.from(buffer).pipe(upload);
  });
}

module.exports = {
  uploadBuffer
};

