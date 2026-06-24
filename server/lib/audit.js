// Audit log: graba toda mutación administrativa con snapshot before/after.
//
// Uso típico desde un router admin:
//   const before = findProduct(id);
//   updateProduct(id, patch);
//   const after = findProduct(id);
//   audit.log(req, { action: 'update', entity_type: 'product', entity_id: id, before, after });

const db = require("../db");

const INSERT = db.prepare(`
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, before_json, after_json, ip, user_agent)
  VALUES (@user_id, @action, @entity_type, @entity_id, @before_json, @after_json, @ip, @user_agent)
`);

const SELECT_RECENT = db.prepare(`
  SELECT al.*, u.email AS user_email, u.name AS user_name
  FROM audit_log al
  LEFT JOIN users u ON u.id = al.user_id
  WHERE
    (@user_id IS NULL OR al.user_id = @user_id) AND
    (@entity_type IS NULL OR al.entity_type = @entity_type) AND
    (@entity_id IS NULL OR al.entity_id = @entity_id)
  ORDER BY al.created_at DESC
  LIMIT @limit
`);

function log(req, { action, entity_type, entity_id, before, after }) {
  try {
    INSERT.run({
      user_id: req.user ? req.user.id : null,
      action,
      entity_type,
      entity_id: entity_id == null ? null : String(entity_id),
      before_json: before == null ? null : JSON.stringify(before),
      after_json: after == null ? null : JSON.stringify(after),
      ip: req.ip || req.connection?.remoteAddress || null,
      user_agent: req.get?.("user-agent") || null,
    });
  } catch (err) {
    // Nunca interrumpas la operación por una falla en audit; solo loguea.
    console.error("[audit] insert failed:", err.message);
  }
}

function list({ user_id, entity_type, entity_id, limit = 200 } = {}) {
  return SELECT_RECENT.all({
    user_id: user_id ?? null,
    entity_type: entity_type ?? null,
    entity_id: entity_id == null ? null : String(entity_id),
    limit: Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000),
  }).map(r => ({
    ...r,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
  }));
}

module.exports = { log, list };
