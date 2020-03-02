const app = require("./index.js");

app.handler("bla", "bla", function(err, success) {
  if (success) {
    console.log(success);
  }
  if (err) {
    console.log(err);
  }
});
