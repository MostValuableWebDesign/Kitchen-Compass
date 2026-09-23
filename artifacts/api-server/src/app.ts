import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { scanAccess, scanLimits } from "./middleware/scanSecurity";

const app: Express = express();

function normalizeProxyAddress(address: string) {
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

function isTrustedProxy(address: string) {
  const configured = (process.env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((value) => normalizeProxyAddress(value.trim()))
    .filter(Boolean);
  if (!configured.length) return false;
  const normalized = normalizeProxyAddress(address);
  return configured.includes(address) || configured.includes(normalized);
}

// Only explicitly configured proxy addresses may influence req.ip. With no
// allowlist, Express uses the socket address and ignores client X-Forwarded-For.
app.set("trust proxy", isTrustedProxy);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use("/api/scan/analyze", scanAccess);
app.use("/api/recipes/discover", scanAccess);
app.use("/api/recipes/external", scanAccess);
app.use("/api/recipes/images", scanAccess);
app.use(express.json({ limit: `${scanLimits.maxBodyBytes}b` }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if ((error as { type?: string }).type === "entity.too.large") {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "The scan request is too large.",
        requestId: String(req.id ?? "unknown"),
        retryable: false,
      },
    });
    return;
  }
  if ((req.path.startsWith("/api/scan") || req.path.startsWith("/api/recipes")) && error instanceof SyntaxError) {
    res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "The request body is not valid JSON.",
        requestId: String(req.id ?? "unknown"),
        retryable: false,
      },
    });
    return;
  }
  if (req.path.startsWith("/api/scan") || req.path.startsWith("/api/recipes")) {
    res.status(500).json({
      error: {
        code: "SCAN_UNAVAILABLE",
        message: "The scan request could not be completed.",
        requestId: String(req.id ?? "unknown"),
        retryable: false,
      },
    });
    return;
  }
  next(error);
});

export default app;
