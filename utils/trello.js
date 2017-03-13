/* jshint esversion: 6 */
var Trello = new require("trello"),
    _ = require('lodash'),
    rest = require('restler');
    logger = console,
    config = require('../config'),
    trello = new Trello(config.appKey, config.userToken);

function makeRequest(fn, uri, options, callback) {
    if (callback) {
        fn(uri, options)
            .once('complete', function (result) {
               if (result instanceof Error) {
                    callback(result);
                } else {
                    callback(null, result);
                }
            });
    } else {
        return new Promise(function(resolve, reject) {
            fn(uri, options)
                .once('complete', function (result) {
                    if (result instanceof Error) {
                        reject(result);
                    } else {
                        resolve(result);
                    }
                });
        });
    }
}

trello.updateCardFields = function(cardId, fields, callback) {
    var query = this.createQuery();

    return makeRequest(rest.put, this.uri + '/1/cards/' + cardId + '/', { query: query, data: fields }, callback);
};

trello.generateCardSlackLink = function(card) {
    return `<https://trello.com/c/${ card.shortLink }|${ card.name }>`;
};

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
