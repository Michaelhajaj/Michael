// בונה את src/schema-wire.js: הסכמה בדיוק כפי שה-SDK שולח אותה, כדי שהגרסה הקלה תשלח בקשה זהה
import { writeFileSync } from "node:fs";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { PLAN_SCHEMA } from "./src/prompt.js";
const wire = JSON.parse(JSON.stringify(betaJSONSchemaOutputFormat(PLAN_SCHEMA)));
delete wire.parse;
writeFileSync(new URL("./src/schema-wire.js", import.meta.url),
  "// נוצר אוטומטית ע״י build-lite.mjs – לא לערוך ידנית\nexport const WIRE_FORMAT = " + JSON.stringify(wire, null, 1) + ";\n");
console.log("keys:", Object.keys(wire).join(","));
