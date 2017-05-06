const gulp = require('gulp');
const zip = require('gulp-zip');
const del = require('del');
const shell = require('gulp-shell');
const tap = require('gulp-tap');

gulp.task('build:prepare', ['clean:fast'], () =>
  // copy only what we need for deployment
  gulp.src([
    '**/*',
    '!node_modules/**',
    '!build',
    '!build/**',
    '!gulpfile.js',
    '!run.js'
  ])
  .pipe(gulp.dest('build/dist/'))
);

// will no install any devDependencies
gulp.task('build:install', ['build:prepare'], shell.task('npm install --production', {cwd: './build/dist'}));

gulp.task('zip', ['build:install'], () => {
  const buildArtifact = ['build/dist/**'];
  const pjson = require('./package.json');
  const zipFile = pjson.name + '.zip';
  return gulp.src(buildArtifact, {base: './build/dist'})
        .pipe(tap(file => {
          if (file.isDirectory()) {
            file.stat.mode = parseInt('40777', 8);
          }
        }))
        .pipe(zip(zipFile))
        .pipe(gulp.dest('build'));
});

gulp.task('clean:fast', () => {
  // delete everything except the already downloaded npm modules, to make the build faster
  return del(['build/**', '!build', 'build/dist/**', '!build/dist', '!build/dist/node_modules', '!build/dist/node_modules/**']);
});

gulp.task('clean', () => {
  return del(['build/']);
});

gulp.task('dist', ['zip']);
gulp.task('default', ['dist']);
