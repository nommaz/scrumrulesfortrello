/* jshint esversion: 6 */
var express = require('express'),
    _ = require('lodash'),
    restler = require('restler'),
    cache = require('memory-cache'),
    router = express.Router(),
    trello = require('../utils/trello'),
    config = require('../config'),
    slackWebhookUrl = config.slackWebhookUrl,
    greenLabelUrlPrefix = config.greenLabelUrlPrefix,
    logger = console,
    todoRe = /^\s*\(([\?\.0-9]+)\)/,
    doingRe = /\[(-?[\.0-9]+)\]\s*$/,
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
        //logger.log('skip own action');
        res.send('ok');
        return;
    }

    logger.log('action: ' + actionData );

    if (actionType === 'updateCard' && actionData.listAfter) {
        logger.log('onCardMove');
        onCardMove(action);
    } else if (actionType === 'updateCard' && _.get(actionData, 'old.closed') === false) {
        logger.log('cardArchived');
        onCardArchived(action);
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
    } else if (actionType === 'addLabelToCard') {
        logger.log('addLabelToCard');
        onAddLabelToCard(action);
    } else if (actionType === 'createCard') {
        logger.log('createCard');
        onCardCreate(action);
    }

    res.send('ok');
});

function onCardCreate(action) {
    var board = action.data.board;
    var list = action.data.list;
    var card = action.data.card;

    if (!list.name.includes("Backlog")) {
        trello.getLabelsForBoard(board.id).then(function(labels) {
            var label = _.find(labels, { color: null });

            return label || trello.addLabelOnBoard(board.id, '', null);
        }).then(function(label) {
            sendSlackMessage(`Card ${ trello.generateCardSlackLink(card) } created in list "${ list.name }"`);
            return trello.addLabelToCard(card.id, label.id);
        });
    }
}

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
        if (!match || match[1] !== '?' && parseInt(match[1], 10) > 80) {
           logger.log('moving card back from TODO list');

            trello.updateCardFields(cardId, updateFields)
                .then(function() {
                    trello.updateCard(cardId, 'pos', 0.1);
                    trello.addCommentToCard(
                            cardId,
                            `@${ username } Invalid move operation, missing point estimate.`);
                })
                .catch(function(reason) {
                    logger.error('Failed to move card from TODO list', reason);
                });

            return;
        }
    }

    // watch cards moved FROM list name which contains the string "Doing"
    if (actionData.listBefore.name.includes('Doing')) {
        match = card.name.match(doingRe);

        // if card subject doesnt end with '[N]' where N is a number, move it back to the originating list
        if (!match || parseFloat(match[1]) < 0) {
            logger.log('moving card back to Doing list');

            trello.updateCardFields(cardId, updateFields)
                .then(function() {
                    trello.updateCard(cardId, 'pos', 0.1);
                    trello.addCommentToCard(
                            cardId,
                            `@${ username } Invalid move operation, missing consumed points.`);
                })
                .catch(function(reason) {
                    logger.error('Failed to move card from TODO list', reason);
                });

            return;
        }
    }
}

/**
 * Listener to card archive action
 *
 * @param {Object} action - performed action
 */
function onCardArchived(action) {
    var card = action.data.card;
    sendSlackMessage(`Card ${ trello.generateCardSlackLink(card) } was archived`);
}

/**
 * Listener to card label addition
 *
 * @param {Object} action - performed action
 */
function onAddLabelToCard(action) {
    var board = action.data.board;
    var card = action.data.card;
    var label = action.data.label;

    var cardId = encodeURIComponent(card.id),
        cardTitle = encodeURIComponent(card.name),
        boardName = encodeURIComponent(board.name);

    if (greenLabelUrlPrefix && label.color === 'green') {
        restler.get(`${ greenLabelUrlPrefix }&cardId=${ cardId }&cardTitle=${ cardTitle }&boardName=${ boardName }`);
    }
}

/**
 * Sends message to slack
 *
 * @param {String} msg - message
 */
function sendSlackMessage(msg) {
    if (slackWebhookUrl) {
        restler.postJson(slackWebhookUrl, { text: msg });
    }
}

module.exports = router;
