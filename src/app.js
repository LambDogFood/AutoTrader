require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { newProfile, getProfiles } = require('./Utilities/profiles.js')
const { activeTraders, newTrader } = require('./Bot/trader.js')

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());  // Enable CORS for all routes
app.use(bodyParser.json());

app.get('/api/data/:accountName', (req, res) => {
  const accountName = req.params.accountName;

  if (!activeTraders[accountName]) {
    return res.status(404).json({ error: `Account ${accountName} not found` });
  }

  const dataForWebPanel = activeTraders[accountName].fetchRunDown();
  res.json(dataForWebPanel);
});

app.get('/api/profiles', (req, res) => {
  const profiles = getProfiles();
  const temp = [];

  for (const acountName in profiles) {
    temp.push[{acountName: acountName}];
  }

  res.json(profiles)
})

app.post('/api/shutdown/:accountName', (req, res) => {
  const accountName = req.params.accountName;

  if (!activeTraders[accountName]) {
    return res.status(404).json({ error: `Account ${accountName} not found` });
  }

  activeTraders[accountName].stop();
  res.json({message: "Successfully shutdown bot."});
});

app.post('/api/start/:accountName', (req, res) => {
  const accountName = req.params.accountName;

  if (!getProfiles(accountName)) {
    return res.status(404).json({ error: `Account ${accountName} not found` });
  }

  var trader = activeTraders[accountName]
  if (!trader) { 
    newTrader(accountName);
  } else {
  
    if (!activeTraders[accountName].running) {
      activeTraders[accountName].run()
    }

  }

  res.json({message: "Successfully started bot."});
})

app.post('/api/create-bot', (req, res) => {

  const { accountName, apiKey, apiSecret, paper, symbols } = req.body;

  var result = newProfile(accountName, apiKey, apiSecret, symbols, paper)
  if (result === true) {
    newTrader(accountName);
  } else {
    console.error('Error creating bot:', error.message);
    res.status(500).json({error: 'Internal Server Error'});
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});