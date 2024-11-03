import gulp from 'gulp';
import { deleteAsync } from 'del';
import zip from 'gulp-zip';
import shell from 'shelljs';
import tap from 'gulp-tap';
import { readFileSync } from 'fs';

const pjson = JSON.parse(readFileSync('./package.json', 'utf8'));

async function clean(cb: gulp.TaskFunctionCallback) {
  await deleteAsync(['build/**', '!build', 'build/dist/**', '!build/dist']);
  cb();
}

function copy() {
  return gulp.src([
    '**/*',
    '**/.*',
    '!node_modules/**',
    '!build',
    '!build/**',
    '!gulpfile.ts',
    '!src/**/*.ts',
    '!dist',
    '!dist/**'
  ]).pipe(gulp.dest('build/dist/'));
}

function npmInstall(cb: gulp.TaskFunctionCallback) {
  shell.cd('./build/dist');
  // production to prevent installing dev dependencies
  shell.exec('npm install --omit=dev');
  shell.cd('../..');
  cb();
}

function zipit() {
  return gulp.src(['build/dist/**', 'build/dist/.*'])
    .pipe(tap((file) => {
      if (file.stat) {
        file.stat.mode = parseInt('40777', 8);
      }
      return file;
    }))
    .pipe(zip(`${pjson.name}.zip`))
    .pipe(gulp.dest('build'));
}

export const build = gulp.series(clean, copy, npmInstall, zipit);
