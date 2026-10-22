// Copy this folder to apps/<your-app>/, set "id" in app.json to the folder name, and return your app's items here.
// See core/item.mjs for the fields. Read them from the app's own data (src is its repository) so they never drift.
export async function items({ config, src }) {
  return [
    { id: "example", title: "Example item", summary: "One sentence with the key facts.", url: config.site + "example",
      country: null, language: "en", facts: ["A fact"], questions: [], sources: [], tags: [] },
  ];
}
