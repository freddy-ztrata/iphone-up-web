const express = require("express");
const audit = require("../../lib/audit");

const router = express.Router();

router.get("/", (req, res) => {
  const list = audit.list({
    user_id: req.query.user_id ? Number(req.query.user_id) : null,
    entity_type: req.query.entity_type || null,
    entity_id: req.query.entity_id || null,
    limit: req.query.limit || 200,
  });
  res.json({ entries: list });
});

module.exports = router;
