# DB3 - Delta Bot 3 [![Build Status](https://travis-ci.org/MystK/delta-bot-three.svg?branch=master)](https://travis-ci.org/MystK/delta-bot-three)
## Summary
The third rewrite of delta bot, created for [reddit.com/r/changemyview](https://www.reddit.com/r/changemyview). This bot will be written in NodeJS.

## Contributing
* Any contributions are much appreciated.
* If there is an issue you plan to work on, please comment on it and we'll add the "in progress" label to prevent double work.
* Please keep your commits specific to one task.
* Put the issue number in your commit message if it is associated with one.
* Commit messages should follow the [AngularJS](https://github.com/angular/angular.js/blob/master/CONTRIBUTING.md#commit) commit guidelines.
* Before submitting any pull request, ensure that `npm test` passes with no errors.
* We have a slack chat (deltabotdevs.slack.com). You're welcome to join us by signing up here: https://deltabotdevs.signup.team

### How to build
1. Download nvm. Mac/Linux: https://github.com/creationix/nvm Windows: https://github.com/coreybutler/nvm-windows/releases/download/1.1.1/nvm-setup.zip
1. `git clone https://github.com/MystK/delta-bot-three.git`
1. `cd delta-bot-three`
1. Mac/Linux: `nvm install` Windows: Look inside the .nvmrc folder to find the version. EX: 5.8.0 is the version. `nvm install 5.8.0 && nvm use 5.8.0`
1. Create a subreddit. After creation, ensure that "mod editing" for the subreddit's wiki is enabled, and make your bot account a moderator for the subreddit.
1. Get a Reddit API key by going to https://www.reddit.com/prefs/apps/ => create another app => https://i.imgur.com/xMUa521.png
1. Create a `credentials.json` that looks like below in `./config/credentials` folder.
1. `npm install -g yarn` && `yarn`
1. Run `yarn run start-debug` or `yarn start` and it should work.

#### credentials.json (example)
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
* [wyantb](https://github.com/wyantb)
* [RaoulMeyer](https://github.com/RaoulMeyer)
* [roastchicken](https://github.com/roastchicken)
* [stedop](https://github.com/stedop)
* [beasta](https://github.com/beasta)
* [arswaw](https://github.com/arswaw)

## Roadmap
### The first three months ✓
- [x] Rewrite what DeltaBot currently does and migrate all old data over.

### To-Do
- [x] Make DeltaBot automatically rescan edited comments [#4](https://github.com/MystK/delta-bot-three/issues/4).
- [ ] Act on edits made within 3 minutes of commenting [#139](https://github.com/MystK/delta-bot-three/issues/139).
- [ ] Solve the missing deltas issue [#119](https://github.com/MystK/delta-bot-three/issues/119).
- [x] Implement first-time-delta PMs [#14](https://github.com/MystK/delta-bot-three/issues/14).
- [x] Yearly Deltaboard [#36](https://github.com/MystK/delta-bot-three/issues/36).
- [ ] All-Time Deltaboard [#34](https://github.com/MystK/delta-bot-three/issues/34).
- [x] /r/DeltaLog [#17](https://github.com/MystK/delta-bot-three/issues/17).
- [x] DeltaBot's Stickied Comment [#89](https://github.com/MystK/delta-bot-three/issues/89).
- [ ] Admin Interface [#38](https://github.com/MystK/delta-bot-three/issues/38).
- [ ] The remaining issues in any order: https://github.com/MystK/delta-bot-three/issues
