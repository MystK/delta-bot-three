# DB3 - Delta Bot 3
## Summary
The third rewrite of delta bot. This bot will be written in NodeJS.

## Contributing
Any contributions are much appreciated. Please keep your PRs to 1 commit and put the issue number in the beginning of your commit message if it is associated with one.
### How to build
1. download nvm. Mac/Linux: https://github.com/creationix/nvm Windows: https://github.com/coreybutler/nvm-windows/releases/download/1.1.1/nvm-setup.zip
1. `git clone https://github.com/MystK/delta-bot-three.git`
1. `cd delta-bot-three`
1. Mac/Linux: `nvm install && nvm use ` Windows: Look inside the .nvmrc folder to find the version. EX: 5.8.0 is the version. `nvm install 5.8.0 && nvm use 5.8.0`
1. create a subreddit.  after creation, ensure that "mod editing" for the subreddit's wiki is enabled, and make you bot account a moderator for the subreddit
1. get a Reddit API key by going to https://www.reddit.com/prefs/apps/ => create another app => https://i.imgur.com/xMUa521.png
1. create a `credentials.json` that looks like below
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
_Please add yourself to this list if you've contributed content to this effort_
* @roastchicken

## Roadmap
### The first three months ✓
* Rewrite what DeltaBot currently does and migrate all old data over. ✓

### To-Do
* Have DeltaBot automatically rescan edited comments [#4](https://github.com/MystK/delta-bot-three/issues/4).
* Solve the missing deltas issue (Quick Fix: [#35](https://github.com/MystK/delta-bot-three/issues/35), Ideal Scenario: [#33](https://github.com/MystK/delta-bot-three/issues/33)).
* Implement first-time-delta PMs [#14](https://github.com/MystK/delta-bot-three/issues/14).
* Yearly Deltaboard [#36](https://github.com/MystK/delta-bot-three/issues/36).
* All-Time Deltaboard [#34](https://github.com/MystK/delta-bot-three/issues/34).
* Admin Interface [#38](https://github.com/MystK/delta-bot-three/issues/38).
* The remaining issues in any order: https://github.com/MystK/delta-bot-three/issues
