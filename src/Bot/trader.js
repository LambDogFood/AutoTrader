// LordDogFood

const { getProfiles } = require('../Utilities/profiles')
const { LongShortBot } = require('./LongShortBot')
const activeTraders = {}

function newTrader(accountName) {
    const newBot = new LongShortBot(accountName);
    newBot.run();

    activeTraders[accountName] = newBot;
    return newBot;
}

function initializeProfiles() {

    const profiles = getProfiles();
    for (var accountName in profiles) {
        console.log(accountName);
        newTrader(accountName);
    }

}; initializeProfiles();

module.exports = { newTrader, activeTraders }