import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    { path: "/api/packages/*", method: "GET" },
    { path: "/api/scans", method: "POST" },
  ],
});
