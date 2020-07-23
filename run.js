const app = require("./index.js");

const context = process.argv[2] || "";
console.log(context);
app.handler("bla", context, function (err, success) {
  if (success) {
    console.log(success);
  }
  if (err) {
    console.log(err);
  }
});
