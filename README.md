# AutoTrader
*Powered by AlpacaAPI*

## Available Trading Strategies
1. Mean Reversion
2. Long-Short

## Configuration
Ensure you have a file named `trader.json` within the `src/Account` directory. Fill it with your details in the following format:

```json 
{
  "traders": {
    "TradingBotName": {
      "strategy": "TRADING_STRATEGY_HERE",
      "apiKey": "YOUR_KEY_HERE",
      "apiSecret": "YOUR_SECRET_HERE",
      "paper": true,
      "bucketPct": 0.25,
      "symbols": [
        "AAPL"
      ]
    }
  }
}
```

**Note:** You can create multiple accounts with different keys.

## Endpoints

**GET**
`localhost:3000/api/status/YOUR_TRADER_NAME_HERE`
- Returns status: "Online" || "Idle" || "Offline"

**GET**
`localhost:3000/api/traders`
- Returns ALL trader profiles.

**POST**
`localhost:3000/api/start/YOUR_TRADER_NAME_HERE`
- Returns code

To start the bot, simply run the following command in your terminal, or open the `.bat` file under the main project directory:

```
npm start
```
