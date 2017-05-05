const axios = require('axios');
const ghPinnedRepos = require('./gh-pinned-repos.js');
const rssParser = require('rss-parser');

const pictureUrl = `https://api.500px.com/v1/photos?feature=user&username=gamell&sort=created_at&image_size=4&consumer_key=cdpKv8cJK8u78zzqd8WdUUlRGx1In8k0pDrviX62`;
const articlesUrl = `https://medium.com/feed/@gamell`

function trimPictureInfo(data){
  return data.photos.map(i => {
    return {id: i.id, name: i.name, imageUrl: i.image_url}
  });
}

function parseFeed(feed){
  debugger;
  return new Promise((resolve, reject) => {
    rssParser.parseString(feed, (err, data) => {
      if(error) reject(error);
      resolve(data);
    });
  });
}

function trimFeed(feed){
  // todo
  return feed;
}

exports.handler = (event, context, callback) => {
    const pictures = axios.get(pictureUrl).then(res => trimPictureInfo(res.data));
    const articles = axios.get(articlesUrl).then(res => parseFeed(res.data)).then(feed => trimFeed(feed));
    const repos = ghPinnedRepos.get('gamell');

    Promise.all([pictures, articles, repos]).then(data => {
      const output = {
        name: '@gamell',
        contents: '500px user feed, Medium articles, Github pinned repos',
        pictures: data[0],
        articles: data[1],
        repos: data[2]
      }
      console.log(JSON.stringify(output));
      callback(output, 'done');
    }).catch(reason => {
      console.log(`ERROR!!! ${reason}`);
      callback(reason, 'error');
    })

};
