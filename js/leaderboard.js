/*============================================
=            Firebase Leaderboard            =
============================================*/
/*----------  Initialize Firebase  ----------*/
var config = {
    apiKey: "AIzaSyApUWILksbyrUgu91xoAv9VdRn6DIlhv5o",
    authDomain: "oedi-astroid.firebaseapp.com",
    databaseURL: "https://oedi-astroid.firebaseio.com",
    projectId: "oedi-astroid",
    storageBucket: "oedi-astroid.appspot.com",
    messagingSenderId: "512114442611"
  };
firebase.initializeApp(config);

/*----------  Define Leaderboard Variables  ----------*/
var LEADERBOARD_SIZE = 5;               // Number of names to show on the leaderboard
var provider;                           // The user's provider they logged in with
var user = firebase.auth().currentUser; // The current logged in user
var displayName = "";                   // The user's display name
var prevScore;                          // The user's high score in the database
var uid, isAnonymous;                   // The user's UID & if they're logged in or not
var redirect = false;                   // Flag for indicating if the user is returning from a redirect
var highScore;                          // Overall high score

/*----------  Firebase References  ----------*/
var rootRef = firebase.database().ref();
var scoreListRef = firebase.database().ref("scoreList");
var highestScoreRef = firebase.database().ref("highestScore");

/**
 * initApp handles setting up the Firebase context and registering callbacks for the authentication status
 */
function initApp() {
  // Result from Redirect Authentication Flow
  firebase.auth().getRedirectResult().then(function(result) {
    if (result.credential) {
      var token = result.credential.accessToken; // User's access token
    }
    // Sign-in user information
    if(result.user) {
      var user = result.user;
      var displayName = user.displayName;
      redirect = true;
    }
  }).catch(function(error) {
    // Handle Errors here.
    var errorCode = error.code;
    var errorMessage = error.message;
    var credential = error.credential;
    if (errorCode === 'auth/account-exists-with-different-credential') {
      alert('You have already signed up with a different social media site for that email.');
    } else {
      console.error(error);
    }
  });

  // Listening for authentication state changes (User signs on/off)
  firebase.auth().onAuthStateChanged(function(user) {
    // User is signed in.
    if (user) {
      uid = user.uid; // User ID
      var isAnonymous = user.isAnonymous; // True or False
      var refreshToken = user.refreshToken; // Refresh Token
      var providerData = user.providerData; // User Provider Data (Facebook, Twitter, Google)
      
      // If user is signed in, use their display name as the game displayName, if not, leave it blank
      if(isAnonymous == false) {
        displayName = user.displayName;
      }
      else {
        displayName = "";
      }
      displayName = cleanDisplayName(displayName); // Cleans the display name of bad words, shortens to first/last name

      /*----------  Update Leaderboard & User Earned Information  ----------*/
      // Update the leaderboard now that they've logged in with the stored cookie score; else get their existing info
      if(redirect == true) {
        var cookieScoreValue = document.cookie.replace(/(?:(?:^|.*;\s*)anonScore\s*\=\s*([^;]*).*$)|^.*$/, "$1"); // Previous game score cookie
        if(cookieScoreValue) {
          fb_updateLeaderboard(cookieScoreValue, false);
        }
        else {
          fb_setUserEarnedInfo();
        }
      }
      else {
        fb_setUserEarnedInfo();
      }

      /*----------  Signed In HTML  ----------*/
      $("#play-game").hide();
      $("#start-quiz").show();

      // Set Welcome Message
      $("#welcomeUser").html("Welcome back, <strong>"+displayName+"</strong>!<br />");
      $("#userInfo").show();

      // Sign Out Option
      $(".sign-out").show();
      $(".sign-out").click(function() {
        authenticateSignOut();
      });
      $("#authentication").hide();
      console.log("signed in");

    } else {
      /*----------  Signed Out HTML  ----------*/
      console.log("signed out");
      $("#welcomeUser").html("To save your high score, sign in!");
      $("#userInfo").hide();
      $(".sign-out").hide();
      $("#free-play").hide();
      $("#authentication").show();
      $(".btn-twitter").click(function() {
        authenticateUser("Twitter");
      });
      $(".btn-facebook").click(function() {
        authenticateUser("Facebook");
      });
      $(".btn-google").click(function() {
        authenticateUser("Google");
      });
      $("#shark_signin").click(function() {
        authenticateEmailSignIn();
      });
    }
  });
}

// When the window is done loading, fire initApp()
window.onload = function() {
  initApp();
};

/**
 * Set livesEarned and prevScore global variables according to the user's saved information
 */
function fb_setUserEarnedInfo() {
  firebase.database().ref("scoreList/"+uid).once("value").then(function(snapshot) {
    console.log('Updating sidebar');
    livesEarned = snapshot.child("lives").val(); // Current Lives Earned
    prevScore = snapshot.child("score").val(); // Current Personal High Score
    var timestamp = snapshot.child("timestamp").val(); // Timestamp of last game
    var priority = snapshot.getPriority(); // Priority (list order) of user

    // Calculate ranking of user based on priority
    var scoreListing = scoreListRef.orderByPriority().startAt(priority);
    scoreListing.once("value").then(function(snapshot) {
      var currentRank = snapshot.numChildren(); // Number of scores between user's score and highest score
      $("#currentRanking").html("Current Overall Ranking: "+getOrdinal(currentRank)+"<br />");
    });

    // If user has a previous score
    if(prevScore != null) {
      $("#personalHighScore").html("Personal High Score: "+prevScore+"<br />");
    }
    // If user has bonus lives show them, else hide the free play button
    if(livesEarned != null && livesEarned != 0) {
      $("#free-play").show();
      $("#livesEarnedContainer").html("Lives Earned: "+livesEarned+"<br /><br />");

    }
    else {
      $("#free-play").hide();
    }
  });
}

/**
 * Updates the scoreList with new user information & score; replace preexisting score if there is one
 * @param  {string} score    User's score
 * @param  {string} freePlay True or False (Was this a quiz game or not?)
 */
function fb_updateLeaderboard(score, freePlay) {
  /*----------  Define Variables  ----------*/
  var name = displayName; // User's displayName
  var newScore = Number(score); // User's score

  // If quiz version, set newLives to quizLivesEarned cookie value; else set newLives to score
  if(freePlay == false) {
    var newLives = Number(document.cookie.replace(/(?:(?:^|.*;\s*)quizLivesEarned\s*\=\s*([^;]*).*$)|^.*$/, "$1"));
  }
  else {
    var newLives = Number(score);
  }

  // If user doesn't have a name, cancel the function
  if (name.length === 0) {
    return;
  }

  console.log("Update Leaderboard Function");
  var userScoreRef = scoreListRef.child(uid); // Firebase Reference to /scoresList/$uid

  /*----------  Update Database with User's Score  ----------*/
  userScoreRef.once('value').then(function(snapshot) {
    // If we have an existing score recorded, update the existing record
    if(snapshot.val() != null) {
      var oldScore = snapshot.val().score; // Score previously recorded in the database

      // If newScore > oldScore, update the database
      if(oldScore === undefined || newScore > oldScore) {
        userScoreRef.update({score:newScore, timestamp:Date.now()}); // Update the score & timestamp
        userScoreRef.setPriority(newScore, function(){ // Update the priority and update the User Earned Information
            console.log('Updated user score 1...');
            fb_setUserEarnedInfo();
          });

        // Update the user's lives earned if freePlay = false
        if(freePlay == false) {
          userScoreRef.update({lives:newLives, timestamp:Date.now()}, function(){
            console.log('Updated user lives 1...');
            fb_setUserEarnedInfo();
          });
        }
      }
      else {
        // Update the user's lives earned if freePlay = false
        if(freePlay == false) {
          userScoreRef.update({lives:newLives, timestamp:Date.now()}, function(){
            console.log('Updated user lives 2...');
            fb_setUserEarnedInfo();
          });
        }
      }
    }
    // Create a new record if one does not already exist
    else {
      // Use setWithPriority to put the name / score in Firebase, and set the priority to be the score.
      userScoreRef.setWithPriority({ name:name, score:newScore, timestamp:Date.now() }, newScore, function(){
        console.log('Updated user score 2...');
        fb_setUserEarnedInfo();
      });

      // Update the user's lives earned if freePlay = false
      if(freePlay == false) {
        userScoreRef.update({lives:newLives, timestamp:Date.now()}, function(){
          console.log('Updated user lives 3...');
          fb_setUserEarnedInfo();
        });
      }
    }
  });

  /*----------  Compare to Highest Score  ----------*/
  // Track highest score using a transaction to ensure no conflicting changes if multiple clients writing to database simultaneously
  highestScoreRef.transaction(function (currentHighestScore) {
    if (currentHighestScore === null || newScore > currentHighestScore) {
      return newScore; // The return value of this function gets saved to the database as the new highest score.
    }
    return; // if we return with no arguments, it cancels the transaction.
  });
}

/**
 * Updates the Total Correct/Incorrect Answers Counter
 * @param  {string} answersRef  Firebase reference
 * @return {value}              The new total Correct/Incorrect answer count
 */
function fb_updateCorrectIncorrectAnswers(answersRef) {
  answersRef.transaction(function(currentValue) {
    return currentValue + 1;
  });
}

/**
 * Update the Games Played Node for all users
 * @param  {string} lives     # of lives either earned (in quiz mode) or started out with (in free play)
 * @param  {flag} freePlay    true or false
 * @return none
 */
function fb_updateGamesPlayed(lives, freePlay) {
  if(!uid) {
    uid = "null";
    displayName = "null";
  }
  var gamesPlayedRef = firebase.database().ref("gamesPlayed");
  var newGamesPlayedRef = gamesPlayedRef.push();
  newGamesPlayedRef.set({ 'uid': uid, 'name': displayName, 'timestamp': Date.now(), 'score': score, 'lives': lives });
}

/*====================================================
=            Update & Display Leaderboard            =
====================================================*/
var htmlForPath = {}; // Keep a mapping of Firebase locations to HTML elements, so we can move/remove elements as necessary.
var scoreListView = scoreListRef.limitToLast(LEADERBOARD_SIZE); // Create a view to only receive callbacks for the last LEADERBOARD_SIZE scores

/*----------  Firebase Callbacks  ----------*/
// Add a callback to handle when a new score is added.
scoreListView.on('child_added', function (newScoreSnapshot, prevScoreName) {
  handleScoreAdded(newScoreSnapshot, prevScoreName);
});

// Add a callback to handle when a score is removed
scoreListView.on('child_removed', function (oldScoreSnapshot) {
  handleScoreRemoved(oldScoreSnapshot);
});

// Add a callback to handle when a score changes or moves positions.
var changedCallback = function (scoreSnapshot, prevScoreName) {
  handleScoreRemoved(scoreSnapshot);
  handleScoreAdded(scoreSnapshot, prevScoreName);
};
scoreListView.on('child_moved', changedCallback);
scoreListView.on('child_changed', changedCallback);

/*----------  Update Highest Score HTML  ----------*/
highestScoreRef.on('value', function (newHighestScore) {
  $(".highestScoreDiv").text(newHighestScore.val());
  highScore = newHighestScore.val();
});

/*----------  Update Leaderboard Display  ----------*/
/**
 * Takes a new score snapshot and adds an appropriate row to the leaderboard table display
 * @param  {string} scoreSnapshot Firebase data snapshot of the game just played
 * @param  {string} prevScoreName Firebase data snapshot of the game previously played
 * @return                        Updates the leaderboard HTML
 */ 
function handleScoreAdded(scoreSnapshot, prevScoreName) {
  var name = scoreSnapshot.val()['name']; // User's display name
  var score = scoreSnapshot.val().score; // User's score
  var newScoreRow = $("<tr/>");
  newScoreRow.append($("<td/>").append($("<em/>").text(name)));
  newScoreRow.append($("<td/>").text(score));

  // Store a reference to the table row. Used to determine where to insert the new row in the table when comparing scores
  htmlForPath[scoreSnapshot.key] = newScoreRow;

  // Insert the new score in the appropriate place in the table
  if (prevScoreName === null) {
    $("#leaderboardTable").append(newScoreRow);
  }
  else {
    var lowerScoreRow = htmlForPath[prevScoreName];
    lowerScoreRow.before(newScoreRow);
  }
}
/**
 * Removes a score object from the leaderboard list and table
 * @param  {string} scoreSnapshot Firebase data snapshot of the game just played
 * @return                        Removes the score from the leaderboard table and score object
 */
function handleScoreRemoved(scoreSnapshot) {
  var removedScoreRow = htmlForPath[scoreSnapshot.key];
  removedScoreRow.remove();
  delete htmlForPath[scoreSnapshot.key];
}
/*=====  End of Update & Display Leaderboard  ======*/

/*================================================
=            Full Leaderboard Display            =
================================================*/
// Get Full Leaderboard on click
$("#fullLeaderboardLink").click(function() {
  fb_leaderboardFull();
});

/**
 * Returns the full leaderboard results
 */
function fb_leaderboardFull() {
  $("#leaderboardTableFull").empty(); // Clear table of previous results

  // Get scores ordered by priority (score)
  firebase.database().ref("scoreList").orderByPriority().once("value").then(function(snapshot) {
    $.each(snapshot.val(), function(child_id,child_value) {
      var name = snapshot.child(child_id).child("name").val(); // Player's name
      var score = snapshot.child(child_id).child("score").val(); // Player's score
      var newScoreRow = $("<tr/>");
      newScoreRow.append($("<td/>").append($("<em/>").text(name)));
      newScoreRow.append($("<td/>").text(score));

      $("#leaderboardTableFull").prepend(newScoreRow); // Add new row to table, builds from lowest to highest score
    });
  });
};
/*=====  End of Full Leaderboard Display  ======*/

/*====================================================
=            Leaderboard Helper Functions            =
====================================================*/
/**
 * getOrdinal returns the ordinal suffix for a given number
 * @param  {int} n    The number
 * @return {string}   The number plus ordinal suffix (ex: 1st, 2nd, 3rd)
 */
function getOrdinal(n) {
  var s=["th","st","nd","rd"],
  v=n%100;
  return n+(s[(v-20)%10]||s[v]||s[0]);
};
/*=====  End of Leaderboard Helper Functions  ======*/