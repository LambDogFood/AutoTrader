// LordDogFood

const path = require('path');
const fs = require('fs');

const profilesPath = path.join(__dirname, './profiles.json');

function getProfiles(accountName=null) {
  try {
    const JSONdata = fs.readFileSync(profilesPath, 'utf8');
    const data = JSON.parse(JSONdata)

    if (!accountName) {
      return data.profiles;
    }
    return data.profiles[accountName];

  } catch (error) {
    console.error('Error reading profiles.json:', error.message);
    process.exit(1);
  }
}

function newProfile(accountName, apiKey, apiSecret, symbols, paper) {
  const profiles = getProfiles();
  
  if (profiles[accountName]) {
    console.warn(`Warning: Cannot create profile, ${accountName} already exists.`)
    process.exit(1);
  }

  try { 
    profiles[accountName] = { apiKey, apiSecret, paper, symbols };
    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));

    return true

  } catch (error) {
    console.error('Error writing profiles.json:', error.message);
    process.exit(1);
  }
}

function removeProfile(accountName) {
  const profiles = getProfiles();

  if (!profiles.profiles[accountName]) {
    console.error('Unable to remove non-existing profile:', accountName);
    process.exit(1);
  }

  delete profiles.profiles[accountName];

  try {
    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
    console.log(`Profile "${accountName}" removed successfully.`);

    return true
    
  } catch (error) {
    console.error('Error writing profiles.json:', error.message);
    process.exit(1);
  }
}

module.exports = { getProfiles, newProfile, removeProfile };
