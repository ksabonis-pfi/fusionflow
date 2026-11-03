import { Hono } from "hono";
import roiScenarios from "./roiScenarios";
import type { AuthContext, Bindings, Variables } from "../types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function canAccess(auth: AuthContext) {
  return auth.role === "admin" || auth.user.is_sales_tools === 1;
}

app.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (!canAccess(auth)) return c.json({ error: "Forbidden" }, 403);
  await next();
});

// Everything below inherits the gate above.
app.route("/roi/scenarios", roiScenarios);

export default app;
