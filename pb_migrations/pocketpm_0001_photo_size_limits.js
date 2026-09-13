// compat: additive
//
// Raises the per-file size limit on the four photo-heavy fields from 10 MB to
// 25 MB. A 48-megapixel phone photo is commonly 10-15 MB, so 10 MB refused
// ordinary site photos: loudly, with the file named, but refused.
//
// Additive: code still checking the old 10 MB limit is stricter, never wrong.
// Idempotent: setting a limit to the value it already has changes nothing,
// which is what lets schema:plan run every migration against the snapshot.
const FIELDS = {
  daily_logs: "attachments",
  punch_list: "photos",
  deficiencies: "photos",
  safety_observations: "photos",
};

migrate(
  (app) => {
    for (const [name, field] of Object.entries(FIELDS)) {
      const collection = app.findCollectionByNameOrId(name);
      collection.fields.getByName(field).maxSize = 25 * 1024 * 1024;
      app.save(collection);
    }
  },
  (app) => {
    for (const [name, field] of Object.entries(FIELDS)) {
      const collection = app.findCollectionByNameOrId(name);
      collection.fields.getByName(field).maxSize = 10 * 1024 * 1024;
      app.save(collection);
    }
  },
);
