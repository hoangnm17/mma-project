import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { database, closeDatabase } from "../src/db.js";
try {
  const { db } = await database();
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName)
    throw Error("MongoDB phải chạy replica set để hỗ trợ transaction.");
  const migrations = db.collection("SchemaMigrations");
  for (const file of (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((f) => f.endsWith("_mongo.js"))
    .sort()) {
    const url = new URL("../migrations/" + file, import.meta.url);
    const source = await readFile(url, "utf8");
    // Fingerprint the immutable schema for this version, not today's runtime schema.
    // 001's snapshot is byte-for-byte the original schema to retain deployed hashes.
    const schema = await readFile(
      new URL("../migrations/" + file.replace(".js", ".schema.snapshot"), import.meta.url),
      "utf8",
    );
    const hash = createHash("sha256")
      .update(source)
      .update(schema)
      .digest("hex");
    const old = await migrations.findOne({ _id: file });
    if (old) {
      if (old.hash !== hash) throw Error("Migration đã đổi: " + file);
      continue;
    }
    await (await import(url.href)).up(db);
    await migrations.insertOne({ _id: file, hash, appliedAt: new Date() });
    console.log("Applied", file);
  }
} finally {
  await closeDatabase();
}
