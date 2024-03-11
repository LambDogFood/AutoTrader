/*
    Author: LordDogFood
    Written: 11/04/2023
*/

const bodyParser = require('body-parser');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const { getTraderProfile } = require('./Utilities/traderStore');
const { activeTraders, newTrader, killTrader } = require('./Traders/traders');

const PORT = process.env.PORT || 3000
const app = express();

app.use(express.urlencoded({extended: true}));
app.use(bodyParser.json());

/* Get requests */
app.get('/api/traders', (req, res) => {
    const profiles = getTraderProfile();
    res.json(JSON.stringify(profiles, null, 2))
});

app.get('/api/status/:traderName', (req, res) => { 
    const traderName = req.params.traderName;

    var data = {
        status: "Unknown",
        lastChecked: undefined,
    }

    const trader = activeTraders[traderName]
    if (trader) {
        data.status = trader.status,
        data.lastChecked = trader.lastUpdated
    }

    res.json(data)
});

app.get('/api/logs/:traderName', (req, res) => { 
    const traderName = req.params.traderName;

    const trader = activeTraders[traderName]
    if (!trader) {
        res.status(404).json({error: `Could not find active trader: ${trader}`})
    }

    res.json(trader.logs)
});

/* Post requests */
app.post('/api/stop/:traderName', (req, res) => {
    const traderName = req.params.traderName;

    const trader = activeTraders[traderName]
    if (!trader) {
        res.status(404).json({error: `Could not find active trader: ${trader}`});
    }

    trader.stop();
    res.json({message: "Successfully stopped trader."});
})

app.post('/api/start/:traderName', (req, res) => {
    const traderName = req.params.traderName;
    const trader = newTrader(traderName, false)

    if (!trader) {
        res.status(400).json({error: "Internal server error."})
    }

    trader.run();
    res.json({message: "Successfully started trader."});
})

app.post('/api/kill/:traderName', (req, res) => {
    const traderName = req.params.traderName;
    killTrader(traderName);

    res.json({message: "Successfully killed trader."});
})

app.post('/api/restart/:traderName', (req, res) => {
    const traderName = req.params.traderName;
    killTrader(traderName);
    newTrader(traderName);

    res.json({message: "Successfully restarted trader."});
})

/* Start Server */
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
