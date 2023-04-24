const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http:/localhost:3000/");
    });
  } catch (e) {
    console.log(e.message);
  }
};

initializeDBAndServer();

const validatePassword = (password) => {
  return password.length > 5;
};

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
}

app.post("/register/", async (request, response) => {
  const { userId, name, username, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user ( username, password, name, gender) 
      VALUES 
        (
          '${username}',
          '${hashedPassword}',
          '${name}', 
          '${gender}'
        );`;
    if (validatePassword(password)) {
      const dbResponse = await db.run(createUserQuery);
      const userId = dbResponse.lastID;
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await db.get(selectUserQuery);
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getLoggedInUserId = `
  SELECT * FROM user WHERE username = "${username}"`;
  const loggedInUserIdObj = await db.get(getLoggedInUserId);

  const getFollowingQuery = `
        SELECT
        user.name,
        FROM 
        user INNER JOIN follower ON user.user_id=follower.following_id
        WHERE user.user_id = ${loggedInUserIdObj.user_id}
        `;
  const followingsArray = await db.all(getFollowingQuery);

  for (let i of followingsArray) {
    response.send(i);
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getLoggedInUserId = `
  SELECT * FROM user WHERE username = "${username}"`;
  const loggedInUserIdObj = await db.get(getLoggedInUserId);
  const getFeedQuery = `
    SELECT
    user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM
    follower
    INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
    INNER JOIN user
    ON tweet.user_id = user.user_id
    WHERE
    follower.follower_user_id = ${loggedInUserIdObj.user_id}
    ORDER BY
    tweet.date_time DESC
    LIMIT 4;`;
  const feedArray = await db.all(getFeedQuery);
  response.send(feedArray);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { userId } = request.params;
  const getUserIdQuery = `
        SELECT 
            follower_user_id 
        FROM 
            follower
        WHERE 
         follower_id = ${userId};`;
  const userIdObject = await db.get(getFollowersQuery);
  const getFollowersQuery = `
        SELECT
        username,
        FROM 
        user INNER JOIN follower ON user.user_id=follower.follower_id 
        WHERE user.user_id = ${userIdObject.user_id} 
        `;
  const followersArray = await db.all(getFollowersQuery);
  response.send(followersArray);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;

  const { username } = request;
  const getLoggedInUserId = `
  SELECT * FROM user WHERE username = "${username}"`;
  const loggedInUserIdObj = await db.get(getLoggedInUserId);

  const getTweetQuery = `
    SELECT
      tweet.tweet ,
      count(like.like_id) AS likes,
      count(reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM
      (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) AS T 
      INNER JOIN reply ON T.tweet_id = reply.tweet_id 
    WHERE
      T.tweet_id = ${tweetId} AND T.user_id =${loggedInUserIdObj.user_id}`;
  const tweet = await database.get(getTweetQuery);
  response.send(tweet);
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const { username } = request;
    const getLoggedInUserId = `SELECT * FROM user WHERE username = "${username}"`;
    const loggedInUserIdObj = await db.get(getLoggedInUserId);

    const getTweetQuery = `
    SELECT
      user.name
    FROM
      user INNER JOIN like ON user.user_id = like.user_id
    WHERE
      tweet.tweet_id = ${tweetId} AND user.user_id = ${loggedInUserIdObj.user_id}`;
    const tweet = await database.get(getTweetQuery);
    response.send({ like: tweet });
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const { username } = request;
    const getLoggedInUserId = `
  SELECT * FROM user WHERE username = "${username}"`;
    const loggedInUserIdObj = await db.get(getLoggedInUserId);

    const getTweetQuery = `
    SELECT
      tweet.tweet ,
      count(like.like_id) AS likes,
      count(reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM
      (tweet INNER JOIN like on tweet.tweet_id = like.tweet_id) AS T 
      INNER JOIN reply ON T.tweet_id = reply.tweet_id 
    WHERE
      T.tweet_id = ${tweetId};`;
    const tweet = await database.get(getTweetQuery);
    response.send(tweet);
  }
);

const convertTweetsDbObjectToResponseObject = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.dateTime,
  };
};

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;

  const { username } = request;
  const getLoggedInUserId = `
  SELECT * FROM user WHERE username = "${username}"`;
  const loggedInUserIdObj = await db.get(getLoggedInUserId);

  const getTweetQuery = `
    SELECT
      tweet.tweet ,
      count(like.like_id) AS likes,
      count(reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM
      (tweet INNER JOIN like on tweet.tweet_id = like.tweet_id) AS T 
      INNER JOIN reply ON T.tweet_id = reply.tweet_id 
    WHERE
      T.user_id = ${loggedInUserIdObj.user_id}`;
  const tweet = await database.get(getTweetQuery);
  response.send(
    tweet.map((each) => convertTweetsDbObjectToResponseObject(each))
  );
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;
  const getLoggedInUserId = `
  SELECT * FROM user WHERE username = "${username}"`;
  const loggedInUserIdObj = await db.get(getLoggedInUserId);
  const postTweetQuery = `
  INSERT INTO
    tweet (tweet,user_id, date_time)
  VALUES
    ("${tweet}", ${getLoggedInUserId.user_id}, ${new Date()});`;
  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getLoggedInUserId = `SELECT * FROM user WHERE username = "${username}"`;
    const loggedInUserIdObj = await db.get(getLoggedInUserId);
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}
    AND user_id= ${loggedInUserIdObj.user_id}`;

    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
);

module.exports = app;
