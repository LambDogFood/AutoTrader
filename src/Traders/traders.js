const { LongShortService } = require('./Strategies/LongShort');
const { getTraderProfile } = require('../Accounts/TraderStore');
const { MeanReversionService } = require('./Strategies/MeanReversion');

const activeTraders = {};
 
async function newTrader(traderName, willRun=true) {
    const traderProfile = await getTraderProfile(traderName);

    if (!traderProfile) {
        console.error(`Trader ${traderName} does not exist.`);
        return null;
    }

    if (activeTraders[traderName]) {
        console.warn(`Trader ${traderName} already exists.`);
        return activeTraders[traderName];
    }

    let trader = createTraderInstance(traderProfile);

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

    delete activeTraders[traderName];
}

async function initStoredTraders() {
    const profiles = await getTraderProfile();

    for (const traderName in profiles) {
        try {
            newTrader(traderName);
        } catch (error) {
            console.error(`Failed to initialize trader ${traderName}:`, error);
        }
    }
}
initStoredTraders();

function createTraderInstance(traderProfile) {
    switch (traderProfile.strategy) {
        case "LongShort":
            return new LongShortService(
                traderProfile.apiKey,
                traderProfile.apiSecret,
                traderProfile.paper,
                traderProfile.symbols,
                traderProfile.bucketPct,
            );
        case "MeanReversion":
            return new MeanReversionService(
                traderProfile.apiKey,
                traderProfile.apiSecret,
                traderProfile.paper,
                traderProfile.symbols
            )  
        default:
            console.error(`Unknown strategy ${traderProfile.strategy} for trader ${traderProfile.name}`);
            return null;
    }
}

module.exports = { newTrader, killTrader, activeTraders };
