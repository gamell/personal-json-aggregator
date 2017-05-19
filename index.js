const axios = require('axios');
const ghPinnedRepos = require('./gh-pinned-repos.js');
const rssParser = require('rss-parser');
const striptags = require('striptags');
const truncate = require('truncate-html');
const gzip = require('gzip-js');
const pako = require('pako');
const _ = require('lodash');

// AWS stuff

const aws = require('aws-sdk');
const s3 = new aws.S3();

// environment

const env = process.env.ENVIRONMENT || 'local';

const jsonUrl = 'https://s3.amazonaws.com/gamell-io/data.json';
const pictureUrl = `https://api.500px.com/v1/photos?feature=user&username=gamell&sort=created_at&image_size=4&consumer_key=cdpKv8cJK8u78zzqd8WdUUlRGx1In8k0pDrviX62`;
const articlesUrl = `https://medium.com/feed/@gamell`

if(env !== 'prod'){ // load credentials if in development
  console.log('using local credentials');
  const awsCredentials = new aws.SharedIniFileCredentials({profile: 'default'});
  aws.config.credentials = awsCredentials;
}

function trimPictureInfo(data){
  return data.photos.map(i => {
    return {id: i.id, name: i.name, imageUrl: i.image_url, url: `https://500px.com${i.url}`}
  });
}

function parseFeed(feed){
  return new Promise((resolve, reject) => {
    rssParser.parseString(feed, (error, data) => {
      if(error) reject(error);
      else resolve(data);
    });
  });
}

function trimFeed(data){
  return data.feed.entries.map(e => {
    let content = striptags(e['content:encoded'], ['b', 'strong', 'i', 'em', 'img'], '');
    content = truncate(content, 50, {byWords: true});
    return {
      link: e.link,
      title: e.title,
      date: e.pubDate,
      categories: e.categories,
      content: content
    }
  });
}

function uploadToS3(data){
  return new Promise((resolve, reject) => {
    s3.putObject({
        Bucket: 'gamell-io',
        Key: 'data.json',
        Body: data,
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'max-age=86400',
        ContentEncoding: 'gzip',
        ACL: 'public-read'
    }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  })
}

exports.handler = (event, context, callback) => {
    const old = axios.get(jsonUrl).then(res => res.data).catch(err => new Object());
    const pictures = axios.get(pictureUrl).then(res => trimPictureInfo(res.data));
    const articles = axios.get(articlesUrl).then(res => parseFeed(res.data)).then(data => trimFeed(data));
    const repos = ghPinnedRepos.get('gamell');

    Promise.all([pictures, articles, repos, old]).then(res => {
      const [pictures, articles, repos, old] = res;
      const data = { pictures, articles, repos };
      if (!old.data) {
        console.log('WARNING: Old data not available');
        old.data = { pictures: [], articles: [], repos: [] };
      }
      if (JSON.stringify(old.data) === JSON.stringify(data)) {
        // we do nothing if there are no updates
        callback(null, 'success - no changes');
        return;
      }
      const json = JSON.stringify({
        name: '@gamell',
        contents: '500px user feed, Medium articles, Github pinned repos',
        timestamp: new Date(),
        data
      }, null, 2);
      const gzipped = Buffer.from(pako.gzip(json), 'utf-8');
      return uploadToS3(gzipped).then(callback(null, 'success - changes uploaded to S3'));
    }).catch(reason => {
      console.log(`ERROR!!! ${reason}`);
      callback(`ERROR!!! ${reason}`, null);
    })

};
