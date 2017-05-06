const gulp = require('gulp');
const zip = require('gulp-zip');

gulp.task('default', ['zip']);

gulp.task('zip', () =>
    gulp.src(['*/*', '!./dist'])
        .pipe(zip('archive.zip'))
        .pipe(gulp.dest('dist'))
);
