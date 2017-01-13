/* jshint esversion: 6 */
var express = require('express'),
    _ = require('lodash'),
    cache = require('memory-cache'),
    router = express.Router(),
    trello = require('../utils/trello'),
    config = require('../config'),
    logger = console,
    todoRe = /^\s*\(([\?0-9]+)\)/,
    doingRe = /\[(\d+)\]\s*$/,
    CACHE_TIME = 60000;

router.get('/', function(req, res, next) {
    res.send('ok');
});

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
        match,
        cachedAction;

    // Do not process own actions
    if (trello.me && trello.me.id === action.idMemberCreator) {
        logger.log('skip own action');
        res.send('ok');
        return;
    }

    if (actionType === 'updateCard' && actionData.listAfter) {
        logger.log('onCardMove');
        onCardMove(action);
    } else if (actionType === 'moveCardFromBoard') {
        logger.log('moveCardFromBoard');

        action = cache.get(actionData.card.id) || action;
        action.data.listBefore = actionData.list;
        action.data.boardSource = actionData.board;

        onCardMoveBetweenBoards(action);
    } else if (actionType === 'moveCardToBoard') {
        logger.log('moveCardToBoard');

        action = cache.get(actionData.card.id) || action;
        action.data.listAfter = actionData.list;

        onCardMoveBetweenBoards(action);
    }

    res.send('ok');
});

function onCardMoveBetweenBoards(action) {
    var cardId = action.data.card.id;

    if (action.data.listAfter && action.data.listBefore) {
        logger.log('processing cached item', action);

        cache.del(cardId);
        onCardMove(action);
    } else {
        logger.log('put action to cache');
        cache.put(cardId, action, CACHE_TIME);
    }
}

/**
 * Listener to card move action
 *
 * @param {Object} action - performed action
 */
function onCardMove(action) {
    var actionData = action.data,
        card = actionData.card,
        cardId = card.id,
        username = action.memberCreator.username,
        match,
        updateFields = { idList: actionData.listBefore.id };

    if (actionData.boardSource) {
        updateFields.idBoard = actionData.boardSource.id;
    }

    // watch cards moved TO list name which contains the string "To Do"
    if (actionData.listAfter.name.includes('To Do')) {
        match = card.name.match(todoRe);

        // if card subject doesnt start with '(N)' where N is either the character '?' or a number less than 80
        // move it back to the originating list
        if (!match || match[1] !== '?' && parseInt(match[1], 10) < 80) {
            logger.log('moving card back from TODO list');

            trello.updateCardFields(cardId, updateFields)
                .then(function() {
                    trello.updateCard(cardId, 'pos', 0.1);
                    trello.addCommentToCard(
                            cardId,
                            `@${ username } Invalid move operation, missing point estimate.`);
                });

            return;
        }
    }

    // watch cards moved FROM list name which contains the string "Doing"
    if (actionData.listBefore.name.includes('Doing')) {
        match = card.name.match(doingRe);

        // if card subject doesnt end with '[N]' where N is a number, move it back to the originating list
        if (!match || parseInt(match[1], 10) < Number.MIN_VALUE) {
            logger.log('moving card back to Doing list');

            trello.updateCardFields(cardId, updateFields)
                .then(function() {
                    trello.updateCard(cardId, 'pos', 0.1);
                    trello.addCommentToCard(
                            cardId,
                            `@${ username } Invalid move operation, missing consumed points.`);
                });

            return;
        }
    }
}

module.exports = router;
