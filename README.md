# personal-json-aggregator
Small function to aggregate and cache information from different sources for my personal website

To get instagram token go here https://rudrastyh.com/tools/access-token

## Instagram API token

I think the token will expire once a month U_U -- Instructions to renew it:

- Go here https://developers.facebook.com/apps/1680101692154218/instagram-basic-display/basic-display/
- Generate token
- Update token and re-upload to Lambda

## Runtime / Local etc

- `bun run build` to build the lambda zip file
- `bun run start` to run the project locally
- `bun run generate-json` to generate the json file locally
