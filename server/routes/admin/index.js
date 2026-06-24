// Router admin — monta todos los subrouters bajo /api/admin.
// Las rutas de /auth son públicas; el resto requieren sesión válida.

const express = require("express");
const { requireAuth } = require("../../middleware/auth");

const authRouter = require("./auth");
const productsRouter = require("./products");
const couponsRouter = require("./coupons");
const ordersRouter = require("./orders");
const usersRouter = require("./users");
const auditRouter = require("./audit");
const uploadsRouter = require("./uploads");
const dashboardRouter = require("./dashboard");

const router = express.Router();

router.use("/auth", authRouter);

// Todo lo demás requiere sesión
router.use(requireAuth);

router.use("/products", productsRouter);
router.use("/coupons", couponsRouter);
router.use("/orders", ordersRouter);
router.use("/users", usersRouter);
router.use("/audit-log", auditRouter);
router.use("/uploads", uploadsRouter);
router.use("/dashboard", dashboardRouter);

module.exports = router;
