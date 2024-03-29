const axios = require("axios");
const ghPinnedRepos = require("./gh-pinned-repos.js");
const Parser = require("rss-parser");
const parser = new Parser();
const striptags = require("striptags");
const truncate = require("truncate-html");
const pako = require("pako");
const _ = require("lodash");
const { instagramToken, opengraphIoAppIds } = require("./.keys.json");
const md = require("markdown-it")({
  html: true,
});
const hash = require("object-hash");
const opengraphIdToUse =
  opengraphIoAppIds[Math.floor(Math.random() * opengraphIoAppIds.length)];
console.log("Using opengraph id: " + opengraphIdToUse);
const opengraph = require("opengraph-io")({
  appId: opengraphIdToUse,
  cacheOk: false,
});

// AWS stuff

// const aws = require("aws-sdk"),
const { S3 } = require("@aws-sdk/client-s3");
const { fromIni } = require("@aws-sdk/credential-providers");
let s3;

// environment

const env = process.env.ENVIRONMENT || "local";

const jsonUrl = "https://s3.amazonaws.com/gamell-io/data.json";
const pictureUrl = `https://graph.instagram.com/v16.0/17841401070704167/media?fields=caption,permalink,media_url,media_type&access_token=${instagramToken}`;
const mediumArticlesUrl = "https://medium.com/feed/@gamell";
const gmsArticlesUrl = "https://graymatters.substack.com/feed";
const markdownUrls = {
  intro:
    "https://raw.githubusercontent.com/gamell/gamell.io-v2/master/content/intro.md",
  announcements:
    "https://raw.githubusercontent.com/gamell/gamell.io-v2/master/content/announcements.md",
  contact:
    "https://raw.githubusercontent.com/gamell/gamell.io-v2/master/content/contact.md",
};

function log(str, level = "dev") {
  console.log(str);
}

if (env !== "prod") {
  // load credentials if in development
  console.log("using local credentials");
  const awsCredentials = fromIni({
    profile: "default",
  });
  s3 = new S3({ credentials: awsCredentials });
} else {
  s3 = new S3();
}

function trimPictureInfo(data) {
  log("Trimming picture info");
  return data.data
    .reduce((acc, curr) => {
      if (curr.media_type !== "VIDEO") {
        acc.push({
          id: curr.id,
          caption: curr.caption,
          imageUrl: curr.media_url,
          url: curr.permalink,
        });
      }
      return acc;
    }, [])
    .slice(0, 18);
}

function trimFeed(data, source) {
  log("Trimming RSS feed");
  const result = data.items.map((e) => {
    let content = striptags(
      e["content:encoded"],
      ["b", "strong", "i", "em", "img"],
      ""
    );
    content = truncate(content, 50, { byWords: true });
    console.log(`Processing link: ${JSON.stringify(e.link)}`);
    return {
      link: e.link,
      title: e.title,
      date: e.pubDate,
      categories: e.categories,
      content: content,
    };
  });
  if (source.indexOf("medium") > 0) {
    // only filter items without categories for Medium
    return result.filter((e) => Array.isArray(e.categories));
  }
  return result;
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

function fetchArticles(oldArticlesArg) {
  log("Fetching artifle feeds");
  const articlesFromSeveralSourcesPromise = [
    mediumArticlesUrl,
    gmsArticlesUrl,
  ].map((url) =>
    parser
      .parseURL(url)
      .catch((reason) => ({
        error: `Error while fetching articles from ${url} \n\n Reason: ${reason}`,
      }))
      .then((data) => trimFeed(data, url))
      .catch((reason) => ({
        error: `Error while trimming articles from ${url} \n\n Reason: ${reason}`,
      }))
  );
  const mergedArticles = Promise.all(articlesFromSeveralSourcesPromise).then(
    (articlesFromSeveralSources) => {
      if (articlesFromSeveralSources.length === 1) return arrayOfArticles[0];
      if (articlesFromSeveralSources.length === 0) return [];
      const sortFn = (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime();
      return articlesFromSeveralSources.flat().sort(sortFn).slice(0, 10);
    }
  );
  return mergedArticles.then((articles) => {
    const oldArticles = oldArticlesArg.data.articles || [];
    const oldHashTable = {};
    oldArticles.forEach((a) => (oldHashTable[generateHash(a)] = a));
    return Promise.all(
      articles.map((a) => {
        maybeOldArticle = oldHashTable[generateHash(a)];
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
  });
}

function generateHash(article) {
  return hash([article.title, article.description]);
}

let markdownHashes = {};

exports.handler = (event, context, callback) => {
  log("Starting process");
  log("Fetching old info");
  const old = axios
    .get(jsonUrl)
    .then((res) => res.data)
    .catch((reason) => ({
      error: `Error while trying to get the old JSON file: ${reason}`,
    }));
  log("Fetching picture info");
  const pictures = axios
    .get(pictureUrl)
    .then((res) => trimPictureInfo(res.data))
    .catch((reason) => ({
      error: `Error while trying to get the pictures data: ${reason}`,
    }));
  log("Fetching articles info");
  const articles = old.then((old = { data: { articles: [] } }) =>
    fetchArticles(old)
  );
  log("Fetching repos info");
  const repos = ghPinnedRepos.get("gamell").catch((reason) => ({
    error: `Error while trying to get the repos data: ${reason}`,
  }));
  log("Fetching markdowns info");
  const markdowns = Object.entries(markdownUrls).map(([name, url]) =>
    axios
      .get(url)
      .then((res) => {
        console.log(`Processing Markdown ${url}`);
        return res;
      })
      .then((res) =>
        old.then((old = { markdowns: {} }) => {
          const currHash = hash(res.data);
          const oldHash =
            old.markdowns && old.markdowns.hashes && old.markdowns.hashes[name];
          markdownHashes = { ...markdownHashes, [name]: currHash };
          if (currHash === oldHash) {
            log(
              `Returning old markdown content for ${name} as it hasn't changed`
            );
            return { [name]: old.markdowns[name] };
          } else {
            return {
              [name]: md.render(res.data),
            };
          }
        })
      ) // Render the markdown into HTML
      .catch((reason) => ({
        error: `Error while trying to get content from ${url}: \n\n ${reason}`,
      }))
  );

  Promise.all([pictures, articles, repos, Promise.all(markdowns), old])
    .then((res) => {
      log("All promises resolved");
      const [
        pictures,
        articles,
        { results: repos, errors: reposErrors },
        markdownsArr,
        old,
      ] = res;
      if (!old.data) {
        console.log("WARNING: Old data not available");
        old.data = { pictures: [], articles: [], repos: [] };
        old.markdowns = [];
      }
      // fail gracefully and try to conserve whatever we have here in case some service starts erroring out
      const data = {
        pictures:
          !pictures || pictures.error || !Array.isArray(pictures)
            ? old.data.pictures
            : pictures,
        articles:
          !articles || articles.error || !Array.isArray(articles)
            ? old.data.articles
            : articles,
        repos:
          !repos || repos.error || !Array.isArray(repos)
            ? old.data.repos
            : repos,
      };

      const flattenedMarkdowns = markdownsArr.reduce(
        (acc, curr) => ({ ...acc, ...curr }),
        {}
      ); // "flatten" the several object into one
      const flattenedMarkdownsWithHashes = {
        ...flattenedMarkdowns,
        hashes: markdownHashes,
      };
      const markdowns = markdownsArr.error
        ? old.markdowns
        : flattenedMarkdownsWithHashes;

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

      if (
        JSON.stringify(old.data) === JSON.stringify(data) &&
        JSON.stringify(old.markdowns) === JSON.stringify(markdowns)
      ) {
        // we do nothing if there are no updates
        callback(null, "success - no changes");
        if (context === "test") {
          console.log("RESULT: \n\n");
          console.log(JSON.stringify(data, null, 2));
        }
        return;
      }
      const json = JSON.stringify(
        {
          name: "@gamell",
          contents: "Instagram pictures, Medium articles, Github pinned repos",
          timestamp: new Date(),
          data,
          markdowns,
        },
        null,
        2
      );
      if (context === "test") {
        console.log("RESULT: \n\n");
        console.log(json);
      }
      const gzipped = Buffer.from(pako.gzip(json), "utf-8");
      return uploadToS3(gzipped).then(() =>
        errors.length > 0
          ? callback(
              `Some error(s) happened during the calls to the sources of information (but the JSON file was still updated and uploaded to S3): \n\n ${errors}`
            )
          : callback(null, "success - changes uploaded to S3")
      );
    })
    .catch((reason) => {
      callback(`ERROR!!! ${reason} \n\n STACK: \n\n ${reason.stack}`, null);
    });
};
