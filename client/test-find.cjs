const { JSDOM } = require("jsdom");
const { getByRole } = require("@testing-library/dom");
const dom = new JSDOM(`<dialog open></dialog>`);
try {
  console.log(getByRole(dom.window.document.body, "dialog"));
} catch (e) {
  console.error("error:", e.message);
}
