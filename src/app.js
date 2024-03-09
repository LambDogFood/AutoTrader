require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const { LongShortBot, bots } = require('./Bot/bot.js');

const app = express();
const PORT = process.env.PORT || 3000;
const profilesPath = path.join(__dirname, '../profiles.json');

app.use(bodyParser.json());

app.get('/api/data/:accountName', (req, res) => {
  const accountName = req.params.accountName;

  if (!bots[accountName]) {
    return res.status(404).json({ error: `Account ${accountName} not found` });
  }

  const dataForWebPanel = bots[accountName].fetchRunDown();
  res.json(dataForWebPanel);
});

app.post('/api/shutdown/:accountName', (req, res) => {
  const accountName = req.params.accountName;

  if (!bots[accountName]) {
    return res.status(404).json({ error: `Account ${accountName} not found` });
  }

  // bots[accountName].shutdownBot(); [DEPRECATED]
  res.status(405).json({ error: 'Deprecated API' });
});

app.post('/api/create-bot', (req, res) => {
  try {
    const { apiKey, apiSecret, paper, accountName, stocks } = req.body;

    if (bots[accountName]) {
      return res.status(400).json({ error: `Account ${accountName} already exists` });
    }

    const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
    profiles.profiles[accountName] = { apiKey, apiSecret, paper, stocks };

    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));

    const newBot = new LongShortBot(accountName);
    bots[accountName] = newBot;

    newBot.run()

    res.json({ message: `Bot created for account ${accountName}` });
  } catch (error) {
    console.error('Error creating bot:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});