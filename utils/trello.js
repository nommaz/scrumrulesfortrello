var Trello = new require("trello"),
    _ = require('lodash'),
    logger = console,
    Promise = require('bluebird'),
    config = require('../config'),
    trello = new Trello(config.appKey, config.userToken);

/**
 * Basic trello function to init initial properties for trello
 */
trello.init = function() {
    // cache own profile
    trello.getMember('me')
        .then(function(member) {
            trello.me = member;
        });
};

module.exports = trello;
