import Botkit from 'botkit';
import async from 'async';

/*
TODO: Pick list for operation
TODO: Set default list
TODO: Delete individual item
*/

start(process.env.token);

function start(token) {
    let controller = Botkit.slackbot({
        json_file_store: 'storage'
    });

    connectToSlack(controller.spawn({
        token
    }), (err, bot, payload) => {
        if (err) {
            throw new Error('Unable to connect to Slack!');
        }

        listenForMessages(controller, payload.team.id);
    });
}

function connectToSlack(bot, callback) {
    bot.startRTM(callback);
}

function listenForMessages(controller, teamId) {
    listenForRemember(controller, teamId);
    listenForRecall(controller, teamId);
    listenForClear(controller, teamId);
    listenForDefault(controller);
}

function listenForDefault(controller) {
    controller.on(['direct_message', 'direct_mention'], (bot, message) => {
        bot.reply(
            message,
            'I am retrobot! I\'m here to help the team remember stuff. I respond to the following:\n' +
                '*halp:* This message\n' +
                '*remember|save|record <something>:* Remembers the text "something" into the list\n' +
                '*recall|show:* Show the items on the list\n' +
                '*clear|empty list*: Confirms and empties the list'
        );
    });
}

function listenForRecall(controller, teamId) {
    controller.hears(['^(?:Recall|Show)$'], ['direct_message', 'direct_mention'], (bot, message) => {
        let listName = 'retrospectives';

        readStorageByTeamId(controller, teamId, (err, storage) => {
            let list = storage[listName] || [];
            let messages = list.map((messageText, index) => `  ${index + 1}. ${messageText}`);
            messages.unshift(`*${listName}*:`);
            let messageGlob = messages.join('\n');

            bot.reply(message, messageGlob);
        });
    });
}

function listenForRemember(controller, teamId) {
    controller.hears(['^(?:Remember|Save|Record) (.*)$'], ['direct_message', 'direct_mention'], (bot, message) => {
        let itemText = getItemTextFromRememberMessage(message);
        let listName = 'retrospectives';

        saveItemForList(controller, teamId, itemText, listName, (err, success) => {
            if (err) {
                console.log('saveItemForList error', err);
                replyForItemAddFailed(bot, message, listName, itemText);
            } else {
                replyForItemAdded(bot, message, listName, itemText);
            }
        });
    });
}

function listenForClear(controller, teamId) {
    controller.hears(['^(?:Clear|Empty)$'], ['direct_message', 'direct_mention'], (bot, message) => {
        let listName = 'retrospectives';

        clearItemsFromList(controller, teamId, listName, (err, success) => {
            if (err) {
                console.log('clearItemsFromList error', err);
                replyForClearItemsFailed(bot, message, listName);
            } else {
                replyForItemsCleared(bot, message, listName);
            }
        });
    });
}

function getItemTextFromRememberMessage(message) {
    try {
        return message.match[1];
    } catch(e) {
        return '';
    }
}

function replyForItemAdded(bot, message, listName, itemText) {
    bot.reply(message, `"${itemText}" was added to list "${listName}"!`);
}

function replyForItemAddFailed(bot, message, listName, itemText) {
    bot.reply(message, `Sorry, something went wrong and "${itemText}" couldn\'t be added to list "${listName}"`);
}

function replyForClearItemsFailed(bot, message, listName) {
    bot.reply(message, `Sorry, something went wrong and list "${listName}" could not be cleared!`);
}

function replyForItemsCleared(bot, message, listName) {
    bot.reply(message, `List "${listName}" was cleared!`);
}

function saveItemForList(controller, teamId, itemText, listName, callback) {
    async.waterfall([
        async.apply(readStorageByTeamId, controller, teamId),

        function saveItemIntoListIntoStorage(storage, cb) {
            let list = storage[listName] || [];

            controller.storage.teams.save({
                ...storage,
                [listName]: [
                    ...list,
                    itemText
                ]
            }, cb);
        }
    ], callback);
}

function readStorageByTeamId(controller, teamId, cb) {
    controller.storage.teams.get(teamId, (err, storage) => {
        if (err) {
            // If there's a read error, try to initialize the team storage
            controller.storage.teams.save({
                id: teamId
            }, () => {
                readStorageByTeamId(controller, teamId, cb);
            });
        } else {
            cb(null, storage);
        }
    });
}

function clearItemsFromList(controller, teamId, listName, callback) {
    async.waterfall([
        async.apply(readStorageByTeamId, controller, teamId),

        function saveItemIntoListIntoStorage(storage, cb) {
            if (storage[listName]) {
                delete storage[listName];
                controller.storage.teams.save(storage, cb);
            } else {
                cb(`${listName} does not exist in storage`);
            }
        }
    ], callback);
}
