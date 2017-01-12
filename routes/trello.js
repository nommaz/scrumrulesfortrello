/* jshint esversion: 6 */
var express = require('express'),
    _ = require('lodash'),
    router = express.Router(),
    trello = require('../utils/trello'),
    config = require('../config'),
    logger = console,
    todoRe = /^\s*\(([\?0-9]+)\)/,
    doingRe = /\[(\d+)\]\s*$/;

// update webhooks
router.get('/updateWebhooks', function(req, res, next) {
    trello.getBoards('me').then(function(boards) {
        var boardList = _.compact(_.map(boards, function(board) {
            return {
                id: board.id,
                name: board.name,
                shortLink: board.shortLink
            };
        }));

        _.each(boardList, function(board) {
            logger.info('adding webhook to', board.id);
            trello.addWebhook('webhook', `${ config.origin }/trello`, board.id);
        });
    });

    res.send('updating subscriptions');
});

// listen for webhooks
router.post('/', function(req, res, next) {
    var action = req.body.action,
        actionType = action.type,
        actionData = action.data,
        match;

    // Do not process own actions
    if (trello.me && trello.me.id === action.idMemberCreator) {
        return;
    }

    if (actionType === 'updateCard' && actionData.listAfter) {
        onCardMove(action);
    } else if (actionType === 'moveCardFromBoard') {
        // TODO
        console.log('moveCardFromBoard');
        console.log(body);
    }

    res.send('ok');
});

/**
 * Listener to card move action
 *
 * @param {Object} action - performed action
 */
function onCardMove(action) {
    var actionData = action.data,
        card = actionData.card,
        shortLink = card.shortLink,
        match;

    // watch cards moved TO list name which contains the string "To Do"
    if (actionData.listAfter.name.includes('To Do')) {
        match = card.name.match(todoRe);

        // if card subject doesnt start with '(N)' where N is either the character '?' or a number less than 80
        // move it back to the originating list
        if (!match || match[1] !== '?' && parseInt(match[1], 10) < 80) {
            // moving card back to list
            trello.updateCardList(shortLink, actionData.listBefore.id)
                .then(function() {
                    trello.addCommentToCard(
                            shortLink,
                            `@${ action.memberCreator.username } Invalid move operation, missing point estimate.`);
                });

            return;
        }
    }

    // watch cards moved FROM list name which contains the string "Doing"
    if (actionData.listBefore.name.includes('Doing')) {
        match = card.name.match(doingRe);

        // if card subject doesnt end with '[N]' where N is a number, move it back to the originating list
        if (!match || parseInt(match[1], 10) < Number.MIN_VALUE) {
            trello.updateCardList(shortLink, actionData.listBefore.id)
                .then(function() {
                    trello.addCommentToCard(
                            shortLink,
                            `@${ action.memberCreator.username } Invalid move operation, missing consumed points.`);
                });

            return;
        }
    }
}

module.exports = router;
