// LordDogFood

const { LongShortBot } = require('./Strategies/LongShortBot');
const { getTraderProfile } = require('../Utilities/traderStore');

const activeTraders= {};

function newTrader(traderName, willRun = true) {
    const traderProfile = getTraderProfile(traderName);

    if (!traderProfile) {
        console.error(`Trader ${traderName} does not exist.`);
        return null;
    }

    if (activeTraders[traderName]) {
        console.warn(`Trader ${traderName} already exists.`);
        return activeTraders[traderName];
    }

    let trader = null;

    if (traderProfile.strategy === "LongShort") {
        trader = new LongShortBot(
            traderProfile.apiKey,
            traderProfile.apiSecret,
            traderProfile.paper,
            traderProfile.symbols
        );
    }

    if (!trader) {
        console.error(`Failed to create ${traderName}`);
        return null;
    }

    activeTraders[traderName] = trader;

    if (willRun) {
        trader.run();
    }

    return trader;
}

function killTrader(traderName) {
    const trader = activeTraders[traderName];
    if (!trader) {
        console.error(`Trader ${traderName} does not exist.`);
        return;
    }

    trader.stop();
    delete activeTraders[traderName];
}

function initStoredTraders() {
    const profiles = getTraderProfile();

    console.log(profiles);

    for (const traderName in profiles) {
        try {
            newTrader(traderName);
        } catch (error) {
            console.error(`Failed to initialize trader ${traderName}:`, error);
        }
    }
}
initStoredTraders();

module.exports = { newTrader, killTrader, activeTraders }