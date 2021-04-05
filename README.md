# DB3 - Delta Bot 3 [![Build Status](https://travis-ci.org/MystK/delta-bot-three.svg?branch=master)](https://travis-ci.org/MystK/delta-bot-three)
## Summary
The third rewrite of DeltaBot, created for [reddit.com/r/changemyview](https://www.reddit.com/r/changemyview). This bot will run CMV's [delta system](https://www.reddit.com/r/changemyview/wiki/deltasystem), and is written in NodeJS.

## Contributing
* Any contributions are much appreciated.
* If there is an issue you plan to work on, please comment on it and we'll add the "in progress" label to prevent double work.
* Please keep your commits specific to one task.
* Put the issue number in your commit message if it is associated with one.
* Commit messages should follow the [Angular](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#-commit-message-guidelines) commit guidelines.
* Before submitting any pull request, ensure that `npm test` passes with no errors.
* We have a slack chat (deltabotdevs.slack.com). You're welcome to join us by signing up here: https://deltabotdevs.signup.team

## <a name="commit"></a> Commit Message Guidelines

We have very precise rules over how our git commit messages can be formatted.  This leads to **more
readable messages** that are easy to follow when looking through the **project history**.

### Commit Message Format
Each commit message consists of a **header**, a **body** and a **footer**.  The header has a special
format that includes a **type**, a **scope** and a **subject**:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory and the **scope** of the header is optional.

Any line of the commit message cannot be longer 100 characters! This allows the message to be easier
to read on GitHub as well as in various git tools.

Footer should contain a [closing reference to an issue](https://help.github.com/articles/closing-issues-via-commit-messages/) if any.

Samples: (even more [samples](https://github.com/angular/angular/commits/master))

```
docs(changelog): update change log to beta.5
```
```
fix(release): need to depend on latest rxjs and zone.js

The version in our package.json gets copied to the one we publish, and users need the latest of these.
```

### Revert
If the commit reverts a previous commit, it should begin with `revert: `, followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted.

### Type
Must be one of the following:

* **build**: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
* **ci**: Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
* **docs**: Documentation only changes
* **feat**: A new feature
* **fix**: A bug fix
* **perf**: A code change that improves performance
* **refactor**: A code change that neither fixes a bug nor adds a feature
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
* **test**: Adding missing tests or correcting existing tests

### How to build
1. Download nvm. Mac/Linux: https://github.com/creationix/nvm Windows: https://github.com/coreybutler/nvm-windows/releases/download/1.1.1/nvm-setup.zip
1. `git clone https://github.com/MystK/delta-bot-three.git`
1. `cd delta-bot-three`
1. Mac/Linux: `nvm install` Windows: Look inside the .nvmrc folder to find the version. EX: 5.8.0 is the version. `nvm install 5.8.0 && nvm use 5.8.0`
1. Create a subreddit. After creation, ensure that "mod editing" for the subreddit's wiki is enabled, and make your bot account a moderator for the subreddit.
1. Get a Reddit API key by going to https://www.reddit.com/prefs/apps/ => create another app => https://i.imgur.com/xMUa521.png. The bot account be a developer of the app.
1. Create a `credentials.json` that looks like below in `./config/credentials` folder.
1. Create a `config.json` that looks like below in `./config` folder.
1. `npm i`
1. Run `npm run start-debug` or `npm start` and it should work.

#### credentials.json (example)
````
{
  "username": "DeltaBot3",
  "password": "PASSWORDHERE",
  "clientID": "CLIENTID",
  "clientSecret": "CLIENTSECRET",
}
````

#### config.json (example)
````
{
  "subreddit": "YOURnewSUBREDDIThere",
  "deltaLogSubreddit": "YOUR_DEVELOPMENT_DELTALOG_SUBREDDIT_HERE",

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
* [yleong](https://github.com/yleong)
* [hallidev](https://github.com/hallidev)

## Roadmap
### The first three months ✓
- [x] Rewrite what DeltaBot currently does and migrate all old data over.

### To-Do
- [x] Make DeltaBot automatically rescan edited comments [#4](https://github.com/MystK/delta-bot-three/issues/4).
- [x] Act on edits made within 3 minutes of commenting [#139](https://github.com/MystK/delta-bot-three/issues/139).
- [ ] Solve the missing deltas issue [#119](https://github.com/MystK/delta-bot-three/issues/119).
- [x] Implement first-time-delta PMs [#14](https://github.com/MystK/delta-bot-three/issues/14).
- [x] Yearly Deltaboard [#36](https://github.com/MystK/delta-bot-three/issues/36).
- [ ] All-Time Deltaboard [#34](https://github.com/MystK/delta-bot-three/issues/34).
- [x] /r/DeltaLog [#17](https://github.com/MystK/delta-bot-three/issues/17).
- [x] DeltaBot's Stickied Comment [#89](https://github.com/MystK/delta-bot-three/issues/89).
- [ ] Admin Interface [#38](https://github.com/MystK/delta-bot-three/issues/38).
- [ ] The remaining issues in any order: https://github.com/MystK/delta-bot-three/issues
