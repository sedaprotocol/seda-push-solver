import { Elysia } from "elysia";
import { HTTP_SERVER_PORT } from "./constants";
import logger from "./logger";

// The application will crash during startup if it cannot connect to the contract
// Therefore we can safely return "ok" for health checks since an unhealthy
// application would not be running
const app = new Elysia().get("/healthz", "ok").get("/readyz", "ok");

export function startHttpServer() {
	app.listen(HTTP_SERVER_PORT);
	logger.info(
		`HTTP health server is running at http://localhost:${HTTP_SERVER_PORT}`,
	);
}
