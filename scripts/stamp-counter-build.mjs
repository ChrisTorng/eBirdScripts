import { writeFileSync } from "node:fs";

const builtAt = new Date().toISOString();
writeFileSync(
  new URL("../counter/build-info.mjs", import.meta.url),
  `// Generated when the counter is published.\nexport const BUILD_TIME = ${JSON.stringify(builtAt)};\n`,
);
