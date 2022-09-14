const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

//writing middleware authenticate token function

const authenticateToken = (request, response, next) => {
  //Get Books API
  //specify logger function
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TWITTER_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        //if token is successful then call api handler
        //console.log(payload);
        //now we want to send this payload/username, we can't send it directly
        //so we are sending it through request object
        request.username = payload.username;
        //we have to make use of this in user profile details handler
        next();
      }
    });
  }
};

//API-1 Register

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const checkUserQuery = `SELECT * FROM user WHERE 
    username='${username}';`;
  const encryptedPassword = await bcrypt.hash(password, 10);

  const dbUserRegister = await db.get(checkUserQuery);

  if (dbUserRegister === undefined) {
    //create user
    if (password.length > 6) {
      const registerUserQuery = `INSERT INTO user(name,username,password,gender) 
    VALUES('${name}',
    '${username}',
    '${encryptedPassword}',
    '${gender}');`;

      const userCreateResponse = await db.run(registerUserQuery);
      response.status(200);
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

//API-2
//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TWITTER_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3-Returns the latest tweets of people whom the user follows. Return 4 tweets at a time

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  //retreiving usernmae stored in payload while logging through middleware authenticate

  let { username } = request;
  //console.log(username);
  const getUseridQuery = `SELECT user_id FROM user WHERE username='${username}';`;

  const userId = await db.get(getUseridQuery);
  //console.log(userId);//written object
  const { user_id } = userId; //get user id
  //console.log(user_id);

  const getFollowersTweetQuery = `SELECT
username,tweet,date_time as dateTime 
FROM
(follower INNER JOIN tweet ON 
follower.following_user_id=tweet.user_id) 
AS T NATURAL JOIN user 
WHERE
follower.follower_user_id = ${user_id}
ORDER BY date_time DESC
LIMIT 4;`;
  //console.log(getFollowersTweetQuery);

  const tweetResponse = await db.all(getFollowersTweetQuery);
  response.send(tweetResponse);
});

//API -4 Returns the list of all names of people whom the user follows

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUseridQuery = `SELECT user_id FROM user WHERE username='${username}';`;

  const userId = await db.get(getUseridQuery);
  const { user_id } = userId;

  const getNamesOfFollowingQuery = `
SELECT  name FROM user 
INNER JOIN follower ON 
user.user_id = follower.following_user_id 
WHERE
follower.follower_user_id = ${user_id};
`;
  const followingNamesResponse = await db.all(getNamesOfFollowingQuery);
  response.send(followingNamesResponse);
});

//API -5 Returns the list of all names of people who follows the user

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUseridQuery = `SELECT user_id FROM user 
   WHERE username='${username}';`;
  const userId = await db.get(getUseridQuery);
  const { user_id } = userId;
  const getFollowingToUserNamesQuery = `
SELECT  name FROM user 
INNER JOIN follower ON 
user.user_id = follower.follower_user_id 
WHERE
follower.following_user_id = ${user_id};
`;

  const usersFollowersResponse = await db.all(getFollowingToUserNamesQuery);
  response.send(usersFollowersResponse);
});

//API-6-2 scenarios-/tweets/:tweetId/

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const getUseridQuery = `SELECT user_id FROM user 
   WHERE username='${username}';`;
  const userId = await db.get(getUseridQuery);
  const { user_id } = userId;

  const getTweetsQuery = `
SELECT
*
FROM
tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
WHERE
tweet_id = ${tweetId} AND follower_user_id = ${user_id};
`;

  const tweetsResponse = await db.get(getTweetsQuery);

  if (tweetsResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getNumberOfLikeCountQuery = `
SELECT
COUNT(*) as likes
FROM
tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
WHERE tweet.tweet_id = ${tweetId}
`;
    const getLikesCount = await db.all(getNumberOfLikeCountQuery);
    const getNumberOfReplyQuery = `
SELECT
COUNT(*) as replies
FROM
tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
WHERE tweet.tweet_id = ${tweetId}
`;
    const getReplyCountResponse = await db.all(getNumberOfReplyQuery);
    response.send({
      tweet: tweetsResponse["tweet"],
      likes: getLikesCount[0]["likes"],
      replies: getReplyCountResponse[0]["replies"],
      dateTime: tweetsResponse["date_time"],
    });
  }
});

//API-7-2 scenarios /tweets/:tweetId/likes/

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUseridQuery = `SELECT user_id FROM user 
   WHERE username='${username}';`;
    const userId = await db.get(getUseridQuery);
    const { user_id } = userId;

    const getTweetQuery = `
SELECT
*
FROM
tweet INNER JOIN follower ON 
tweet.user_id = follower.following_user_id
WHERE
tweet_id = ${tweetId} AND follower_user_id = ${user_id};
`;
    const tweetResponse = await db.get(getTweetQuery);
    if (tweetResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getNumberOfLikesCountQuery = `
SELECT
username
FROM
(tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) 
INNER JOIN user ON user.user_id = like.user_id
WHERE tweet.tweet_id = ${tweetId}
`;
      const likesCountResponse = await db.all(getNumberOfLikesCountQuery);
      // console.log(likesCountResponse); //contains array of username obj
      const likedByPerson = likesCountResponse.map(
        (eachPerson) => eachPerson.username
      );
      response.send({ likes: likedByPerson });
    }
  }
);

//API-8 Path: /tweets/:tweetId/replies/

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUseridQuery = `SELECT user_id FROM user 
   WHERE username='${username}';`;
    const userId = await db.get(getUseridQuery);
    const { user_id } = userId;

    const getTweetQuery = `
SELECT
*
FROM
tweet INNER JOIN follower ON 
tweet.user_id = follower.following_user_id
WHERE
tweet_id = ${tweetId} AND follower_user_id = ${user_id};
`;
    const tweetResponse = await db.get(getTweetQuery);

    if (tweetResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getNumberOfRepliesQuery = `
SELECT
name ,
reply
FROM
(tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id ) 
INNER JOIN user ON user.user_id = reply.user_id
WHERE tweet.tweet_id = ${tweetId}
`;
      const replyCountResponse = await db.all(getNumberOfRepliesQuery);
      response.send({ replies: replyCountResponse });
    }
  }
);

//API-9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUseridQuery = `SELECT user_id FROM user 
   WHERE username='${username}';`;
  const userId = await db.get(getUseridQuery);
  const { user_id } = userId;
  const getDetailedTweetQuery = `
SELECT
tweet,COUNT(*) AS likes,
(
SELECT
COUNT(*) AS replies
FROM
tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
WHERE tweet.user_id = ${user_id}
GROUP BY
tweet.tweet_id
) AS replies,tweet.date_time
FROM
tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
WHERE tweet.user_id = ${user_id}
GROUP BY
tweet.tweet_id;
`;
  const tweetResponse = await db.all(getDetailedTweetQuery);

  const displayTweetDetails = (eachTweet) => {
    return {
      tweet: eachTweet.tweet,
      likes: eachTweet.likes,
      replies: eachTweet.replies,
      dateTime: eachTweet.date_time,
    };
  };

  response.send(
    tweetResponse.map((eachTweet) => displayTweetDetails(eachTweet))
  );
});

//API-10 creating a post in the tweet table

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUseridQuery = `SELECT user_id FROM user 
   WHERE username='${username}';`;
  const userId = await db.get(getUseridQuery);
  const { user_id } = userId;
  const { tweet } = request.body;
  //console.log(tweet);
  const creatingTweetQuery = `
INSERT INTO
tweet (tweet,user_id)
VALUES
('${tweet}',${user_id});`;

  const postTweetResponse = await db.run(creatingTweetQuery);
  response.send("Created a Tweet");
});

//API-11 deleting tweet query

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const getUseridQuery = `SELECT user_id FROM user 
   WHERE username='${username}';`;
    const userId = await db.get(getUseridQuery);
    const { user_id } = userId;
    const { tweetId } = request.params;
    const getTweetsQuery = `
SELECT
*
FROM
tweet
WHERE tweet_id = ${tweetId}
`;
    const tweetResponse = await db.get(getTweetsQuery);
    //const { user_id } = tweetResponse;
    // console.log(tweetResponse.user_id);
    //tweet response contains following info.match the user id
    /*
        {
  tweet_id: 14,
  tweet: 'The red Mornings...',
  user_id: 2,
  date_time: '2022-09-14 14:50:59'
}
    */
    if (user_id === tweetResponse.user_id) {
      const deletingTweetQuery = `
DELETE FROM
tweet
WHERE tweet_id = ${tweetId}
`;
      const deleteTweetResponse = await db.run(deletingTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
