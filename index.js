const axios = require("axios");
const ghPinnedRepos = require("./gh-pinned-repos.js");
const Parser = require("rss-parser");
const parser = new Parser();
const striptags = require("striptags");
const truncate = require("truncate-html");
const pako = require("pako");
const _ = require("lodash");
const { instagramToken, opengraphIoAppIds } = require("./.keys.json");
const personalInformation = require("./personal-info.json");
const opengraph = require("opengraph-io")({
  appId: opengraphIoAppIds[1],
  cacheOk: true,
});

// AWS stuff

const aws = require("aws-sdk");
const s3 = new aws.S3();

// environment

const env = process.env.ENVIRONMENT || "local";

const jsonUrl = "https://s3.amazonaws.com/gamell-io/data.json";
const pictureUrl = `https://graph.instagram.com/17841401070704167/media?fields=caption,permalink,media_url&access_token=${instagramToken}`;
const articlesUrl = `https://medium.com/feed/@gamell`;

function log(str, level = "dev") {
  console.log(str);
}

if (env !== "prod") {
  // load credentials if in development
  console.log("using local credentials");
  const awsCredentials = new aws.SharedIniFileCredentials({
    profile: "default",
  });
  aws.config.credentials = awsCredentials;
}

function trimPictureInfo(data) {
  log("Trimming picture info");
  return data.data
    .map((i) => {
      return {
        id: i.id,
        caption: i.caption,
        imageUrl: i.media_url,
        url: i.permalink,
      };
    })
    .slice(0, 18);
}

function trimFeed(data) {
  log("Trimming RSS feed");
  return data.items
    .map((e) => {
      let content = striptags(
        e["content:encoded"],
        ["b", "strong", "i", "em", "img"],
        ""
      );
      content = truncate(content, 50, { byWords: true });
      return {
        link: e.link,
        title: e.title,
        date: e.pubDate,
        categories: e.categories,
        content: content,
      };
    })
    .filter((e) => Array.isArray(e.categories));
}

function uploadToS3(data) {
  log("Uploading to AWS S3");
  return new Promise((resolve, reject) => {
    s3.putObject(
      {
        Bucket: "gamell-io",
        Key: "data.json",
        Body: data,
        ContentType: "application/json; charset=utf-8",
        CacheControl: "max-age=86400",
        ContentEncoding: "gzip",
        ACL: "public-read",
      },
      (err, data) => {
        if (err)
          reject(`Upload to S3 failed: ${err} \n\n STATCK \n\n ${err.stack}`);
        else resolve(data);
      }
    );
  });
}

exports.handler = (event, context, callback) => {
  log("Starting process");
  const old = axios
    .get(jsonUrl)
    .then((res) => res.data)
    .catch((reason) => ({
      error: `Error while trying to get the old JSON file: ${reason}`,
    }));
  const pictures = axios
    .get(pictureUrl)
    .then((res) => trimPictureInfo(res.data))
    .catch((reason) => ({
      error: `Error while trying to get the pictures data: ${reason}`,
    }));
  const articles = old.then((old = { data: { articles: [] } }) =>
    parser
      .parseURL(articlesUrl)
      .catch((reason) => ({
        error: `Error while fetching the articles' feed: ${reason}`,
      }))
      .then((data) => trimFeed(data))
      .catch((reason) => ({
        error: `Error while trying trimming articles' data: ${reason}`,
      }))
      .then((articles) => {
        const oldArticles = old.data.articles || [];
        const oldHashTable = {};
        oldArticles.forEach((a) => (oldHashTable[a.title] = a));
        return Promise.all(
          articles.map((a) => {
            maybeOldArticle = oldHashTable[a.title];
            if (!maybeOldArticle) {
              log("New article found! Fetching metadata from opengraph-io");
              return opengraph.getSiteInfo(a.link).then((embedInfo) => ({
                ...a,
                embedInfo,
              }));
            }
            log("Old article found, not fetching metadata from opengraph-io");
            return maybeOldArticle;
          })
        ).catch((reason) => ({
          error: `Error while fetching articles' embed data: ${reason}`,
        }));
      })
  );
  const repos = ghPinnedRepos.get("gamell").catch((reason) => ({
    error: `Error while trying to get the repos data: ${reason}`,
  }));

  Promise.all([pictures, articles, repos, old])
    .then((res) => {
      log("All promises resolved");
      const [
        pictures,
        articles,
        { results: repos, errors: reposErrors },
        old,
      ] = res;
      if (!old.data) {
        console.log("WARNING: Old data not available");
        old.data = { pictures: [], articles: [], repos: [] };
      }
      // fail gracefully and try to conserve whatever we have here in case some service starts erroring out
      const data = {
        pictures: pictures.error ? old.pictures : pictures,
        articles: articles.error ? old.articles : articles,
        repos: repos.error ? old.repos : repos,
        personalInformation: personalInformation.error
          ? old.personalInformation
          : personalInformation,
      };

      const errors = res.reduce(
        (acc, curr) => (curr && curr.error ? [...acc, curr.error] : acc),
        reposErrors
      );

      if (errors.length > 0) {
        console.log(
          "There have been some errors but will continue building JSON file with available information"
        );
        errors.forEach((error) => console.error(error));
      }

      if (JSON.stringify(old.data) === JSON.stringify(data)) {
        // we do nothing if there are no updates
        callback(null, "success - no changes");
        return;
      }
      const json = JSON.stringify(
        {
          name: "@gamell",
          contents: "Instagram pictures, Medium articles, Github pinned repos",
          timestamp: new Date(),
          data,
        },
        null,
        2
      );
      const gzipped = Buffer.from(pako.gzip(json), "utf-8");
      return uploadToS3(gzipped).then(() =>
        errors.length > 0
          ? Promise.reject(
              `Some error(s) happened during the calls to the sources of information (but the JSON file was still updated and uploaded to S3): \n\n ${errors}`
            )
          : callback(null, "success - changes uploaded to S3")
      );
    })
    .catch((reason) => {
      callback(`ERROR!!! ${reason} \n\n STACK: \n\n ${reason.stack}`, null);
    });
};
