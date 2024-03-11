// LordDogFood

const path = require('path');
const fs = require('fs');

const profilesPath = path.join(__dirname, './traders.json');

function getTraderProfile(traderName) {
  try {
    const jsonData = fs.readFileSync(profilesPath, 'utf8');
    const data = JSON.parse(jsonData);

    if (!traderName) {
      return data.traders;
    }

    return data.traders[traderName]

  } catch (error) {
    console.error('Error reading profiles.json:', error.message);
  }
}

function newProfile(traderName, strategy, apiKey, apiSecret, symbols, paper) {
  const profiles = getTraderProfile();
  
  if (profiles[traderName]) {
    console.warn(`Warning: Cannot create profile, ${traderName} already exists.`)
    process.exit(1);
  }

  try { 
    profiles[traderName] = { strategy, apiKey, apiSecret, paper, symbols };
    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));

    return true

  } catch (error) {
    console.error('Error writing profiles.json:', error.message);
  }
}

function removeProfile(traderName) {
  const profiles = getTraderProfile();

  if (!profiles[traderName]) {
    console.error('Unable to remove non-existing profile:', accountName);
    process.exit(1);
  }

  delete profiles[traderName];

  try {
    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
    console.log(`Profile "${traderName}" removed successfully.`);

    return true
    
  } catch (error) {
    console.error('Error writing profiles.json:', error.message);
  }
}

module.exports = { getTraderProfile, newProfile, removeProfile };
