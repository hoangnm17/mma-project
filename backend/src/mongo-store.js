import { definitions } from "./mongo-schema.js";
const options = (ctx) => (ctx.session ? { session: ctx.session } : {});
const clean = (doc) => {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  void _id;
  return rest;
};
function normalize(name, data, defaults = false) {
  const fields = definitions[name];
  if (!fields) throw Error("Unknown collection: " + name);
  const doc = {};
  for (const [key, spec] of Object.entries(fields)) {
    let value = data[key];
    if (value === undefined && defaults && "default" in spec)
      value = spec.default === "$now" ? new Date() : spec.default;
    if (value === undefined) {
      if (defaults && spec.required)
        throw Object.assign(Error("Thiếu trường " + name + "." + key), {
          status: 400,
        });
      continue;
    }
    if (value !== null) {
      if (spec.type === "date") value = new Date(value);
      if (spec.type === "bool") value = Boolean(value);
      if (spec.type === "number" && !Number.isSafeInteger(value))
        throw Object.assign(Error("Giá trị số không hợp lệ"), { status: 400 });
    }
    doc[key] = value;
  }
  return doc;
}
async function references(ctx, name, data) {
  for (const [key, spec] of Object.entries(definitions[name])) {
    if (data[key] == null || !spec.ref) continue;
    const [target, field] = spec.ref;
    if (
      !(await ctx.db
        .collection(target)
        .findOne(
          { [field]: data[key] },
          { ...options(ctx), projection: { _id: 1 } },
        ))
    ) {
      throw Object.assign(
        Error("Liên kết " + name + "." + key + " không hợp lệ"),
        { status: 409 },
      );
    }
  }
}
export async function execute(ctx, op) {
  const col = ctx.db.collection(op.collection),
    opts = options(ctx),
    filter = op.filter || {};
  if (op.insert) {
    const doc = normalize(op.collection, op.insert, true);
    await references(ctx, op.collection, doc);
    await col.insertOne(doc, opts);
    return [];
  }
  if (op.update) {
    const update = { ...op.update };
    if (update.$set) {
      update.$set = normalize(op.collection, update.$set);
      await references(ctx, op.collection, update.$set);
    }
    await col.updateMany(filter, update, opts);
    return [];
  }
  if (op.delete) {
    await col.deleteMany(filter, opts);
    return [];
  }
  if (op.count)
    return [{ [op.as || "count"]: await col.countDocuments(filter, opts) }];
  if (op.sum) {
    const rows = await col
      .aggregate(
        [
          { $match: filter },
          { $group: { _id: null, value: { $sum: "$" + op.sum } } },
        ],
        opts,
      )
      .toArray();
    return [{ [op.as || "amount"]: rows[0]?.value || 0 }];
  }
  let cursor = col.find(filter, {
    ...opts,
    projection: { ...op.project, _id: 0 },
  });
  if (op.sort)
    cursor = cursor.sort({ ...op.sort, ...(op.sort.id ? {} : { _id: 1 }) });
  if (op.skip) cursor = cursor.skip(op.skip);
  if (op.limit) cursor = cursor.limit(op.limit);
  return (await cursor.toArray()).map(clean);
}
export const find = (ctx, collection, filter = {}, extra = {}) =>
  execute(ctx, { collection, filter, ...extra });
export const first = async (...args) => (await find(...args))[0];
export const insert = (ctx, collection, data) =>
  execute(ctx, { collection, insert: data });
export const update = (ctx, collection, filter, update) =>
  execute(ctx, { collection, filter, update });
export const sum = async (ctx, collection, filter = {}, field = "amount") =>
  (await execute(ctx, { collection, filter, sum: field }))[0].amount;
export const count = async (ctx, collection, filter = {}) =>
  (await execute(ctx, { collection, filter, count: true }))[0].count;
export const aggregate = (ctx, collection, pipeline) =>
  ctx.db.collection(collection).aggregate(pipeline, options(ctx)).toArray();
