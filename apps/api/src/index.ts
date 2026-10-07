// Must stay first: loads .env before anything reads process.env (logger reads LOG_LEVEL at import).
import "./env";
import { createApp } from "./app";
import { logger } from "./logger";

const port = Number(process.env.PORT ?? 4000);

createApp().listen(port, () => {
  logger.info(`api listening on http://localhost:${port}`);
});
