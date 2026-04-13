import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, method: req.method, url: req.url }, "Unhandled error");
  const status = (err as any).status || (err as any).statusCode || 500;
  const message = process.env.NODE_ENV === "production" ? "Internal server error" : err.message;
  res.status(status).json({ error: message });
});

export default app;
