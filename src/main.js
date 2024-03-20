const express = require('express');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const { getTraderProfile } = require('./Accounts/traderStore');
const { activeTraders, newTrader } = require('./Traders/traders');

dotenv.config();

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Just broken.');
});

app.get('/api/traders', (req, res) => {
    try {
        const profiles = getTraderProfile();
        res.json(profiles);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/api/status/:traderName', (req, res) => {
    try {
        const traderName = req.params.traderName;
        const data = {
            status: 'Unknown',
            lastChecked: undefined,
        };

        const trader = activeTraders[traderName];
        if (trader) {
            data.status = trader.status;
            data.lastChecked = trader.lastUpdated;
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/api/start/:traderName', (req, res) => {
    try {
        const traderName = req.params.traderName;
        const trader = newTrader(traderName, false);

        if (!trader) {
            res.status(400).json({ error: 'Internal server error.' });
        }

        trader.run();
        res.json({ message: 'Successfully started trader.' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
