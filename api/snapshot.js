const TABLE_NAME = process.env.KITCHENMENU_SUPABASE_TABLE || "kitchenmenu_snapshots";
const ROW_ID = process.env.KITCHENMENU_SNAPSHOT_ROW_ID || "main";

function respond(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function supabaseError(result, fallback) {
  const body = result?.body || {};
  if (typeof body === "string") return body;
  return body.message || body.error || body.details || body.hint || fallback;
}

function supabaseBaseUrl() {
  return (process.env.SUPABASE_URL || "").replace(/\/$/, "");
}

function supabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

async function supabaseRequest(path, init = {}) {
  const baseUrl = supabaseBaseUrl();
  const key = supabaseKey();
  if (!baseUrl || !key) {
    return {
      ok: false,
      status: 503,
      body: {
        error: "Supabase is not configured.",
      },
    };
  }

  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function readSnapshot() {
  return supabaseRequest(
    `${TABLE_NAME}?id=eq.${encodeURIComponent(ROW_ID)}&select=payload,updated_at&limit=1`,
    { method: "GET" },
  );
}

async function writeSnapshot(snapshot) {
  return supabaseRequest(`${TABLE_NAME}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([
      {
        id: ROW_ID,
        payload: snapshot,
        updated_at: new Date().toISOString(),
      },
    ]),
  });
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const result = await readSnapshot();
    if (!result.ok) {
      return respond(res, result.status, {
        ok: false,
        error: supabaseError(result, "Unable to load cloud snapshot."),
        message: result.body?.message || null,
        details: result.body?.details || null,
        hint: result.body?.hint || null,
      });
    }

    const row = Array.isArray(result.body) ? result.body[0] : null;
    return respond(res, 200, {
      ok: true,
      snapshot: row?.payload || null,
      updatedAt: row?.updated_at || null,
    });
  }

  if (req.method === "PUT" || req.method === "POST") {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const snapshot = payload?.snapshot;
    if (!snapshot || typeof snapshot !== "object") {
      return respond(res, 400, {
        ok: false,
        error: "Request body must include a snapshot object.",
      });
    }

    const result = await writeSnapshot(snapshot);
    if (!result.ok) {
      return respond(res, result.status, {
        ok: false,
        error: supabaseError(result, "Unable to save cloud snapshot."),
        message: result.body?.message || null,
        details: result.body?.details || null,
        hint: result.body?.hint || null,
      });
    }

    const row = Array.isArray(result.body) ? result.body[0] : null;
    return respond(res, 200, {
      ok: true,
      snapshot: row?.payload || snapshot,
      updatedAt: row?.updated_at || new Date().toISOString(),
    });
  }

  res.setHeader("Allow", "GET, PUT, POST");
  return respond(res, 405, {
    ok: false,
    error: "Method not allowed.",
  });
};
