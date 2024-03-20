const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');

dotenv.config();

const profilesPath = path.join(__dirname, './traders.json');

async function readTraderProfiles() {
    try {
        const jsonData = await fs.readFile(profilesPath, 'utf8');
        return JSON.parse(jsonData).traders;
    } catch (error) {
        console.error('Error reading profiles.json:', error.message);
        throw error;
    }
}

async function writeTraderProfiles(profiles) {
    try {
        await fs.writeFile(profilesPath, JSON.stringify({ traders: profiles }, null, 2));
    } catch (error) {
        console.error('Error writing profiles.json:', error.message);
        throw error;
    }
}

function getTraderProfile(traderName) {
    return readTraderProfiles()
        .then(traders => {
            if (!traderName) {
                return traders;
            }
            return traders[traderName];
        })
        .catch(error => {
            console.error('Error retrieving trader profile:', error.message);
            return null;
        });
}

async function newProfile(traderName, strategy, apiKey, apiSecret, symbols, paper) {
    let profiles;
    try {
        profiles = await readTraderProfiles();
        if (profiles[traderName]) {
            console.warn(`Warning: Cannot create profile, ${traderName} already exists.`);
            return false;
        }
        profiles[traderName] = { strategy, apiKey, apiSecret, paper, symbols };
        await writeTraderProfiles(profiles);
        return true;
    } catch (error) {
        console.error('Error creating new profile:', error.message);
        return false;
    }
}

async function removeProfile(traderName) {
    try {
        const profiles = await readTraderProfiles();
        if (!profiles[traderName]) {
            console.error('Unable to remove non-existing profile:', traderName);
            return false;
        }
        delete profiles[traderName];
        await writeTraderProfiles(profiles);
        console.log(`Profile "${traderName}" removed successfully.`);
        return true;
    } catch (error) {
        console.error('Error removing profile:', error.message);
        return false;
    }
}

module.exports = { getTraderProfile, newProfile, removeProfile };
