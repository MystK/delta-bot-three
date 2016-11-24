# DB3 - Delta Bot 3 [![Build Status](https://travis-ci.org/MystK/delta-bot-three.svg?branch=master)](https://travis-ci.org/MystK/delta-bot-three)
## Summary
The third rewrite of delta bot, created for reddit.com/r/changemyview. This bot will be written in NodeJS.

## Contributing
* Any contributions are much appreciated
* Please keep your commits specific to one task
* Put the issue number in your commit message if it is associated with one.
* Commit messages should follow the [AngularJS](https://github.com/angular/angular.js/blob/master/CONTRIBUTING.md#commit) commit guidelines
* Before submitting any pull request, ensure that `npm test` passes with no errors

### How to build
1. Download nvm. Mac/Linux: https://github.com/creationix/nvm Windows: https://github.com/coreybutler/nvm-windows/releases/download/1.1.1/nvm-setup.zip
1. `git clone https://github.com/MystK/delta-bot-three.git`
1. `cd delta-bot-three`
1. Mac/Linux: `nvm install` Windows: Look inside the .nvmrc folder to find the version. EX: 5.8.0 is the version. `nvm install 5.8.0 && nvm use 5.8.0`
1. Create a subreddit. after creation, ensure that "mod editing" for the subreddit's wiki is enabled, and make you bot account a moderator for the subreddit
1. Get a Reddit API key by going to https://www.reddit.com/prefs/apps/ => create another app => https://i.imgur.com/xMUa521.png
1. Create a `credentials.json` that looks like below
1. `npm install`
1. `npm run build`
1. `npm start` and it should work

#### credentials.json
````
{
  "username": "DeltaBot3",
  "password": "PASSWORDHERE",
  "clientID": "ebwS927PijoFvg",
  "clientSecret": "X3-3cVNFx3Nd8_NYUrOuvmaf7wM",
  "subreddit": "YOURnewSUBREDDIThere"
}
````

### A special thanks to everyone who contributed
_Please add yourself to this list if you've contributed:_
* [MystK](https://github.com/mystk)
* [roastchicken](https://github.com/roastchicken)
* [wyantb](https://github.com/wyantb)
* [stedop](https://github.com/stedop)

## Roadmap
### The first three months ✓
* ~~Rewrite what DeltaBot currently does and migrate all old data over.~~

### To-Do
* Have DeltaBot automatically rescan edited comments [#4](https://github.com/MystK/delta-bot-three/issues/4).
* Solve the missing deltas issue (Quick Fix: [#35](https://github.com/MystK/delta-bot-three/issues/35), Ideal Scenario: [#33](https://github.com/MystK/delta-bot-three/issues/33)).
* ~~Implement first-time-delta PMs [#14](https://github.com/MystK/delta-bot-three/issues/14).~~
* Yearly Deltaboard [#36](https://github.com/MystK/delta-bot-three/issues/36).
* All-Time Deltaboard [#34](https://github.com/MystK/delta-bot-three/issues/34).
* DeltaBot's Stickied Comment [#86](https://github.com/MystK/delta-bot-three/issues/86).
* Admin Interface [#38](https://github.com/MystK/delta-bot-three/issues/38).
* The remaining issues in any order: https://github.com/MystK/delta-bot-three/issues
