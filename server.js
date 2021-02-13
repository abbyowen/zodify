/*
Author: Abby Owen, Dartmouth 2023

Purpose: zodify app: get songs to listen to from Spotify based off of your
daily horoscope

Date: February 2021
*/

// Require necessary modules
const fetch = require("node-fetch");
const btoa = require("btoa");
const express = require("express");
const cheerio = require('cheerio');
const cookieParser = require('cookie-parser');
var fs = require('fs');



// HTML to add to with API responses
var spot_res_page = cheerio.load(fs.readFileSync(__dirname + '/callback.html'));

// Zodiac sign node package
const zodiacSign = require('zodiac-signs')('en-US');

const app = express();

// Spotify Credentials
var spot_clientId = "e84e8a4f8df044d994aba8c62c0e1ae8";
var spot_clientSecret = "354e8292b27445c5a2c85b9978d66906";
var redirect_uri = "http://localhost:5000/callback";

//Local testing callback: "http://localhost:5000/callback";
// Heroku callback: "https://zodify.herokuapp.com/callback"

// IBM Credentials
var ibm_api_key = "I4jCw7OGQa0_u-cg-uMp0Ghd12v8vxROdhonVAUxqab3";
var ibm_url = "https://api.eu-gb.tone-analyzer.watson.cloud.ibm.com/instances/abd0e9fe-9a76-44d6-8c82-ed27390ae6fe";

// IBM packages
const ToneAnalyzerV3 = require('ibm-watson/tone-analyzer/v3');
const { IamAuthenticator } = require('ibm-watson/auth');

// Tone Analyzer
const toneAnalyzer = new ToneAnalyzerV3({
  version: '2017-09-21',
  authenticator: new IamAuthenticator({
    apikey: ibm_api_key,
  }),
  serviceUrl: ibm_url,
});

// Log the request for song data in the console
app.use('/callback', function(req, res, next) {
  console.log(`Request for Spotify data recieved at ${Date.now()}`);
  next();
});

// Use cookie-parser
app.use(cookieParser());

// Get zodiac sign function
function getSign(month, day) {
  // Send month input to lower case
  var month_lower = month.toLowerCase();
  // Months object that corresponds month inputs to numbers
  var months = {
    'january':1,
    'february':2,
    'march':3,
    'april':4,
    'may':5,
    'june':6,
    'july':7,
    'august':8,
    'september':9,
    'october':10,
    'november':11,
    'december':12
  };
  // Birth date object
  var birth_date = {
    day: day,
    month: months[month_lower]
  }
  // Use zodiac library to get zodiac information from birth date object
  var zodiac = zodiacSign.getSignByDate(birth_date);
  console.log(zodiac);
  return zodiac;
}


/* Function used to classify tracks into 1 of the 7 emotion categories provided by
 the IBM watson Tone Analyzer API : anger, fear, joy, sadness, analytical,
 confident, tentative*/

/* Negative Emotions: anger, fear, sadness*/
/* Positive Emptions: joy, confident*/
/* Other: analytical, tentative*/

/* Function to analyze mood of the song based off of audio-features provided by
Spotify API
*/
async function soundMoodList(tracks, token, moods, res, song_location) {
  // Loop through user's top 50 tracks
  for (var i in tracks) {
    var id;
    var name;
    if (song_location=="liked_tracks") {
      // track ID to pass into audio analytics vall
      id = tracks[i].track.id;
      // track name
      name = tracks[i].track.name;
    }
    else if (song_location=="top_tracks") {
      id = tracks[i].id;

      name = tracks[i].name;
    }

    // Fetch audio features of each song
    await fetch(`https://api.spotify.com/v1/audio-features/${id}`, {
      headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'hi'
    }
  }).then(response => response.json()).then(function(song_data) {
      // Declare various componenets that will be used to analyze the song mood
      var danceability = song_data.danceability;
      var energy = song_data.energy;
      var acousticness = song_data.acousticness;
      var valence = song_data.valence;
      var mode = song_data.mode;

      // Return different moods based off of the values of these attributes
      if (danceability>0.4 && valence>0.5 && energy>0.5 && acousticness<0.5) {
        return {name: name, tone: "Joy"};
      }
      else if (danceability<0.5 && valence>0.5 && energy<0.5 && acousticness>0.5){
        return {name: name, tone: "Tentative"}
      }
      else if (danceability>0.5 && energy>0.4 && acousticness<0.3 && valence<0.5){
        return {name: name, tone: "Confident"}
      }
      else if (danceability<0.5 && energy<0.5 && acousticness<0.3 && valence<0.5 && mode==0){
        return {name: name, tone: "Anger"}
      }
      else if (danceability<0.7 && energy<0.5 && acousticness>0.5 && valence<0.5) {
        return {name: name, tone: "Sadness"}
      }
      else if (danceability<0.6 && valence>0.5) {
        return {name: name, tone: "Analytical"}
      }
      else {
        return {name: name, tone: "NOT YET SUPPORTED"};
      }

    }).then(data => {
      // Check if the song moods are in the horoscope moods
      if (moods.includes(data.tone)) {
        console.log(`match found: ${data.name}`);
        // Add song title to the HTML
        spot_res_page('#call_results').append(`<p>${data.name}</p>`);

      }
  });

  }
  // Send the HTML to the /horoscope route
  res.send(spot_res_page.html());
  console.log("done!");
}

// Render App Homepage
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

// Use URL encoded middleware necessary for tone analyzer API call
app.use(express.urlencoded({
  extended:true
}));

// Callback page when a user obtains an access code from spotify by logging in
app.get('/callback', function(req, res) {
  // Code exchanged from login
  var code = req.query.code;
  console.log(req.query.code);

  // B64 encode the client id and client secret
  var btoa_auth = btoa(`${spot_clientId}:${spot_clientSecret}`);

  // JSON body for request for access token
  var req_body = {
    "code": code,
    "redirect_uri": redirect_uri,
    "grant_type": "authorization_code"
  }

  // URL encode the request body to be compatible with "application/x-www-form-urlencoded"
  var formBody = []
  for (var item in req_body) {
    var encodedKey = encodeURIComponent(item);
    var encodedValue = encodeURIComponent(req_body[item]);
    formBody.push(encodedKey + "=" + encodedValue);
  }
  formBody = formBody.join("&");

  // GET request for api token
  fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa_auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formBody
  }).then(data => data.json()).then(function(response) {

    // Save the access token and refresh token into variables
    var accessToken = response.access_token;
    var refreshToken = response.refresh_token;

    // Log cookie to save the access token for later use
    res.cookie('spot_token', accessToken);
    console.log('Cookies: ', req.cookies);
    // Redirect to the page where output will be

    res.redirect('/horoscope');

  });
});

// Send form data (month and day) to the page to be used for the horoscope call
app.post('/horoscope', function(req, res) {
  // Log form input
  const mon = req.body.birth_month.split(" ").join("");
  const date = req.body.birth_date.split(" ").join("");
  const song_location = req.body.song_location;

  console.log(song_location);
  var url;
  var text;

  if (song_location=="liked_tracks") {
    url = `https://api.spotify.com/v1/me/tracks?limit=50`;
    text = 'out of your 50 most recently liked Spotify tracks, you probably should listen to these today...'
  }
  else if (song_location=="top_tracks") {
    url = `https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=50`;
    text = 'out of your 50 top tracks from the last 4 weeks, you probably should listen to these today...'
  }
  console.log(url);

  // Get sign
  var sign = getSign(mon, date);

  // Store zodiac name and emoji
  var zodiac = sign.name;
  var emoji = sign.symbol;

  // Get prediction from the aztro API
  fetch(`https://aztro.sameerkumar.website/?sign=${zodiac}&day=today`, {
    method: "POST"
  }).then(data => data.json()).then(function(response) {
    console.log(`div: ${spot_res_page('#call_results')}`);
    if (!spot_res_page('#call_results').is(':empty')) {
      console.log("not empty");
      spot_res_page('#call_results').empty();

      console.log(spot_res_page('#call_results').html());
    }

    // Store daily prediction
    var horoscope = response.description;
    // Add daily horoscope to the HTML body
    spot_res_page('#call_results').append(`<h4 id="sign">nice to meet you, ${zodiac}. my sources tell me that this is what you need to hear right now:</h4>`)
    spot_res_page('#call_results').append(`<p id="horoscope">${emoji} ${horoscope}</p>`);

    // IBM tone analyzer request body
    toneInput = {
      toneInput: {'text': horoscope},
      contentType: 'application/json',
    };

    // IBM tone analysis API call
    toneAnalyzer.tone(toneInput).then(function(response) {


      // Overall document tone response
      var doc_tone = response.result.document_tone.tones;
      // Sentence tone response
      var sent_tone = response.result.sentences_tone;
      // Keywords returned by the analyzer
      var keywords =[];
      // Add unique mood keywords to the list
      for (var tone in doc_tone) {
        keywords.push(doc_tone[tone].tone_name);
      }

      console.log(`flagged moods: ${keywords}`);

      // Add the mood data to HTML
      if (keywords.length > 1) {
        spot_res_page('#call_results').append(`<h3>your overall moods today are..</h3>`);
      }
      else {
        spot_res_page('#call_results').append(`<h3>your overall mood today is...</h3>`);
      }
      for (var word in keywords) {
        spot_res_page('#call_results').append(`<p class="mood">${keywords[word]}</p>`);

      }
    // Log the token
    console.log(req.cookies.spot_token);
    // Fetch user's top 50 songs
    fetch(url, {
      headers: {
        'Authorization': `Bearer ${req.cookies.spot_token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    }).then(data=>data.json()).then(function(response) {
      spot_res_page('#call_results').append(`<h3>${text}</h3>`);

      // Get horoscope moods from the resulting HTML page
      var moods = [];
      spot_res_page('#call_results').find('.mood').each(function(index, element) {
        moods.push(spot_res_page(element).text());
      });
      console.log(`horoscope moods: ${moods}`);
      console.log(`url: ${url}`);

      // Get tracks from the Spotify API response
      var tracks = response.items;
      console.log(tracks);
      // Return tracks and moods
      return {tracks: tracks, moods:moods};
    }).then(function(tracks) {
      if (tracks.moods.length>0) {
      // Call function to get moods of songs
        soundMoodList(tracks.tracks, req.cookies.spot_token, tracks.moods, res, song_location);
      }
      else {
        spot_res_page('#call_results').append(`<p>whoops, our analyzer can't tell what mood you are today. you're just too complex right now. can i suggest a podcast?</p>`);
        res.send(spot_res_page.html());
      }
      });
    });
  });
});

// Render /horoscope page
app.get('/horoscope', function(req, res) {
  res.sendFile(__dirname + '/callback.html');
})

// Redirect to Spotify login from the home page
app.get('/login', function(req, res) {
  var scopes = 'user-library-read user-top-read';
  return res.redirect('https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    '&client_id=' + spot_clientId +
    '&show_dialog=true'+
    (scopes ? '&scope=' + encodeURIComponent(scopes) : '') +
    '&redirect_uri=' + encodeURIComponent(redirect_uri));

});


app.listen(process.env.PORT || 5000, function () {
    console.log("Server is running");
});
