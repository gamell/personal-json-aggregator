const gulp = require("gulp");
const { src, dest } = require("gulp");
const zip = require("gulp-zip");
const del = require("del");
const shell = require("shelljs");
const tap = require("gulp-tap");
const pjson = require("./package.json");

function clean(cb) {
  del(["build/**", "!build", "build/dist/**", "!build/dist"]);
  return cb();
}

function copy() {
  return src([
    "**/*",
    "**/.*",
    "!node_modules/**",
    "!build",
    "!build/**",
    "!gulpfile.js",
    "!run.js",
  ]).pipe(dest("build/dist/"));
}

function npmInstall(cb) {
  shell.cd("./build/dist");
  // production to prevent installing dev dependencies
  shell.exec("npm install --production");
  shell.cd("../..");
  cb();
}

function zipit(cb) {
  return src(["build/dist/**", "build/dist/.*"])
    .pipe(
      tap((file) => {
        file.stat.mode = parseInt("40777", 8);
        return file;
      })
    )
    .pipe(zip(`${pjson.name}.zip`))
    .pipe(dest("build"));
}

exports.build = gulp.series(clean, copy, npmInstall, zipit);
