import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = await buildApp({ dataDir: config.dataDir, webDir: "dist" });
await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`Atlas → http://localhost:${config.port}`);
