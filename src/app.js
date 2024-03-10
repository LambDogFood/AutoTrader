require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const { newProfile, getProfiles } = require('./Utilities/profiles.js')
const { activeTraders, newTrader } = require('./Bot/trader.js');
const { profileEnd } = require('console');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors());
app.use(bodyParser.json());

// Website views
app.get('/dashboard', async (req, res) => {
  try {
    const profiles = await getProfiles();
    res.render('dashboard', { botProfiles: profiles });
  } catch (error) {
    console.error('Error fetching bot profiles:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Api
app.get('/api/settings/:accountName', (req, res) => {
  const accountName = req.params.accountName;
  const profile = getProfiles(accountName);
  res.json(profile)
});

app.get('/api/data/:accountName', (req, res) => {
  const accountName = req.params.accountName;

  if (!activeTraders[accountName]) {
    return res.status(404).json({ error: `Account ${accountName} not found` });
  }

  const dataForWebPanel = activeTraders[accountName].fetchRunDown();
  res.json(dataForWebPanel);
});

app.get('/api/status/:accountName', (req, res) => {
  const accountName = req.params.accountName;

  if (!activeTraders[accountName]) {
    return res.status(404).json({ error: `Account ${accountName} not found` });
  }

  const status = activeTraders[accountName].status || "Unknown";
  res.json({ status });
});

app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = await getProfiles();
    const temp = [];

    for (const accountName in profiles) {
      temp.push({ accountName: accountName });
    }

    res.json(temp);
  } catch (error) {
    console.error('Error fetching bot profiles:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

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