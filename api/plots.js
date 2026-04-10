import { createHmac, timingSafeEqual } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'paavani123';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD;
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function createAdminToken() {
  const issuedAt = Date.now().toString();
  const signature = createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(issuedAt)
    .digest('hex');

  return `${issuedAt}.${signature}`;
}

function isValidAdminToken(token) {
  if (typeof token !== 'string') {
    return false;
  }

  const [issuedAt, signature] = token.split('.');
  if (!issuedAt || !signature || !/^\d+$/.test(issuedAt)) {
    return false;
  }

  const age = Date.now() - Number(issuedAt);
  if (age < 0 || age > ADMIN_SESSION_TTL_MS) {
    return false;
  }

  const expectedSignature = createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(issuedAt)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

function readBearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') {
    return null;
  }

  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function normalizePlot(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    plotNumber: String(row.plot_number),
    sizeType: row.size_type,
    dimensions: row.dimensions,
    areaSqm: Number(row.area_sqm),
    status: row.status,
    facing: row.facing,
    updatedAt: row.updated_at
  };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed with ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Missing Supabase configuration' });
  }

  try {
    if (req.method === 'GET') {
      const { status, size, search } = req.query;
      const clauses = ['select=*', 'order=id.asc'];

      if (status && status !== 'all') {
        clauses.push(`status=eq.${encodeURIComponent(status)}`);
      }

      if (size && size !== 'all') {
        clauses.push(`size_type=eq.${encodeURIComponent(size)}`);
      }

      if (search) {
        clauses.push(
          `plot_number=eq.${encodeURIComponent(String(search).replace(/^plot\\s*[- ]?/i, ''))}`
        );
      }

      const rows = await supabaseRequest(`plots?${clauses.join('&')}`, {
        method: 'GET'
      });

      return res.status(200).json({
        plots: Array.isArray(rows) ? rows.map(normalizePlot) : []
      });
    }

    if (req.method === 'POST') {
      const { password } = req.body || {};

      if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(200).json({
        success: true,
        token: createAdminToken()
      });
    }

    if (req.method === 'PATCH') {
      const token = readBearerToken(req);
      if (!isValidAdminToken(token)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { plotNumber, status, sizeType, dimensions, areaSqm, facing } = req.body;

      if (!plotNumber) {
        return res.status(400).json({ error: 'Missing plotNumber' });
      }

      const update = {};
      if (status) update.status = status;
      if (sizeType) update.size_type = sizeType;
      if (dimensions) update.dimensions = dimensions;
      if (typeof areaSqm === 'number') update.area_sqm = areaSqm;
      if (facing) update.facing = facing;
      update.updated_at = new Date().toISOString();

      const rows = await supabaseRequest(
        `plots?plot_number=eq.${encodeURIComponent(String(plotNumber))}`,
        {
          method: 'PATCH',
          body: JSON.stringify(update)
        }
      );

      return res.status(200).json({
        success: true,
        plot: normalizePlot(rows?.[0]) || null
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
