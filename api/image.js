const BUCKET_NAME = process.env.KITCHENMENU_SUPABASE_BUCKET || "kitchenmenu-images";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function respond(res, status, payload) {
  res.status(status).setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function supabaseBaseUrl() {
  return (process.env.SUPABASE_URL || "").replace(/\/$/, "");
}

function supabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function storageHeaders(contentType = "") {
  const key = supabaseKey();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

async function ensureBucket(baseUrl) {
  const response = await fetch(`${baseUrl}/storage/v1/bucket/${BUCKET_NAME}`, {
    headers: storageHeaders(),
  });
  if (response.ok) return { ok: true };
  const lookupError = await response.text();
  if (response.status !== 404 && !/bucket not found|\"statusCode\"\s*:\s*\"?404/i.test(lookupError)) {
    return { ok: false, error: lookupError };
  }
  const createResponse = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: storageHeaders("application/json"),
    body: JSON.stringify({
      id: BUCKET_NAME,
      name: BUCKET_NAME,
      public: true,
      file_size_limit: MAX_IMAGE_BYTES,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    }),
  });
  return {
    ok: createResponse.ok || createResponse.status === 409,
    error: createResponse.ok ? "" : await createResponse.text(),
  };
}

function parseImage(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl || "");
  if (!match) return null;
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[match[1].toLowerCase()];
  return {
    contentType: match[1].toLowerCase(),
    extension,
    buffer,
  };
}

function safeRecipeId(value) {
  return String(value || "recipe")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { ok: false, error: "Method not allowed." });
  }

  const baseUrl = supabaseBaseUrl();
  const key = supabaseKey();
  if (!baseUrl || !key) {
    return respond(res, 503, { ok: false, error: "Supabase is not configured." });
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return respond(res, 400, { ok: false, error: "Invalid JSON body." });
    }
  }

  const image = parseImage(payload?.dataUrl);
  if (!image) {
    return respond(res, 400, { ok: false, error: "请选择 JPG、PNG 或 WebP 图片。" });
  }
  if (!image.buffer.length || image.buffer.length > MAX_IMAGE_BYTES) {
    return respond(res, 413, { ok: false, error: "图片过大，请重新裁剪后上传。" });
  }

  const bucket = await ensureBucket(baseUrl);
  if (!bucket.ok) {
    return respond(res, 502, { ok: false, error: `无法准备图片空间：${bucket.error}` });
  }

  const filename = `${safeRecipeId(payload?.recipeId)}-${Date.now()}.${image.extension}`;
  const uploadResponse = await fetch(`${baseUrl}/storage/v1/object/${BUCKET_NAME}/${filename}`, {
    method: "POST",
    headers: {
      ...storageHeaders(image.contentType),
      "x-upsert": "true",
    },
    body: image.buffer,
  });
  if (!uploadResponse.ok) {
    return respond(res, uploadResponse.status, {
      ok: false,
      error: `图片上传失败：${await uploadResponse.text()}`,
    });
  }

  return respond(res, 200, {
    ok: true,
    url: `${baseUrl}/storage/v1/object/public/${BUCKET_NAME}/${filename}`,
  });
};
