import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { scanAccess, scanLimits } from "./middleware/scanSecurity";

const app: Express = express();

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
app.use("/api/scan", scanAccess);
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
  if (req.path.startsWith("/api/scan") && error instanceof SyntaxError) {
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
  if (req.path.startsWith("/api/scan")) {
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
