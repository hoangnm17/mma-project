import { readFile } from "node:fs/promises";
const definitions = JSON.parse(await readFile(new URL("./003_mongo.schema.snapshot", import.meta.url), "utf8"));

export async function up(db) {
  const fields = definitions.MealAssistants;
  const properties = Object.fromEntries(Object.entries(fields).map(([key, spec]) => [key, {
    bsonType: spec.type === "number" ? ["int", "long", "double", "decimal"] :
      spec.required ? spec.type : [spec.type, "null"],
  }]));
  properties.status.enum = ["AVAILABLE", "SERVING"];
  const validator = { $jsonSchema: { bsonType: "object",
    required: Object.keys(fields).filter(key => fields[key].required), properties } };
  if (!(await db.listCollections({ name: "MealAssistants" }).toArray()).length)
    await db.createCollection("MealAssistants", { validator, collation: { locale: "en", strength: 2 } });
  else await db.command({ collMod: "MealAssistants", validator, validationLevel: "strict", validationAction: "error" });
  await db.collection("MealAssistants").createIndex({ id: 1 }, { unique: true, name: "identity" });
  await db.collection("MealAssistants").createIndex({ deleted: 1, status: 1, name: 1 });
  await db.collection("Orders").createIndex({ mealAssistantId: 1 }, {
    unique: true, name: "one_active_meal_assistant",
    partialFilterExpression: { mealAssistantId: { $type: "string" }, status: { $in: ["PENDING", "PREPARING"] } },
  });
}
