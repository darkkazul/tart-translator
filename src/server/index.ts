import "dotenv/config";
import { getServerConfig } from "./config";
import { createServer } from "./server";

const config = getServerConfig();
const app = createServer({
  corsOrigin: config.corsOrigin,
  staticDir: config.staticDir
});

app.listen(config.port, config.host, () => {
  console.log(`Tart Translator listening on http://${config.host}:${config.port}`);
});
