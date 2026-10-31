import { MongoClient } from "mongodb";
const uri = process.env.MONGO_ADMIN_URI;
const database = process.env.MONGO_DATABASE || "StayFlow";
const username = process.env.MONGO_APP_USER || "stayflow_app",
  password = process.env.MONGO_APP_PASSWORD;
if (!uri || !password || password.length < 16)
  throw Error("Cần MONGO_ADMIN_URI và MONGO_APP_PASSWORD >=16 ký tự.");
const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(database);
  const exists = await db.command({ usersInfo: username });
  if (!exists.users.length)
    await db.command({
      createUser: username,
      pwd: password,
      roles: [{ role: "readWrite", db: database }],
    });
  console.log("Mongo runtime user ready; existing passwords are not changed.");
} finally {
  await client.close();
}
