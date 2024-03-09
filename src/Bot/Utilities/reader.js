const fs = require('fs');

function loadConfig() {
  try {
    const data = fs.readFileSync('profiles.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading profiles.json:', error.message);
    process.exit(1);
  }
}

module.exports = { loadConfig };
