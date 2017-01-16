# scrumrulesfortrello
Ensure trello cards are assigned points by undo'ing invalid card moves

# setup
clone the code and run
```
npm install
```

you will need to create trello account which will be used for bot after that you'll need to get oauth tokens, create file `config.js` in project directory with the following content
```js
module.exports = {                                                                 
    appKey: '', // The key grabbed from this page https://trello.com/app-key                                    
    userToken: '', // Server token grabbed by allowing access on this page https://trello.com/1/authorize?expiration=never&scope=read,write,account&response_type=token&name=Server%20Token&key=531e6da2de91b424916fd59850d4adf8
    origin: '' // This will be origin of your server which bot use to add webhooks, e.g. http://example.com
};
```

now you can start server with
```
npm start
```

On the server [pm2](https://github.com/Unitech/pm2) is can be use to start the server. Basic configuration file can be look like this
```js
{
    "name": "scrumrulesfortrello",
    "script": "./bin/www"
}
```

after we save it as `app.json` we can start server `pm2 start app.json` or restart it with `pm2 stop app.json`
