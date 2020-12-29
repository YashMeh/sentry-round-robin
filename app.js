const {
  integrationProjectID,
  sentryAPISecret,
} = require("./constants").constants;
const verifySignature = require("./verify");
const sentry = require("./sentry");

const http = require("http");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const { WebClient } = require("@slack/web-api");
const token = process.env.SLACK_TOKEN;
const bot = new WebClient(token);

app.use(bodyParser.json());

// Array of all usernames with access to the given project
app.allUsers = [];

// Array of usernames queued up to be assigned to upcoming new issues
app.queuedUsers = [];

const errorWrapper = (fn) => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
};
// When receiving a POST request from Sentry:
app.post(
  "/",
  errorWrapper(async function post(request, response) {
    if (!verifySignature(request, sentryAPISecret)) {
      return response.status(401).send("bad signature");
    }

    const wantObject = {
      projectName: `${request.body.data.issue.project.slug}`,
      errorTitle: `${request.body.data.issue.title}`,
      fileName: `${request.body.data.issue.metadata.filename}`,
      timeStamp: `${request.body.data.issue.lastSeen}`,
    };
    bot.chat.postMessage({
      text: "Something Went Wrong  :fire_engine:",
      attachments: [
        {
          text: `Project- ${wantObject.projectName},\n Error- ${wantObject.errorTitle}, \n File- ${wantObject.fileName}, \n Time- ${wantObject.timeStamp} \n`,
        },
      ],
      channel: process.env.SLACK_CHANNEL,
    });

    response.status(200).send("ok");
  })
);

// Get list of users for project, save to queue
async function init() {
  if (sentry) {
    sentry.addBreadcrumb({
      message: `Server initialized`,
      level: sentry.Severity.Info,
    });
  }
}

app.use(function onError(err, req, res, next) {
  const errorId = sentry.captureException(err);
  console.error(err);
  res.status(500);

  if (errorId && integrationProjectID) {
    res.set("Sentry-Hook-Error", errorId);
    res.set("Sentry-Hook-Project", integrationProjectID);
  }

  res.send();
});

app.listen = async function() {
  await init();
  let server = http.createServer(this);
  return server.listen.apply(server, arguments);
};

module.exports = app;
